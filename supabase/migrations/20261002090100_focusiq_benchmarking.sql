-- FocusiQ benchmarking, comparison & cohort management (§149–§203).
--
-- Golden rule (§203): KEEP THE DATA · CONTROL THE POPULATION ·
-- RECORD THE REASON · MAKE THE DECISION AUDITABLE.
-- Nothing in this migration deletes assessment evidence; exclusions and
-- restorations are recorded rows, and the audit log is append-only.

-- ---------------------------------------------------------------------------
-- §185 Benchmark audit log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.benchmark_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in (
    'employee_excluded', 'employee_restored',
    'assessment_excluded', 'assessment_restored',
    'assessment_validity_changed', 'cohort_changed',
    'benchmark_recalculated', 'role_changed', 'snapshot_saved'
  )),
  target_type text not null check (target_type in ('employee', 'assessment', 'cohort', 'benchmark', 'user', 'snapshot')),
  target_id text not null,
  actor_id uuid,                       -- Who
  at timestamptz not null default now(), -- When
  reason text not null,                -- Why
  note text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists benchmark_audit_target_idx on public.benchmark_audit_log (target_type, target_id, at);

create or replace function public.benchmark_audit_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'benchmark_audit_log is append-only';
end $$;

drop trigger if exists benchmark_audit_no_change on public.benchmark_audit_log;
create trigger benchmark_audit_no_change
  before update or delete on public.benchmark_audit_log
  for each row execute function public.benchmark_audit_append_only();

-- ---------------------------------------------------------------------------
-- §151–§153, §183 Benchmark eligibility
-- One row per exclusion decision. Restoring sets restored_* – rows are never
-- deleted, so the full history of decisions is preserved.
-- ---------------------------------------------------------------------------
create table if not exists public.benchmark_eligibility (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  -- Null = whole-employee exclusion (§153 Exclude Employee);
  -- set = single-assessment exclusion (§153 Exclude Assessment).
  assessment_id uuid references public.assessments (id) on delete restrict,
  included boolean not null default false,
  exclusion_reason text not null check (exclusion_reason in (
    'test_account', 'pilot_user', 'incomplete_assessment', 'technical_failure',
    'duplicate_assessment', 'assessment_invalidated', 'reasonable_adjustment', 'other'
  )),
  exclusion_note text,
  excluded_by uuid not null default auth.uid(),
  excluded_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid,
  restore_reason text,
  -- §152: "Other" requires an explanatory note.
  check (exclusion_reason <> 'other' or coalesce(btrim(exclusion_note), '') <> ''),
  -- A restoration must record who and why.
  check (restored_at is null or (restored_by is not null and coalesce(btrim(restore_reason), '') <> '')),
  check (included = (restored_at is not null))
);

-- At most one active exclusion per employee / per assessment.
create unique index if not exists benchmark_eligibility_active_employee
  on public.benchmark_eligibility (employee_id) where assessment_id is null and restored_at is null;
create unique index if not exists benchmark_eligibility_active_assessment
  on public.benchmark_eligibility (assessment_id) where assessment_id is not null and restored_at is null;

-- Only the restoration columns may change after insert; rows cannot be deleted.
create or replace function public.benchmark_eligibility_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
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

drop trigger if exists benchmark_eligibility_guard on public.benchmark_eligibility;
create trigger benchmark_eligibility_guard
  before update or delete on public.benchmark_eligibility
  for each row execute function public.benchmark_eligibility_guard();

create or replace function public.benchmark_eligibility_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_kind text := case when new.assessment_id is null then 'employee' else 'assessment' end;
  target text := coalesce(new.assessment_id, new.employee_id)::text;
begin
  if tg_op = 'INSERT' then
    insert into public.benchmark_audit_log (action, target_type, target_id, actor_id, at, reason, note, details)
    values (target_kind || '_excluded', target_kind, target, new.excluded_by, new.excluded_at,
            new.exclusion_reason, new.exclusion_note, jsonb_build_object('eligibility_id', new.id));
  elsif new.restored_at is not null and old.restored_at is null then
    insert into public.benchmark_audit_log (action, target_type, target_id, actor_id, at, reason, details)
    values (target_kind || '_restored', target_kind, target, new.restored_by, new.restored_at,
            new.restore_reason, jsonb_build_object('eligibility_id', new.id, 'previous_reason', old.exclusion_reason));
  end if;
  return new;
end $$;

drop trigger if exists benchmark_eligibility_audit on public.benchmark_eligibility;
create trigger benchmark_eligibility_audit
  after insert or update on public.benchmark_eligibility
  for each row execute function public.benchmark_eligibility_audit();

-- ---------------------------------------------------------------------------
-- §202 assessment_validity
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_validity (
  assessment_id uuid primary key references public.assessments (id) on delete restrict,
  status text not null default 'valid'
    check (status in ('valid', 'review_required', 'invalidated', 'pilot')),
  reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  check (status = 'valid' or coalesce(btrim(reason), '') <> '')
);

