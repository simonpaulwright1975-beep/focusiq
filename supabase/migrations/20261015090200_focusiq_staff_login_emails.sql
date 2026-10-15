-- The Staff tab shows each person's Walter Geering sign-in email, so a Director
-- can check it before sending a sign-in code or invitation. Directors only;
-- keyed like staff_directory() (the FocusiQ id for people without a directory link).
create or replace function focusiq.staff_login_emails()
returns table (staff_id uuid, email text)
language plpgsql stable security definer set search_path = focusiq as $$
begin
  if not focusiq.is_director() then raise exception 'Only Directors can view sign-in emails.'; end if;
  return query
  select s.id, u.email::text from public.employees s join auth.users u on u.id = s.auth_user_id
  union all
  select e.id, u.email::text from focusiq.employees e join auth.users u on u.id = e.user_id
   where e.staff_id is null and e.status <> 'test';
end $$;

revoke all on function focusiq.staff_login_emails() from public, anon;
grant execute on function focusiq.staff_login_emails() to authenticated;
