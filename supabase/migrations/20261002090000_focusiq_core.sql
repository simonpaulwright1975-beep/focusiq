-- FocusiQ core tables required by the benchmarking engine.
-- Written with IF NOT EXISTS so it can sit alongside an existing FocusiQ schema;
-- align column names if the live project already defines these tables.
--
-- §199: no protected characteristics (age, sex, disability, …) are stored here.

create extension if not exists pgcrypto;

-- Directors / Super Admins / Managers / Employees. `user_id` is the Supabase auth user.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('director', 'super_admin', 'manager', 'employee')),
  -- §184: a manager may only alter benchmark inclusion when specifically authorised.
  benchmark_authority boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null,
  department text not null
    check (department in ('Sales', 'Marketing', 'Customer Service', 'Stock Control', 'Finance')),
  job_role text,
  status text not null default 'active' check (status in ('active', 'former', 'test')),
  start_date date not null,
  left_date date,
  created_at timestamptz not null default now(),
  check (status <> 'former' or left_date is not null)
);

create table if not exists public.metrics (
  key text primary key,
  label text not null,
  unit text not null check (unit in ('score', 'percent', 'seconds', 'rate')),
  higher_is_better boolean not null default true,
  -- §168
  company_comparable boolean not null default false,
  department_comparable boolean not null default true,
  core_dimension boolean not null default false
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  version text not null,
  assessment_type text not null default 'full' check (assessment_type in ('full', 'micro', 'pilot')),
  completed_at timestamptz,
  complete boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists assessments_employee_idx on public.assessments (employee_id, completed_at);

create table if not exists public.assessment_scores (
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  metric_key text not null references public.metrics (key),
  raw_value numeric not null,
  -- §169 difficulty-normalised value (T-score), once calibration allows it.
  normalised_value numeric,
  primary key (assessment_id, metric_key)
);

-- Role helpers (security definer so they work inside RLS policies).
create or replace function public.current_focusiq_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

create or replace function public.is_director()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('director', 'super_admin') from public.user_roles where user_id = auth.uid()), false)
$$;

-- §184 Benchmark locking.
create or replace function public.can_alter_benchmark_inclusion()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role in ('director', 'super_admin') or (role = 'manager' and benchmark_authority)
    from public.user_roles where user_id = auth.uid()
  ), false)
$$;

alter table public.user_roles enable row level security;
alter table public.employees enable row level security;
alter table public.metrics enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;

drop policy if exists user_roles_self_or_director on public.user_roles;
create policy user_roles_self_or_director on public.user_roles
  for select using (user_id = auth.uid() or public.is_director());

drop policy if exists metrics_read on public.metrics;
create policy metrics_read on public.metrics for select using (auth.role() = 'authenticated');

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees
  for select using (user_id = auth.uid() or public.is_director());

drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments
  for select using (
    public.is_director()
    or employee_id in (select id from public.employees where user_id = auth.uid())
  );

drop policy if exists assessment_scores_read on public.assessment_scores;
create policy assessment_scores_read on public.assessment_scores
  for select using (
    public.is_director()
    or assessment_id in (
      select a.id from public.assessments a
      join public.employees e on e.id = a.employee_id
      where e.user_id = auth.uid()
    )
  );

-- Metric catalogue (keys match src/benchmarking/metrics.ts).
insert into public.metrics (key, label, unit, higher_is_better, company_comparable, department_comparable, core_dimension) values
  ('think', 'Think', 'score', true, true, true, true),
  ('absorb', 'Absorb', 'score', true, true, true, true),
  ('remember', 'Remember', 'score', true, true, true, true),
  ('prioritise', 'Prioritise', 'score', true, true, true, true),
  ('decide', 'Decide', 'score', true, true, true, true),
  ('act', 'Act', 'score', true, true, true, true),
  ('own', 'Own', 'score', true, true, true, true),
  ('drive', 'Drive', 'score', true, true, true, true),
  ('complete', 'Complete', 'score', true, true, true, true),
  ('focus', 'Focus', 'score', true, true, true, true),
  ('decision_efficiency', 'Decision Efficiency', 'score', true, true, true, false),
  ('decision_confidence', 'Decision Confidence', 'score', true, true, true, false),
  ('information_retention', 'Information Retention', 'score', true, true, true, false),
  ('accuracy', 'Accuracy', 'percent', true, true, true, false),
  ('avg_response_seconds', 'Average Response Time', 'seconds', false, true, true, false),
  ('recheck_rate', 'Re-check Rate', 'percent', false, true, true, false),
  ('unnecessary_recheck_rate', 'Unnecessary Re-checking', 'percent', false, true, true, false),
  ('unnecessary_review_seconds', 'Unnecessary Review Time', 'seconds', false, true, true, false),
  ('timed_performance', 'Timed Performance', 'score', true, true, true, false),
  ('untimed_performance', 'Untimed Performance', 'score', true, true, true, false),
  ('assessment_reliability', 'Assessment Reliability', 'score', true, true, true, false),
  ('commercial_awareness', 'Commercial Awareness', 'score', true, false, true, false),
  ('customer_judgement', 'Customer Judgement', 'score', true, false, true, false),
  ('target_ownership', 'Target Ownership', 'score', true, false, true, false)
on conflict (key) do nothing;