create or replace function public.assessment_validity_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.benchmark_audit_log (action, target_type, target_id, actor_id, reason, details)
    values ('assessment_validity_changed', 'assessment', new.assessment_id::text,
            coalesce(new.reviewed_by, auth.uid()), coalesce(new.reason, 'Validity set'),
            jsonb_build_object('from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status));
  end if;
  return new;
end $$;

drop trigger if exists assessment_validity_audit on public.assessment_validity;
create trigger assessment_validity_audit
  after insert or update on public.assessment_validity
  for each row execute function public.assessment_validity_audit();

-- ---------------------------------------------------------------------------
-- §198 Cohorts & cohort tags (do not change the formal department)
-- ---------------------------------------------------------------------------
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  -- §199 safety net: cohorts may not be named after protected characteristics.
  check (name !~* '\m(age|aged|sex|gender|male|female|men|women|disab\w*|pregnan\w*|maternity|race|racial|ethnic\w*|nationality|religio\w*|belief|gay|lesbian|bisexual|lgbt\w*|trans|transgender|married|marital)\M'),
  check (name !~* '\m(over|under)\s*\d{2}')
);

create table if not exists public.employee_cohorts (
  employee_id uuid not null references public.employees (id) on delete restrict,
  cohort_id uuid not null references public.cohorts (id) on delete restrict,
  added_by uuid default auth.uid(),
  added_at timestamptz not null default now(),
  primary key (employee_id, cohort_id)
);

create or replace function public.employee_cohorts_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into public.benchmark_audit_log (action, target_type, target_id, actor_id, reason, details)
  values ('cohort_changed', 'employee', r.employee_id::text, auth.uid(),
          case when tg_op = 'INSERT' then 'Added to cohort' else 'Removed from cohort' end,
          jsonb_build_object('cohort_id', r.cohort_id, 'op', tg_op));
  return r;
end $$;

drop trigger if exists employee_cohorts_audit on public.employee_cohorts;
create trigger employee_cohorts_audit
  after insert or delete on public.employee_cohorts
  for each row execute function public.employee_cohorts_audit();

-- ---------------------------------------------------------------------------
-- §155, §159, §181 configurable thresholds
-- ---------------------------------------------------------------------------
create table if not exists public.benchmark_settings (
  id boolean primary key default true check (id), -- single row
  minimum_cohort_size int not null default 5 check (minimum_cohort_size >= 2),
  confidence_moderate_from int not null default 10,
  confidence_high_from int not null default 15,
  development_band_below numeric not null default 25,
  above_typical_band_from numeric not null default 75,
  outlier_z numeric not null default 3,
  population_change_warning_overlap numeric not null default 0.8,
  minimum_correlation_pairs int not null default 8,
  minimum_calibration_responses int not null default 30,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.benchmark_settings (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- §171, §196 Benchmark snapshots (frozen; immutable once saved)
-- ---------------------------------------------------------------------------
create table if not exists public.benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  population_definition jsonb not null,
  assessment_versions text[] not null default '{}',
  members jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null
);

create or replace function public.benchmark_snapshot_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Benchmark snapshots are frozen and cannot be altered (§171).';
end $$;

drop trigger if exists benchmark_snapshot_immutable on public.benchmark_snapshots;
create trigger benchmark_snapshot_immutable
  before update or delete on public.benchmark_snapshots
  for each row execute function public.benchmark_snapshot_immutable();

-- Reports link to the snapshot they were generated against.
create table if not exists public.report_benchmarks (
  report_id uuid not null,
  snapshot_id uuid not null references public.benchmark_snapshots (id),
  primary key (report_id, snapshot_id)
);

-- ---------------------------------------------------------------------------
-- §173 Development actions (coaching effectiveness)
-- ---------------------------------------------------------------------------
create table if not exists public.development_actions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  focus text not null,
  metric_key text not null references public.metrics (key),
  assigned_at date not null,
  assigned_by uuid default auth.uid(),
  closed_at date
);

-- ---------------------------------------------------------------------------
-- §170 Question calibration inputs/outputs
-- ---------------------------------------------------------------------------
create table if not exists public.question_calibration (
  question_id text primary key,
  family text not null,
  responses int not null,
  calibrated boolean not null,
  average_accuracy numeric,
  median_completion_seconds numeric,
  re_view_rate numeric,
  answer_change_rate numeric,
  difficulty numeric,
  discrimination numeric,
  department_accuracy jsonb not null default '{}'::jsonb,
  department_variation numeric,
  flags text[] not null default '{}',
  calculated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- §178–§180 External KPI observations (future correlation analysis)
-- ---------------------------------------------------------------------------
create table if not exists public.kpi_observations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  kpi text not null,
  period_start date not null,
  period_end date not null,
  value numeric not null,
  higher_is_better boolean not null default true,
  source text not null,
  recorded_by uuid default auth.uid(),
  recorded_at timestamptz not null default now()
);

create table if not exists public.high_performance_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- §178: membership must come from external job-performance evidence, never FocusiQ scores.
  evidence_source text not null check (evidence_source in ('external_kpi', 'manager_review', 'documented_outcomes')),
  evidence_description text not null check (btrim(evidence_description) <> ''),
  employee_ids uuid[] not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Eligible-assessment view used by benchmark queries.
-- ---------------------------------------------------------------------------
create or replace view public.benchmark_assessment_status
with (security_invoker = true) as
select
  a.id as assessment_id,
  a.employee_id,
  e.department,
  e.job_role,
  e.status as employee_status,
  a.version,
  a.assessment_type,
  a.completed_at,
  coalesce(v.status, 'valid') as validity,
  case
    when ee.id is not null then ee.exclusion_reason
    when ae.id is not null then ae.exclusion_reason
    when not a.complete then 'incomplete_assessment'
    when v.status = 'invalidated' then 'assessment_invalidated'
    when v.status = 'review_required' then 'review_required'
  end as exclusion_reason,
  (ee.id is null and ae.id is null and a.complete
    and coalesce(v.status, 'valid') not in ('invalidated', 'review_required')) as benchmark_eligible
from public.assessments a
join public.employees e on e.id = a.employee_id
left join public.assessment_validity v on v.assessment_id = a.id
left join public.benchmark_eligibility ee
  on ee.employee_id = a.employee_id and ee.assessment_id is null and ee.restored_at is null
left join public.benchmark_eligibility ae
  on ae.assessment_id = a.id and ae.restored_at is null;

-- ---------------------------------------------------------------------------
-- Row-level security: benchmarking data is Director-only (§161, §184).
-- ---------------------------------------------------------------------------
alter table public.benchmark_audit_log enable row level security;
alter table public.benchmark_eligibility enable row level security;
alter table public.assessment_validity enable row level security;
alter table public.cohorts enable row level security;
alter table public.employee_cohorts enable row level security;
alter table public.benchmark_settings enable row level security;
alter table public.benchmark_snapshots enable row level security;
alter table public.report_benchmarks enable row level security;
alter table public.development_actions enable row level security;
alter table public.question_calibration enable row level security;
alter table public.kpi_observations enable row level security;
alter table public.high_performance_cohorts enable row level security;

-- Read access: Directors / Super Admins.
do $$
declare t text;
begin
  foreach t in array array[
    'benchmark_audit_log', 'benchmark_eligibility', 'assessment_validity', 'cohorts',
    'employee_cohorts', 'benchmark_settings', 'benchmark_snapshots', 'report_benchmarks',
    'development_actions', 'question_calibration', 'kpi_observations', 'high_performance_cohorts'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_director_read', t);
    execute format('create policy %I on public.%I for select using (public.is_director())', t || '_director_read', t);
  end loop;
end $$;

-- §184 Benchmark locking: inclusion changes need Director/Super Admin or explicit authority.
drop policy if exists benchmark_eligibility_insert on public.benchmark_eligibility;
create policy benchmark_eligibility_insert on public.benchmark_eligibility
  for insert with check (public.can_alter_benchmark_inclusion() and excluded_by = auth.uid());
drop policy if exists benchmark_eligibility_restore on public.benchmark_eligibility;
create policy benchmark_eligibility_restore on public.benchmark_eligibility
  for update using (public.can_alter_benchmark_inclusion())
  with check (public.can_alter_benchmark_inclusion() and restored_by = auth.uid());

drop policy if exists assessment_validity_write on public.assessment_validity;
create policy assessment_validity_write on public.assessment_validity
  for all using (public.can_alter_benchmark_inclusion()) with check (public.can_alter_benchmark_inclusion());

-- Directors manage cohorts, snapshots, settings, development actions and KPI data.
do $$
declare t text;
begin
  foreach t in array array[
    'cohorts', 'employee_cohorts', 'benchmark_settings', 'development_actions',
    'kpi_observations', 'high_performance_cohorts', 'question_calibration'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_director_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_director()) with check (public.is_director())',
      t || '_director_write', t);
  end loop;
end $$;

drop policy if exists benchmark_snapshots_insert on public.benchmark_snapshots;
create policy benchmark_snapshots_insert on public.benchmark_snapshots
  for insert with check (public.is_director() and created_by = auth.uid());
drop policy if exists report_benchmarks_insert on public.report_benchmarks;
create policy report_benchmarks_insert on public.report_benchmarks
  for insert with check (public.is_director());

-- Audit rows are written by triggers or explicitly by Directors; never edited.
drop policy if exists benchmark_audit_insert on public.benchmark_audit_log;
create policy benchmark_audit_insert on public.benchmark_audit_log
  for insert with check (public.can_alter_benchmark_inclusion() and actor_id = auth.uid());
