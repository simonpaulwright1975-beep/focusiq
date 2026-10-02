-- FocusiQ Employee Insight & Business Support (Insight spec §201–§235).
--
-- Insights are generated from response evidence by versioned interpretation
-- rules (src/insight). Findings keep their evidence and exercise ids so every
-- statement can be traced ("View Evidence"). Issued insight reports are
-- frozen; employees can read only their own constructive summary.

comment on column public.question_versions.scoring_meta is
  'Insight metadata per exercise: family, dimension, modality (text|visual|numerical|verbal|scenario), risk (low|high), '
  'multiStage, priorityContext (defined|competing), customerImpactScenario, commercial, and option lists '
  'unnecessaryEscalationOptions / outcomeActionOptions / nextActionOptions / routineOverOpportunityOptions.';

-- §210 Motivation profile (ranked, most → least motivating).
create table if not exists public.motivation_profiles (
  assessment_id uuid primary key references public.assessments (id) on delete restrict,
  ranked text[] not null check (
    cardinality(ranked) >= 2 and ranked <@ array[
      'progression', 'recognition', 'autonomy', 'financial_reward',
      'security', 'mastery', 'team', 'customer_impact'
    ]::text[]
  ),
  captured_at timestamptz not null default now()
);

-- §203 Findings with traceable evidence.
create table if not exists public.insight_findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  interpretation_version_id text not null references public.interpretation_versions (id),
  pattern_key text not null,
  kind text not null check (kind in ('strength', 'development', 'style')),
  insight text not null,
  confidence text not null check (confidence in ('Moderate', 'High')),
  evidence_count int not null,
  consistent_count int,
  -- [{label, exerciseIds[]}] – exerciseIds are assessment_presentations ids.
  evidence jsonb not null,
  measures jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (assessment_id, interpretation_version_id, pattern_key)
);

-- Patterns considered but not concluded (insufficient evidence) – recorded for honesty.
create table if not exists public.insight_not_concluded (
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  interpretation_version_id text not null references public.interpretation_versions (id),
  pattern_key text not null,
  reason text not null,
  primary key (assessment_id, interpretation_version_id, pattern_key)
);

-- Frozen Director insight report and the employee-facing summary.
create table if not exists public.employee_insight_reports (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  interpretation_version_id text not null references public.interpretation_versions (id),
  report_version_id text not null references public.report_versions (id),
  director_report jsonb not null,   -- InsightReport (four questions, §234 structure, …)
  employee_facing jsonb not null,   -- constructive summary only (§233)
  generated_by uuid not null default auth.uid(),
  generated_at timestamptz not null default now()
);

-- §226–§227 organisation-level observations (groups below minimum size are never stored).
create table if not exists public.organisation_insights (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  pattern_key text not null,
  member_count int not null,
  group_size int not null check (group_size >= 5),
  share numeric not null,
  observation text not null,
  interpretation text not null,
  suggested_response text not null,
  employee_ids uuid[] not null,     -- Director drill-down only
  interpretation_version_id text not null references public.interpretation_versions (id),
  generated_by uuid not null default auth.uid(),
  generated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['insight_findings', 'insight_not_concluded', 'employee_insight_reports', 'organisation_insights'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.focusiq_append_only()',
      t || '_append_only', t);
  end loop;
end $$;

-- §229–§231 Turning insight into action: prioritised, categorised, tracked.
create table if not exists public.insight_actions (
  id uuid primary key default gen_random_uuid(),
  -- An action is for one employee (individual report) or a group (organisation insight).
  employee_id uuid references public.employees (id) on delete restrict,
  organisation_insight_id uuid references public.organisation_insights (id) on delete restrict,
  source_report_id uuid references public.employee_insight_reports (id) on delete restrict,
  recommendation_id text not null,
  title text not null,
  category text not null check (category in (
    'Coaching', 'Training', 'Process Change', 'Management Style', 'Tools / Automation',
    'Work Prioritisation', 'Role Clarity', 'Decision Authority', 'Commercial Education',
    'Recognition / Motivation', 'Development Opportunity'
  )),
  target text not null check (target in ('employee', 'management', 'business')),
  priority int check (priority between 1 and 3),
  impact text not null check (impact in ('High', 'Medium', 'Low')),
  effort text not null check (effort in ('High', 'Medium', 'Low')),
  linked_findings text[] not null default '{}',
  status text not null default 'proposed'
    check (status in ('proposed', 'agreed', 'in_progress', 'done', 'declined')),
  owner uuid,
  due_date date,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(employee_id, organisation_insight_id) = 1)
);

alter table public.motivation_profiles enable row level security;
alter table public.insight_findings enable row level security;
alter table public.insight_not_concluded enable row level security;
alter table public.employee_insight_reports enable row level security;
alter table public.organisation_insights enable row level security;
alter table public.insight_actions enable row level security;

-- Director-only read and write; findings and reports are append-only.
do $$
declare t text;
begin
  foreach t in array array[
    'motivation_profiles', 'insight_findings', 'insight_not_concluded',
    'employee_insight_reports', 'organisation_insights', 'insight_actions'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_director', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_director()) with check (public.is_director())',
      t || '_director', t);
  end loop;
end $$;

-- Employees record their own motivation responses while the assessment is open.
drop policy if exists motivation_profiles_own_insert on public.motivation_profiles;
create policy motivation_profiles_own_insert on public.motivation_profiles
  for insert with check (
    public.owns_assessment(assessment_id)
    and not exists (select 1 from public.assessments a where a.id = assessment_id and a.complete)
  );

-- §233 Employees see only their constructive summary – never the Director report.
create or replace function public.my_insight_summaries()
returns table (assessment_id uuid, generated_at timestamptz, employee_facing jsonb)
language sql stable security definer set search_path = public as $$
  select r.assessment_id, r.generated_at, r.employee_facing
  from public.employee_insight_reports r
  join public.employees e on e.id = r.employee_id
  where e.user_id = auth.uid()
  order by r.generated_at desc
$$;
revoke all on function public.my_insight_summaries() from public;
grant execute on function public.my_insight_summaries() to authenticated;
