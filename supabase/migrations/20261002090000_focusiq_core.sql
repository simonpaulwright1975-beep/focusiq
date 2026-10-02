-- FocusiQ core: people, roles, versioned content, assessments and scores.
--
-- Reconstruction principle: for any result we must be able to show exactly
-- what the employee saw and how the result was calculated. Therefore every
-- published version (assessment, question, scoring, interpretation, report
-- template, expectation set) is immutable, and scores are stored per scoring
-- version rather than overwritten.
--
-- §199: no protected characteristics (age, sex, disability, …) are stored here.
-- Written with IF NOT EXISTS so it can sit alongside an existing FocusiQ schema.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- People & roles
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Generic guard: a published version row may never change or be deleted.
-- ---------------------------------------------------------------------------
create or replace function public.focusiq_published_is_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception '% is published and cannot be deleted', tg_table_name;
    end if;
    return old;
  end if;
  if old.published_at is not null then
    -- The only change allowed after publication is retiring it.
    if (to_jsonb(new) - 'retired_at') = (to_jsonb(old) - 'retired_at') then
      return new;
    end if;
    raise exception '% is published and cannot be changed – create a new version', tg_table_name;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Versioned content
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_versions (
  id text primary key,                     -- e.g. 'focusiq-2026.1'
  title text not null,
  description text,
  definition jsonb not null default '{}'::jsonb, -- structure, timing rules, question selection rules
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.question_families (
  id text primary key,                     -- equivalent questions share a family (§169)
  dimension text not null,
  description text
);

create table if not exists public.questions (
  id text primary key,
  family_id text not null references public.question_families (id),
  created_at timestamptz not null default now()
);

create table if not exists public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id),
  version int not null,
  content jsonb not null,                  -- stem, options, media, instructions
  answer_key jsonb,
  scoring_meta jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

create table if not exists public.assessment_version_questions (
  assessment_version_id text not null references public.assessment_versions (id),
  question_version_id uuid not null references public.question_versions (id),
  pool text not null default 'core',       -- selection pool for equivalent forms
  position int,
  primary key (assessment_version_id, question_version_id)
);

create table if not exists public.scoring_versions (
  id text primary key,                     -- e.g. 'scoring/1.0.0'
  description text,
  rules jsonb not null,                    -- formulae, weights, normalisation method
  engine_version text not null,            -- code version that implements the rules
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.interpretation_versions (
  id text primary key,                     -- e.g. 'interpretation/1.0.0'
  description text,
  rules jsonb not null,                    -- wording rules, evidence thresholds
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.report_versions (
  id text primary key,                     -- e.g. 'report/1.0.0'
  description text,
  template jsonb not null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'assessment_versions', 'question_versions', 'scoring_versions',
    'interpretation_versions', 'report_versions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_immutable', t);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.focusiq_published_is_immutable()',
      t || '_immutable', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Metrics, comparability (§168) and absolute expectations
-- ---------------------------------------------------------------------------
create table if not exists public.metrics (
  key text primary key,
  label text not null,
  unit text not null check (unit in ('score', 'percent', 'seconds', 'rate')),
  higher_is_better boolean not null default true,
  -- Configurable comparability – change here, not in the scoring engine.
  company_comparable boolean not null default false,
  department_comparable boolean not null default true,
  requires_same_role boolean not null default false,
  core_dimension boolean not null default false,
  active_expectation_version text
);

-- Absolute bands: Development Opportunity / Expected / Strong.
-- Based on FocusiQ expectations for the measure, never on the cohort.
create table if not exists public.metric_expectations (
  metric_key text not null references public.metrics (key),
  version text not null,
  development_threshold numeric not null,
  strong_threshold numeric not null,
  validated boolean not null default false,
  validated_by uuid,
  validated_at timestamptz,
  evidence_note text,
  published_at timestamptz,
  primary key (metric_key, version),
  check (not validated or (validated_by is not null and validated_at is not null))
);

drop trigger if exists metric_expectations_immutable on public.metric_expectations;
create trigger metric_expectations_immutable before update or delete on public.metric_expectations
  for each row execute function public.focusiq_published_is_immutable();

-- ---------------------------------------------------------------------------
-- Assessments & scores
-- ---------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  assessment_version_id text not null references public.assessment_versions (id),
  assessment_type text not null default 'full' check (assessment_type in ('full', 'micro', 'pilot')),
  started_at timestamptz,
  completed_at timestamptz,
  complete boolean not null default false,
  -- Scoring version whose results are the "current" ones shown for this assessment.
  current_scoring_version_id text references public.scoring_versions (id),
  delivery_context jsonb not null default '{}'::jsonb, -- device, browser, locale
  created_at timestamptz not null default now()
);
create index if not exists assessments_employee_idx on public.assessments (employee_id, completed_at);

-- Scores are kept per scoring version: re-scoring adds rows, never overwrites.
create table if not exists public.assessment_scores (
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  metric_key text not null references public.metrics (key),
  scoring_version_id text not null references public.scoring_versions (id),
  raw_value numeric not null,
  -- §169 difficulty-normalised value (T-score), once calibration allows it.
  normalised_value numeric,
  normalisation_method text,
  -- Minimum question evidence within the dimension.
  evidence_count int,
  consistent_count int,
  interpretation_confidence text
    check (interpretation_confidence in ('Insufficient', 'Low', 'Moderate', 'High')),
  scored_at timestamptz not null default now(),
  primary key (assessment_id, metric_key, scoring_version_id),
  check (consistent_count is null or consistent_count <= evidence_count)
);

create or replace function public.assessment_scores_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Scores are immutable – re-score under a new scoring version.';
end $$;

drop trigger if exists assessment_scores_immutable on public.assessment_scores;
create trigger assessment_scores_immutable before update or delete on public.assessment_scores
  for each row execute function public.assessment_scores_immutable();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so they work inside RLS policies)
