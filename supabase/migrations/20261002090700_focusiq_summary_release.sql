-- Employee summaries: a Director reviews and releases each employee's summary.
--
-- Nothing reaches an employee until a Director releases it. A release is
-- append-only; to change it, release a new version (the previous one is
-- withdrawn automatically) or withdraw it with a reason. Employees read their
-- current summary through my_summary(), which returns the summary content only:
-- never who released it, why a version was withdrawn, or the Director report.

create table if not exists public.summary_releases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.employee_insight_reports (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  -- EmployeeSummary (src/participation/summary.ts): employee wording, no comparisons.
  content jsonb not null,
  include_bands boolean not null,
  released_by uuid not null default auth.uid(),
  released_at timestamptz not null default now()
);
create index if not exists summary_releases_employee_idx on public.summary_releases (employee_id, released_at desc);

create table if not exists public.summary_withdrawals (
  release_id uuid primary key references public.summary_releases (id) on delete restrict,
  reason text not null check (btrim(reason) <> ''),
  withdrawn_by uuid not null default auth.uid(),
  withdrawn_at timestamptz not null default now()
);

create table if not exists public.summary_reads (
  release_id uuid primary key references public.summary_releases (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  read_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['summary_releases', 'summary_withdrawals', 'summary_reads'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.focusiq_append_only()',
      t || '_append_only', t);
    execute format('alter table public.%I enable row level security', t);
    -- Directors read everything; all writes go through the functions below.
    execute format('drop policy if exists %I on public.%I', t || '_director_read', t);
    execute format('create policy %I on public.%I for select using (public.is_director())', t || '_director_read', t);
  end loop;
end $$;

-- Current (latest, not withdrawn) release per employee.
create or replace view public.current_summary_releases
with (security_invoker = true) as
select distinct on (r.employee_id) r.*
from public.summary_releases r
where not exists (select 1 from public.summary_withdrawals w where w.release_id = r.id)
order by r.employee_id, r.released_at desc, r.id;

create or replace function public.withdraw_employee_summary(p_release_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_director() then raise exception 'Only Directors can withdraw summaries.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason for withdrawing the summary.'; end if;
  if not exists (select 1 from summary_releases where id = p_release_id) then raise exception 'Summary not found.'; end if;
  if exists (select 1 from summary_withdrawals where release_id = p_release_id) then
    raise exception 'This summary has already been withdrawn.';
  end if;
  insert into summary_withdrawals (release_id, reason) values (p_release_id, btrim(p_reason));
end $$;

create or replace function public.release_employee_summary(p_report_id uuid, p_content jsonb, p_include_bands boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rep employee_insight_reports;
  prev uuid;
  new_id uuid;
begin
  if not public.is_director() then raise exception 'Only Directors can release summaries.'; end if;
  select * into rep from employee_insight_reports where id = p_report_id;
  if not found then raise exception 'Insight report not found.'; end if;
  -- Belt and braces: the app builds the content with buildEmployeeSummary, which already refuses these.
  if p_content ? 'releasedBy' then raise exception 'Summaries must not name who released them.'; end if;
  if p_content::text ~* '(percentile|\mrank(ed|ing)?\M|\mleague\M|colleagues?.? (results|scores))' then
    raise exception 'Summaries must not compare the employee with colleagues.';
  end if;
  if not p_include_bands and jsonb_array_length(coalesce(p_content -> 'dimensions', '[]'::jsonb)) > 0 then
    raise exception 'Bands were not selected for release.';
  end if;
  -- A new version replaces the current one.
  for prev in
    select r.id from summary_releases r
    where r.employee_id = rep.employee_id
      and not exists (select 1 from summary_withdrawals w where w.release_id = r.id)
  loop
    insert into summary_withdrawals (release_id, reason) values (prev, 'Replaced by a new version');
  end loop;
  insert into summary_releases (report_id, employee_id, assessment_id, content, include_bands)
  values (rep.id, rep.employee_id, rep.assessment_id, p_content, p_include_bands)
  returning id into new_id;
  return new_id;
end $$;

-- The employee's current summary: content only.
create or replace function public.my_summary()
returns table (release_id uuid, released_at timestamptz, content jsonb, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.released_at, c.content, sr.read_at
  from public.current_summary_releases c
  left join public.summary_reads sr on sr.release_id = c.id
  where c.employee_id = public.my_employee_id()
$$;

create or replace function public.mark_summary_read(p_release_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare at timestamptz;
begin
  if not exists (
    select 1 from current_summary_releases where id = p_release_id and employee_id = public.my_employee_id()
  ) then
    raise exception 'You can only confirm your own current summary.';
  end if;
  insert into summary_reads (release_id, employee_id) values (p_release_id, public.my_employee_id())
  on conflict (release_id) do nothing;
  select read_at into at from summary_reads where release_id = p_release_id;
  return at;
end $$;

-- my_insight_summaries() returned employee_facing content before any Director
-- review. Employees now see only what is released, through my_summary().
drop function if exists public.my_insight_summaries();

revoke all on function public.release_employee_summary(uuid, jsonb, boolean) from public;
revoke all on function public.withdraw_employee_summary(uuid, text) from public;
revoke all on function public.my_summary() from public;
revoke all on function public.mark_summary_read(uuid) from public;
grant execute on function public.release_employee_summary(uuid, jsonb, boolean) to authenticated;
grant execute on function public.withdraw_employee_summary(uuid, text) to authenticated;
grant execute on function public.my_summary() to authenticated;
grant execute on function public.mark_summary_read(uuid) to authenticated;
