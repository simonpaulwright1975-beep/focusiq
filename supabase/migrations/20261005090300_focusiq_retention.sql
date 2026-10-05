-- Retention: assessment information is kept for 24 months from the date of the
-- assessment and then deleted automatically (privacy notice, "How long we keep
-- it"). apply_retention() runs nightly from pg_cron.
--
-- Most of this evidence is append-only or immutable, and the guards stay in
-- force for everyone else: they let a delete through only while
-- apply_retention() is running (a transaction-local flag that only takes
-- effect when the trigger runs as the function's owner).
--
-- Deleted for each expired assessment: answers and interaction events,
-- question presentations, scores, validity, adjustments flags, benchmark
-- exclusions, insight findings, motivation profile, reports, released
-- summaries (with reads and withdrawals). Management actions created from a
-- report are kept but unlinked from it. Frozen benchmark snapshots older than
-- 24 months that no report uses any more are deleted too.
-- Kept: the person's FocusiQ record, privacy acknowledgements, adjustment
-- requests and data-rights requests (records of how requests were handled).

create or replace function focusiq.retention_purge_active()
returns boolean language sql stable set search_path = focusiq as $$
  select coalesce(current_setting('focusiq.retention_purge', true), '') = 'on'
     and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
                          where p.proname = 'apply_retention' and p.pronamespace = 'focusiq'::regnamespace limit 1)
$$;

create or replace function focusiq.focusiq_append_only()
returns trigger language plpgsql set search_path = focusiq as $$
begin
  if tg_op = 'DELETE' and focusiq.retention_purge_active() then return old; end if;
  raise exception '% is append-only evidence and cannot be changed or deleted', tg_table_name;
end $$;

create or replace function focusiq.assessment_scores_immutable()
returns trigger language plpgsql set search_path = focusiq as $$
begin
  if tg_op = 'DELETE' and focusiq.retention_purge_active() then return old; end if;
  raise exception 'Scores are immutable – re-score under a new scoring version.';
end $$;

create or replace function focusiq.benchmark_snapshot_immutable()
returns trigger language plpgsql set search_path = focusiq as $$
begin
  if tg_op = 'DELETE' and focusiq.retention_purge_active() then return old; end if;
  raise exception '% is frozen and cannot be altered (§171).', tg_table_name;
end $$;

create or replace function focusiq.assessment_adjustments_guard()
returns trigger language plpgsql set search_path = focusiq as $$
begin
  if tg_op = 'DELETE' then
    if focusiq.retention_purge_active() then return old; end if;
    raise exception 'Adjusted assessment records are never deleted.';
  end if;
  if (new.assessment_id, new.description, new.recorded_by, new.recorded_at)
     is distinct from (old.assessment_id, old.description, old.recorded_by, old.recorded_at) then
    raise exception 'Only the comparability decision may be updated on an adjusted assessment.';
  end if;
  return new;
end $$;

create or replace function focusiq.benchmark_eligibility_guard()
returns trigger language plpgsql set search_path = focusiq as $$
begin
  if tg_op = 'DELETE' then
    if focusiq.retention_purge_active() then return old; end if;
    raise exception 'Benchmark exclusions are never deleted – restore them instead (§183).';
  end if;
  if old.restored_at is not null then
    raise exception 'This exclusion has already been restored; create a new exclusion if required.';
  end if;
  if (new.employee_id, new.assessment_id, new.exclusion_reason, new.exclusion_note, new.excluded_by, new.excluded_at)
     is distinct from
     (old.employee_id, old.assessment_id, old.exclusion_reason, old.exclusion_note, old.excluded_by, old.excluded_at) then
    raise exception 'Only restoration details may be updated on a benchmark exclusion.';
  end if;
  return new;
end $$;

alter table focusiq.benchmark_audit_log drop constraint if exists benchmark_audit_log_action_check;
alter table focusiq.benchmark_audit_log add constraint benchmark_audit_log_action_check check (action = any (array[
  'employee_excluded', 'employee_restored', 'assessment_excluded', 'assessment_restored', 'assessment_validity_changed',
  'assessment_adjustment_flagged', 'assessment_adjustment_reviewed', 'adjustment_request_decided', 'cohort_changed',
  'benchmark_recalculated', 'role_changed', 'snapshot_saved', 'retention_applied']));

create or replace function focusiq.apply_retention(p_keep interval default interval '24 months')
returns jsonb language plpgsql security definer set search_path = focusiq as $$
declare
  cutoff timestamptz := now() - p_keep;
  expired uuid[];
  reports uuid[];
  releases uuid[];
  counts jsonb;
  n_assessments int;
  n_snapshots int;
begin
  perform set_config('focusiq.retention_purge', 'on', true);

  expired := array(select id from focusiq.assessments where coalesce(completed_at, started_at, created_at) < cutoff);
  reports := array(select id from focusiq.employee_insight_reports where assessment_id = any(expired));
  releases := array(select id from focusiq.summary_releases where assessment_id = any(expired) or report_id = any(reports));

  delete from focusiq.summary_reads where release_id = any(releases);
  delete from focusiq.summary_withdrawals where release_id = any(releases);
  delete from focusiq.summary_releases where id = any(releases);
  update focusiq.insight_actions set source_report_id = null where source_report_id = any(reports);
  delete from focusiq.employee_insight_reports where id = any(reports);
  delete from focusiq.insight_findings where assessment_id = any(expired);
  delete from focusiq.insight_not_concluded where assessment_id = any(expired);
  delete from focusiq.motivation_profiles where assessment_id = any(expired);
  delete from focusiq.employee_reports where assessment_id = any(expired);
  delete from focusiq.assessment_scores where assessment_id = any(expired);
  delete from focusiq.assessment_validity where assessment_id = any(expired);
  delete from focusiq.assessment_adjustments where assessment_id = any(expired);
  delete from focusiq.benchmark_eligibility where assessment_id = any(expired);
  delete from focusiq.response_events where assessment_id = any(expired);
  delete from focusiq.assessment_presentations where assessment_id = any(expired);
  delete from focusiq.assessments where id = any(expired);
  get diagnostics n_assessments = row_count;

  delete from focusiq.benchmark_snapshots s
   where s.created_at < cutoff
     and not exists (select 1 from focusiq.employee_reports r where r.benchmark_snapshot_id = s.id);
  get diagnostics n_snapshots = row_count;

  counts := jsonb_build_object('assessments_deleted', n_assessments, 'snapshots_deleted', n_snapshots, 'cutoff', cutoff);
  if n_assessments + n_snapshots > 0 then
    -- Counts only: no names, answers or results in the audit log.
    insert into focusiq.benchmark_audit_log (action, target_type, target_id, actor_id, reason, details)
    values ('retention_applied', 'benchmark', 'retention', null, 'Retention period reached (24 months)', counts);
  end if;
  perform set_config('focusiq.retention_purge', 'off', true);
  return counts;
end $$;

revoke all on function focusiq.apply_retention(interval) from public, anon, authenticated;
revoke all on function focusiq.retention_purge_active() from public;
grant execute on function focusiq.retention_purge_active() to authenticated, service_role;

-- Schedule (pg_cron, like the other FocusiQ jobs; see docs/going-live.md):
--   select cron.schedule('focusiq-retention', '5 3 * * *', 'select focusiq.apply_retention()');
