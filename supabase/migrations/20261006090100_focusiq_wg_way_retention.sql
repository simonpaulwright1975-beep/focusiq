-- Retention for "Live the Walter Geering Way": sittings are deleted 24 months
-- after they were taken, by the same nightly apply_retention() as the FocusiQ
-- assessment (privacy notice, "How long we keep it"). Replaces the function
-- from 20261005090300_focusiq_retention.sql with the WG Way step added.

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
  n_wg_way int;
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

  -- Live the Walter Geering Way sittings (answers, scores, sharing) older than the period.
  delete from focusiq.wg_way_sittings w where coalesce(w.submitted_at, w.started_at) < cutoff;
  get diagnostics n_wg_way = row_count;

  counts := jsonb_build_object('assessments_deleted', n_assessments, 'snapshots_deleted', n_snapshots, 'wg_way_sittings_deleted', n_wg_way, 'cutoff', cutoff);
  if n_assessments + n_snapshots + n_wg_way > 0 then
    -- Counts only: no names, answers or results in the audit log.
    insert into focusiq.benchmark_audit_log (action, target_type, target_id, actor_id, reason, details)
    values ('retention_applied', 'benchmark', 'retention', null, 'Retention period reached (24 months)', counts);
  end if;
  perform set_config('focusiq.retention_purge', 'off', true);
  return counts;
end $$;

revoke all on function focusiq.apply_retention(interval) from public, anon, authenticated;

-- Schedule (pg_cron, like the other FocusiQ jobs; see docs/going-live.md):
--   select cron.schedule('focusiq-retention', '5 3 * * *', 'select focusiq.apply_retention()');
