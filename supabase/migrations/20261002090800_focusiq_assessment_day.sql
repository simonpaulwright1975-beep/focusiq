-- Assessment day: plan a single office day and follow it live. Director-only.
--
-- assessment_days            – the day's settings (seats, times, lengths)
-- assessment_day_assignments – sessions a Director has fixed for each person
-- assessment_day_readiness() – per active employee: acknowledgement, adjustment
--                              outcome, open objection/correction and progress.
--
-- The readiness function returns agreed arrangements and the time multiplier
-- only: never adjustment request text or internal notes (they may contain
-- health information). The session plan itself is computed by
-- src/participation/readiness.ts.

create table if not exists public.assessment_days (
  id uuid primary key default gen_random_uuid(),
  day_date date not null unique,
  first_start time not null default '09:30',
  end_by time not null default '17:00',
  seats int not null default 8 check (seats >= 1),
  quiet_seats int not null default 1 check (quiet_seats >= 0),
  assessment_minutes int not null check (assessment_minutes between 1 and 240),
  settling_minutes int not null default 10 check (settling_minutes between 0 and 60),
  session_minutes int check (session_minutes between 15 and 480), -- null = suggested automatically
  gap_minutes int not null default 15 check (gap_minutes between 0 and 120),
  rest_break_minutes int not null default 10 check (rest_break_minutes between 0 and 60),
  lunch_start time,
  lunch_minutes int not null default 0 check (lunch_minutes between 0 and 120),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_start < end_by)
);

create table if not exists public.assessment_day_assignments (
  day_id uuid not null references public.assessment_days (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  session_number int not null check (session_number >= 1),
  fixed_by uuid not null default auth.uid(),
  fixed_at timestamptz not null default now(),
  primary key (day_id, employee_id)
);

alter table public.assessment_days enable row level security;
alter table public.assessment_day_assignments enable row level security;
do $$
declare t text;
begin
  foreach t in array array['assessment_days', 'assessment_day_assignments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_director', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_director()) with check (public.is_director())',
      t || '_director', t);
  end loop;
end $$;

create or replace function public.assessment_day_readiness(p_day_id uuid)
returns table (
  employee_id uuid,
  display_name text,
  department text,
  job_role text,
  acknowledged_current boolean,
  acknowledged_any boolean,
  details_correct boolean,
  adjustment_status text,
  arrangements text[],
  time_multiplier numeric,
  objection_open boolean,
  correction_open boolean,
  fixed_session int,
  started_at timestamptz,
  last_activity_at timestamptz,
  answered int,
  completed_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  d assessment_days;
  notice text := (select version from public.current_privacy_notice());
begin
  if not public.is_director() then raise exception 'Only Directors can view assessment-day readiness.'; end if;
  select * into d from assessment_days where id = p_day_id;
  if not found then raise exception 'Assessment day not found.'; end if;
  return query
  select
    e.id,
    e.display_name,
    e.department,
    e.job_role,
    exists (select 1 from participation_acknowledgements pa where pa.employee_id = e.id and pa.notice_version = notice),
    exists (select 1 from participation_acknowledgements pa where pa.employee_id = e.id),
    (select pa.details_correct from participation_acknowledgements pa where pa.employee_id = e.id order by pa.acknowledged_at desc limit 1),
    adj.status,
    case when adj.status = 'agreed' then adj.arrangements end,
    case when adj.status = 'agreed' then adj.time_multiplier end,
    exists (select 1 from rights_requests r where r.employee_id = e.id and r.request_type = 'objection' and r.status <> 'closed'),
    exists (select 1 from rights_requests r where r.employee_id = e.id and r.request_type = 'correction' and r.status <> 'closed'),
    asg.session_number,
    a.started_at,
    (select max(ev.occurred_at) from response_events ev where ev.assessment_id = a.id),
    (select count(distinct ev.presentation_id)::int from response_events ev where ev.assessment_id = a.id and ev.event_type = 'answer_submitted'),
    a.completed_at
  from employees e
  left join lateral (
    select ar.status, ar.arrangements, ar.time_multiplier
    from adjustment_requests ar where ar.employee_id = e.id
    order by ar.created_at desc limit 1
  ) adj on true
  left join assessment_day_assignments asg on asg.day_id = d.id and asg.employee_id = e.id
  -- The assessment taken on the day (UK time).
  left join lateral (
    select x.id, x.started_at, x.completed_at
    from assessments x
    where x.employee_id = e.id
      and (coalesce(x.started_at, x.created_at) at time zone 'Europe/London')::date = d.day_date
    order by x.created_at desc limit 1
  ) a on true
  where e.status = 'active'
  order by e.department, e.display_name;
end $$;

revoke all on function public.assessment_day_readiness(uuid) from public;
grant execute on function public.assessment_day_readiness(uuid) to authenticated;
