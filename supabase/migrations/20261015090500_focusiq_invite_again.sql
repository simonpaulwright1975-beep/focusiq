-- invite_staff() will not send another invitation within 3 days of the last one
-- (to stop duplicates). A Director who means to send another, e.g. after losing
-- the email or to test it, confirms and uses invite_staff_again(): it skips the
-- 3-day check, but still does not queue a second copy while one is waiting.
create or replace function focusiq.invite_staff_again(p_employee_id uuid)
returns text language plpgsql security definer set search_path = focusiq as $$
declare e employees;
begin
  if not focusiq.is_director() then raise exception 'Only Directors can send FocusiQ invitations.'; end if;
  select * into e from employees where id = p_employee_id;
  if not found then raise exception 'That person is not in FocusiQ.'; end if;
  if e.status <> 'active' then return 'not_active'; end if;
  if e.user_id is null then return 'no_login'; end if;
  if exists (select 1 from notification_outbox o where o.coalesce_key = 'invite:' || e.id and o.status in ('pending', 'sending')) then
    return 'recently_invited';
  end if;
  perform focusiq.focusiq_notify_employee('focusiq_invitation', e.id, 'invite:' || e.id);
  return 'invited';
end $$;

revoke all on function focusiq.invite_staff_again(uuid) from public, anon;
grant execute on function focusiq.invite_staff_again(uuid) to authenticated;
