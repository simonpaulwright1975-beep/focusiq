-- Leader expectations: Directors, managers and team leaders can be measured
-- against stricter FocusiQ thresholds (src/benchmarking/metrics.ts:
-- LEADER_SCORE_BANDS). A Director chooses who is on them in the Staff tab.

alter table focusiq.employees
  add column if not exists expectations text not null default 'standard'
  check (expectations in ('standard', 'leader'));
comment on column focusiq.employees.expectations is
  'FocusiQ expectations this person is measured against: standard or leader (set by a Director)';

create or replace function focusiq.set_employee_expectations(p_employee_id uuid, p_expectations text)
returns void language plpgsql security definer set search_path = focusiq as $$
begin
  if not focusiq.is_director() then raise exception 'Only Directors can change expectations.'; end if;
  if p_expectations is null or p_expectations not in ('standard', 'leader') then
    raise exception 'Expectations must be standard or leader.';
  end if;
  update focusiq.employees set expectations = p_expectations where id = p_employee_id;
  if not found then raise exception 'That person is not in FocusiQ.'; end if;
end $$;

revoke all on function focusiq.set_employee_expectations(uuid, text) from public;
grant execute on function focusiq.set_employee_expectations(uuid, text) to authenticated;
