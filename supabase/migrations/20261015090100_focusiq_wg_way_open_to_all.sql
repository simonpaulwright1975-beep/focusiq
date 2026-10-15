-- The WG Way check is open to everyone active in FocusiQ, not just the Sales
-- department (the Managing Director's decision, 15 October 2026). Directors
-- choose who takes it by who they send the link and sign-in code to.
create or replace function focusiq.wg_way_start()
returns table (sitting_id uuid, question_ids text[], events_received integer, presentation_ids text[])
language plpgsql security definer set search_path = focusiq as $$
declare
  me uuid := focusiq.my_employee_id();
  s focusiq.wg_way_sittings;
begin
  if me is null or not focusiq.is_focusiq_user()
     or not exists (select 1 from focusiq.employees e where e.id = me and e.status = 'active') then
    raise exception 'You need a FocusiQ record to take this check. Please ask a Director.';
  end if;
  select * into s from focusiq.wg_way_sittings w
   where w.employee_id = me and w.submitted_at is null and w.started_at > now() - interval '30 minutes'
   order by w.started_at desc limit 1;
  if not found then
    insert into focusiq.wg_way_sittings (employee_id, question_ids) values (me, focusiq.wg_way_draw()) returning * into s;
  end if;
  return query select s.id, s.question_ids, s.events_received,
    array(select k from jsonb_object_keys(s.presentations) k);
end $$;