-- ---------------------------------------------------------------------------
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

create or replace function public.owns_assessment(p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assessments a join public.employees e on e.id = a.employee_id
    where a.id = p_assessment_id and e.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.user_roles enable row level security;
alter table public.employees enable row level security;
alter table public.assessment_versions enable row level security;
alter table public.question_families enable row level security;
alter table public.questions enable row level security;
alter table public.question_versions enable row level security;
alter table public.assessment_version_questions enable row level security;
alter table public.scoring_versions enable row level security;
alter table public.interpretation_versions enable row level security;
alter table public.report_versions enable row level security;
alter table public.metrics enable row level security;
alter table public.metric_expectations enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;

drop policy if exists user_roles_self_or_director on public.user_roles;
create policy user_roles_self_or_director on public.user_roles
  for select using (user_id = auth.uid() or public.is_director());

drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees
  for select using (user_id = auth.uid() or public.is_director());

-- Version catalogues and metric definitions are readable by any signed-in user.
-- question_versions hold answer keys, so they are Director-only; employees see
-- exactly what they were shown via assessment_presentations.rendered_content.
do $$
declare t text;
begin
  foreach t in array array[
    'assessment_versions', 'question_families', 'questions', 'assessment_version_questions',
    'scoring_versions', 'interpretation_versions', 'report_versions', 'metrics', 'metric_expectations'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_director_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_director()) with check (public.is_director())',
      t || '_director_write', t);
  end loop;
end $$;

drop policy if exists question_versions_director on public.question_versions;
create policy question_versions_director on public.question_versions
  for all using (public.is_director()) with check (public.is_director());

drop policy if exists assessments_read on public.assessments;
create policy assessments_read on public.assessments
  for select using (public.is_director() or public.owns_assessment(id));

drop policy if exists assessment_scores_read on public.assessment_scores;
create policy assessment_scores_read on public.assessment_scores
  for select using (public.is_director() or public.owns_assessment(assessment_id));

-- ---------------------------------------------------------------------------
-- Seed: metric catalogue (keys match src/benchmarking/metrics.ts)
-- ---------------------------------------------------------------------------
insert into public.metrics (key, label, unit, higher_is_better, company_comparable, department_comparable, requires_same_role, core_dimension) values
  ('think', 'Think', 'score', true, true, true, false, true),
  ('absorb', 'Absorb', 'score', true, true, true, false, true),
  ('remember', 'Remember', 'score', true, true, true, false, true),
  ('prioritise', 'Prioritise', 'score', true, true, true, false, true),
  ('decide', 'Decide', 'score', true, true, true, false, true),
  ('act', 'Act', 'score', true, true, true, false, true),
  ('own', 'Own', 'score', true, true, true, false, true),
  ('drive', 'Drive', 'score', true, true, true, false, true),
  ('complete', 'Complete', 'score', true, true, true, false, true),
  ('focus', 'Focus', 'score', true, true, true, false, true),
  ('decision_efficiency', 'Decision Efficiency', 'score', true, true, true, false, false),
  ('decision_confidence', 'Decision Confidence', 'score', true, true, true, false, false),
  ('information_retention', 'Information Retention', 'score', true, true, true, false, false),
  ('accuracy', 'Accuracy', 'percent', true, true, true, false, false),
  ('avg_response_seconds', 'Average Response Time', 'seconds', false, true, true, false, false),
  ('recheck_rate', 'Re-check Rate', 'percent', false, true, true, false, false),
  ('unnecessary_recheck_rate', 'Unnecessary Re-checking', 'percent', false, true, true, false, false),
  ('unnecessary_review_seconds', 'Unnecessary Review Time', 'seconds', false, true, true, false, false),
  ('timed_performance', 'Timed Performance', 'score', true, true, true, false, false),
  ('untimed_performance', 'Untimed Performance', 'score', true, true, true, false, false),
  ('assessment_reliability', 'Assessment Reliability', 'score', true, true, true, false, false),
  ('commercial_awareness', 'Commercial Awareness', 'score', true, false, true, false, false),
  ('customer_judgement', 'Customer Judgement', 'score', true, false, true, false, false),
  ('target_ownership', 'Target Ownership', 'score', true, false, true, false, false)
on conflict (key) do nothing;

-- Provisional (unvalidated) expectation bands – replace with validated versions.
insert into public.metric_expectations (metric_key, version, development_threshold, strong_threshold, validated)
select key, 'expectations/provisional-2026-10', 60, 75, false
from public.metrics
where unit = 'score' and key <> 'assessment_reliability'
on conflict do nothing;
insert into public.metric_expectations (metric_key, version, development_threshold, strong_threshold, validated) values
  ('accuracy', 'expectations/provisional-2026-10', 75, 90, false),
  ('recheck_rate', 'expectations/provisional-2026-10', 40, 15, false),
  ('unnecessary_recheck_rate', 'expectations/provisional-2026-10', 35, 15, false)
on conflict do nothing;
update public.metrics m set active_expectation_version = 'expectations/provisional-2026-10'
where active_expectation_version is null
  and exists (select 1 from public.metric_expectations e where e.metric_key = m.key);
