-- The nightly staff-directory sync copied the directory's job title over
-- FocusiQ's even when the directory had none, blanking titles a Director had
-- set. Now an empty directory title leaves FocusiQ's as it is.

create or replace function focusiq.sync_staff_directory()
returns jsonb language plpgsql security definer set search_path = focusiq as $$
declare
  renamed int; left_count int; returned int; logins int; roles int;
begin
  -- Directors, or the scheduler (no signed-in user).
  if auth.uid() is not null and not focusiq.is_director() then
    raise exception 'Only Directors can sync the staff directory.';
  end if;

  -- A job title is copied only when the directory has one, so titles a Director
  -- set in FocusiQ are not blanked by an empty directory field.
  update focusiq.employees e
     set display_name = s.full_name, job_role = coalesce(nullif(btrim(s.job_title), ''), e.job_role)
    from public.employees s
   where s.id = e.staff_id
     and (e.display_name is distinct from s.full_name
          or e.job_role is distinct from coalesce(nullif(btrim(s.job_title), ''), e.job_role))
     and coalesce(btrim(s.full_name), '') <> '';
  get diagnostics renamed = row_count;

  update focusiq.employees e
     set user_id = s.auth_user_id
    from public.employees s
   where s.id = e.staff_id and s.auth_user_id is not null and e.user_id is distinct from s.auth_user_id
     and not exists (select 1 from focusiq.employees o where o.user_id = s.auth_user_id and o.id <> e.id);
  get diagnostics logins = row_count;

  insert into focusiq.user_roles (user_id, role)
  select e.user_id, 'employee' from focusiq.employees e
  where e.user_id is not null and e.staff_id is not null and e.status = 'active'
  on conflict (user_id) do nothing;
  get diagnostics roles = row_count;

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

  return jsonb_build_object('details_updated', renamed, 'logins_updated', logins, 'roles_added', roles,
    'left', left_count, 'returned', returned,
    'not_in_focusiq', (select count(*) from public.employees s
                       where coalesce(s.is_active, false)
                         and not exists (select 1 from focusiq.employees e where e.staff_id = s.id)));
end $$;
