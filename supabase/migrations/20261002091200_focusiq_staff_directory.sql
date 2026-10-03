-- Link FocusiQ to the WG staff directory (public.employees, owned by another app).
--
-- * Identity comes from the directory and is kept in step by
--   sync_staff_directory(): name, job title, login and whether the person is
--   still active. FocusiQ never writes to the directory.
-- * FocusiQ owns department and start date. The directory has neither for
--   most people, and changing them later would change benchmark history.
--   A Director sets them when adding someone (link_staff).
-- * The link is a plain column, not a foreign key: a foreign key would add
--   triggers to the directory table and could block the other app deleting a
--   staff record. A person who disappears from the directory becomes 'former'.
-- * Only these directory columns are read: id, auth_user_id, full_name,
--   job_title, department, is_active, employment_start_date.

alter table focusiq.employees add column if not exists staff_id uuid unique;
comment on column focusiq.employees.staff_id is
  'public.employees.id in the WG staff directory (soft link: no foreign key, see 20261002091200_focusiq_staff_directory.sql)';

-- Directors: everyone in the directory and whether they are in FocusiQ yet.
create or replace function focusiq.staff_directory()
returns table (
  staff_id uuid, full_name text, job_title text, directory_department text, is_active boolean,
  has_login boolean, directory_start_date date,
  employee_id uuid, department text, start_date date, status text)
language plpgsql stable security definer set search_path = focusiq as $$
#variable_conflict use_column
begin
  if not focusiq.is_director() then raise exception 'Only Directors can view the staff directory.'; end if;
  return query
  select s.id, s.full_name, s.job_title, s.department, coalesce(s.is_active, false),
         s.auth_user_id is not null, s.employment_start_date,
         e.id, e.department, e.start_date, e.status
  from public.employees s
  left join focusiq.employees e on e.staff_id = s.id
  order by coalesce(s.is_active, false) desc, s.full_name;
end $$;

-- Directors: add a directory person to FocusiQ (or link an existing FocusiQ
-- record with the same login). Department and start date are FocusiQ's own;
-- the directory start date is used when no date is given.
create or replace function focusiq.link_staff(p_staff_id uuid, p_department text, p_start_date date default null)
returns uuid language plpgsql security definer set search_path = focusiq as $$
declare
  s record;
  existing focusiq.employees;
  start_on date;
  new_id uuid;
begin
  if not focusiq.is_director() then raise exception 'Only Directors can add people to FocusiQ.'; end if;
  if p_department is null or p_department not in ('Sales', 'Marketing', 'Customer Service', 'Stock Control', 'Finance') then
    raise exception 'Choose a FocusiQ department: Sales, Marketing, Customer Service, Stock Control or Finance.';
  end if;
  select id, auth_user_id, full_name, job_title, is_active, employment_start_date into s
    from public.employees where id = p_staff_id;
  if not found then raise exception 'That person is not in the staff directory.'; end if;
  if exists (select 1 from focusiq.employees where staff_id = p_staff_id) then
    raise exception 'That person is already in FocusiQ.';
  end if;
  start_on := coalesce(p_start_date, s.employment_start_date);
  if start_on is null then raise exception 'Enter a start date: the staff directory does not have one.'; end if;

  select * into existing from focusiq.employees where s.auth_user_id is not null and user_id = s.auth_user_id;
  if found then
    update focusiq.employees
       set staff_id = s.id, display_name = s.full_name, job_role = s.job_title,
           department = p_department, start_date = start_on
     where id = existing.id
    returning id into new_id;
  else
    insert into focusiq.employees (staff_id, user_id, display_name, department, job_role, status, start_date, left_date)
    values (s.id, s.auth_user_id, s.full_name, p_department, s.job_title,
            case when coalesce(s.is_active, false) then 'active' else 'former' end, start_on,
            case when coalesce(s.is_active, false) then null else current_date end)
    returning id into new_id;
  end if;

  -- Staff with a login can use the employee app; Directors keep their role.
  if s.auth_user_id is not null then
    insert into focusiq.user_roles (user_id, role) values (s.auth_user_id, 'employee')
    on conflict (user_id) do nothing;
  end if;
  return new_id;
end $$;

-- Keep linked people in step with the directory. Run nightly (pg_cron) and
-- whenever a Director asks. Returns what changed.
create or replace function focusiq.sync_staff_directory()
returns jsonb language plpgsql security definer set search_path = focusiq as $$
declare
  renamed int; left_count int; returned int; logins int;
begin
  -- Directors, or the scheduler (no signed-in user).
  if auth.uid() is not null and not focusiq.is_director() then
    raise exception 'Only Directors can sync the staff directory.';
  end if;

  update focusiq.employees e
     set display_name = s.full_name, job_role = s.job_title
    from public.employees s
   where s.id = e.staff_id
     and (e.display_name is distinct from s.full_name or e.job_role is distinct from s.job_title)
     and coalesce(btrim(s.full_name), '') <> '';
  get diagnostics renamed = row_count;

  update focusiq.employees e
     set user_id = s.auth_user_id
    from public.employees s
   where s.id = e.staff_id and s.auth_user_id is not null and e.user_id is distinct from s.auth_user_id
     and not exists (select 1 from focusiq.employees o where o.user_id = s.auth_user_id and o.id <> e.id);
  get diagnostics logins = row_count;

  -- Left: inactive in the directory, or no longer in it.
  update focusiq.employees e
     set status = 'former', left_date = current_date
   where e.staff_id is not null and e.status = 'active'
     and not exists (select 1 from public.employees s where s.id = e.staff_id and coalesce(s.is_active, false));
  get diagnostics left_count = row_count;

  -- Back again.
  update focusiq.employees e
     set status = 'active', left_date = null
    from public.employees s
   where s.id = e.staff_id and coalesce(s.is_active, false) and e.status = 'former';
  get diagnostics returned = row_count;

  return jsonb_build_object('details_updated', renamed, 'logins_updated', logins, 'left', left_count, 'returned', returned,
    'not_in_focusiq', (select count(*) from public.employees s
                       where coalesce(s.is_active, false)
                         and not exists (select 1 from focusiq.employees e where e.staff_id = s.id)));
end $$;

revoke all on function focusiq.staff_directory() from public;
revoke all on function focusiq.link_staff(uuid, text, date) from public;
revoke all on function focusiq.sync_staff_directory() from public;
grant execute on function focusiq.staff_directory() to authenticated;
grant execute on function focusiq.link_staff(uuid, text, date) to authenticated;
grant execute on function focusiq.sync_staff_directory() to authenticated, service_role;
