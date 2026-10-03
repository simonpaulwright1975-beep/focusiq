set search_path = focusiq;

-- Director decisions on adjustment requests.
--
-- Requests may contain health information: decisions are made only through
-- decide_adjustment_request() (Directors / authorised users), every decision
-- and revision is kept in an append-only history, and internal notes live
-- only in that Director-only history – never on the row the employee can read.

alter table focusiq.adjustment_requests
  add column if not exists arrangements text[] not null default '{}',
  add column if not exists employee_message text;

alter table focusiq.adjustment_requests drop constraint if exists adjustment_requests_arrangements_check;
alter table focusiq.adjustment_requests add constraint adjustment_requests_arrangements_check
  check (arrangements <@ array['extra_time', 'rest_breaks', 'larger_text', 'screen_reader', 'quiet_room', 'paper_version', 'other']::text[]);

-- The employee can read their own request row, so it must hold no internal note.
alter table focusiq.adjustment_requests drop column if exists decision_note;

create table if not exists focusiq.adjustment_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references focusiq.adjustment_requests (id) on delete restrict,
  status text not null check (status in ('agreed', 'declined')),
  arrangements text[] not null default '{}',
  time_multiplier numeric check (time_multiplier is null or (time_multiplier > 1 and time_multiplier <= 3)),
  employee_message text not null check (btrim(employee_message) <> ''),
  internal_note text,
  revision_reason text,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  check (status = 'agreed' or (cardinality(arrangements) = 0 and time_multiplier is null)),
  check (status = 'declined' or cardinality(arrangements) > 0),
  check ((time_multiplier is not null) = ('extra_time' = any (arrangements)))
);
create index if not exists adjustment_decisions_request_idx on focusiq.adjustment_decisions (request_id, decided_at);

drop trigger if exists adjustment_decisions_append_only on focusiq.adjustment_decisions;
create trigger adjustment_decisions_append_only before update or delete on focusiq.adjustment_decisions
  for each row execute function focusiq.focusiq_append_only();

-- Audit-log vocabulary for decisions (no health details are copied into the log).
alter table focusiq.benchmark_audit_log drop constraint if exists benchmark_audit_log_action_check;
alter table focusiq.benchmark_audit_log add constraint benchmark_audit_log_action_check check (action in (
  'employee_excluded', 'employee_restored',
  'assessment_excluded', 'assessment_restored',
  'assessment_validity_changed', 'assessment_adjustment_flagged', 'assessment_adjustment_reviewed',
  'adjustment_request_decided',
  'cohort_changed', 'benchmark_recalculated', 'role_changed', 'snapshot_saved'
));
alter table focusiq.benchmark_audit_log drop constraint if exists benchmark_audit_log_target_type_check;
alter table focusiq.benchmark_audit_log add constraint benchmark_audit_log_target_type_check check (target_type in (
  'employee', 'assessment', 'cohort', 'benchmark', 'user', 'snapshot', 'report', 'adjustment_request'
));

create or replace function focusiq.decide_adjustment_request(
  p_request_id uuid,
  p_status text,
  p_arrangements text[],
  p_time_multiplier numeric,
  p_employee_message text,
  p_internal_note text default null,
  p_revision_reason text default null
) returns void
language plpgsql security definer set search_path = focusiq as $$
declare
  r focusiq.adjustment_requests;
  arr text[] := case when p_status = 'agreed' then coalesce(p_arrangements, '{}') else '{}' end;
  mult numeric := case when p_status = 'agreed' and 'extra_time' = any (coalesce(p_arrangements, '{}')) then p_time_multiplier end;
begin
  if not focusiq.can_alter_benchmark_inclusion() then
    raise exception 'Only Directors can decide adjustment requests.';
  end if;
  select * into r from focusiq.adjustment_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' and coalesce(btrim(p_revision_reason), '') = '' then
    raise exception 'Give a reason for changing the earlier decision.';
  end if;

  insert into focusiq.adjustment_decisions
    (request_id, status, arrangements, time_multiplier, employee_message, internal_note, revision_reason, decided_by)
  values
    (r.id, p_status, arr, mult, btrim(p_employee_message), nullif(btrim(p_internal_note), ''),
     case when r.status = 'pending' then null else btrim(p_revision_reason) end, auth.uid());

  update focusiq.adjustment_requests
  set status = p_status, arrangements = arr, time_multiplier = mult,
      employee_message = btrim(p_employee_message), decided_by = auth.uid(), decided_at = now()
  where id = r.id;

  insert into focusiq.benchmark_audit_log (action, target_type, target_id, actor_id, reason, details)
  values ('adjustment_request_decided', 'adjustment_request', r.id::text, auth.uid(),
          coalesce(nullif(btrim(p_revision_reason), ''), 'Initial decision'),
          jsonb_build_object('employee_id', r.employee_id, 'from', r.status, 'to', p_status,
                             'arrangements', arr, 'time_multiplier', mult));
end $$;

revoke all on function focusiq.decide_adjustment_request(uuid, text, text[], numeric, text, text, text) from public;
grant execute on function focusiq.decide_adjustment_request(uuid, text, text[], numeric, text, text, text) to authenticated;

-- Decisions go through the function only.
drop policy if exists adjustment_requests_decide on focusiq.adjustment_requests;

alter table focusiq.adjustment_decisions enable row level security;
drop policy if exists adjustment_decisions_director_read on focusiq.adjustment_decisions;
create policy adjustment_decisions_director_read on focusiq.adjustment_decisions
  for select using (focusiq.can_alter_benchmark_inclusion());
