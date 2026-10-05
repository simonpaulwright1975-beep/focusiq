-- The Staff tab lists the WG staff directory. People added to FocusiQ without a
-- directory link (e.g. a Director whose directory entry is marked inactive, so
-- the nightly sync would otherwise mark them as left) are listed too, so they
-- can be invited or given a sign-in code. For them staff_id is the FocusiQ id.
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
  select * from (
    select s.id, s.full_name, s.job_title, s.department, coalesce(s.is_active, false),
           s.auth_user_id is not null, s.employment_start_date,
           e.id, e.department, e.start_date, e.status
    from public.employees s
    left join focusiq.employees e on e.staff_id = s.id
    union all
    select e.id, e.display_name, e.job_role, null::text, e.status = 'active',
           e.user_id is not null, null::date,
           e.id, e.department, e.start_date, e.status
    from focusiq.employees e
    where e.staff_id is null and e.status <> 'test'
  ) d (staff_id, full_name, job_title, directory_department, is_active, has_login, directory_start_date,
       employee_id, department, start_date, status)
  order by d.is_active desc, d.full_name;
end $$;
