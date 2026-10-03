set search_path = focusiq;

-- "Questions or concerns" inbox: employee questions and data-rights requests.
--
-- Copy of data, correction and objection are UK GDPR requests: respond within
-- one calendar month (weekends roll forward; bank holidays are not modelled),
-- extendable once by up to two months if the employee is told in time.
-- Questions have an internal target of 5 working days.
--
-- Every request is an append-only thread. Internal notes are Director-only.
-- Employees read their own requests through my_rights_requests(), which
-- returns only messages meant for them and never Director identities.

alter table focusiq.rights_requests
  add column if not exists due_at date,
  add column if not exists extended_reason text,
  add column if not exists extended_at timestamptz,
  add column if not exists extended_by uuid,
  add column if not exists outcome text,
  add column if not exists closed_at timestamptz;
-- The old insert policy referenced `response`; recreate it without (the insert trigger now forces safe values).
drop policy if exists rights_requests_own_insert on focusiq.rights_requests;
alter table focusiq.rights_requests drop column if exists response;
alter table focusiq.rights_requests drop column if exists responded_by;
alter table focusiq.rights_requests drop column if exists responded_at;
alter table focusiq.rights_requests drop constraint if exists rights_requests_outcome_check;
alter table focusiq.rights_requests add constraint rights_requests_outcome_check check (
  (status = 'closed') = (outcome is not null)
  and (outcome is null or (request_type, outcome) in (
    ('question', 'answered'), ('question', 'withdrawn'),
    ('copy_of_data', 'provided'), ('copy_of_data', 'partly_provided'), ('copy_of_data', 'withdrawn'),
    ('correction', 'corrected'), ('correction', 'no_change_needed'), ('correction', 'withdrawn'),
    ('objection', 'upheld'), ('objection', 'not_upheld'), ('objection', 'withdrawn')
  ))
);

create or replace function focusiq.focusiq_next_working_day(d date)
returns date language sql immutable as $$
  select case extract(isodow from d) when 6 then d + 2 when 7 then d + 1 else d end
$$;

create or replace function focusiq.rights_request_due(p_type text, p_received timestamptz, p_extra_months int default 0)
returns date language plpgsql immutable as $$
declare d date := (p_received at time zone 'UTC')::date; added int := 0;
begin
  if p_type in ('copy_of_data', 'correction', 'objection') then
    -- Same date next month; Postgres clamps 31 Jan + 1 month to 28/29 Feb.
    return focusiq.focusiq_next_working_day((d + make_interval(months => 1 + p_extra_months))::date);
  end if;
  while added < 5 loop
    d := d + 1;
    if extract(isodow from d) < 6 then added := added + 1; end if;
  end loop;
  return d;
end $$;

create table if not exists focusiq.rights_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references focusiq.rights_requests (id) on delete restrict,
  kind text not null check (kind in ('employee', 'reply', 'internal', 'event')),
  visible_to_employee boolean not null,
  author_id uuid,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  check (visible_to_employee = (kind <> 'internal'))
);
create index if not exists rights_request_messages_request_idx on focusiq.rights_request_messages (request_id, created_at);

drop trigger if exists rights_request_messages_append_only on focusiq.rights_request_messages;
create trigger rights_request_messages_append_only before update or delete on focusiq.rights_request_messages
  for each row execute function focusiq.focusiq_append_only();

-- On arrival: the server sets the clock and the deadline, and the message opens the thread.
create or replace function focusiq.rights_requests_on_insert()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  new.created_at := now();
  new.status := 'open';
  new.outcome := null;
  new.closed_at := null;
  new.due_at := focusiq.rights_request_due(new.request_type, new.created_at);
  return new;
end $$;
drop trigger if exists rights_requests_on_insert on focusiq.rights_requests;
create trigger rights_requests_on_insert before insert on focusiq.rights_requests
  for each row execute function focusiq.rights_requests_on_insert();

create or replace function focusiq.rights_requests_first_message()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  insert into focusiq.rights_request_messages (request_id, kind, visible_to_employee, author_id, body, created_at)
  values (new.id, 'employee', true, auth.uid(), new.message, new.created_at);
  return new;
end $$;
drop trigger if exists rights_requests_first_message on focusiq.rights_requests;
create trigger rights_requests_first_message after insert on focusiq.rights_requests
  for each row execute function focusiq.rights_requests_first_message();

-- ---------------------------------------------------------------------------
-- Director actions (Directors / Super Admins only)
-- ---------------------------------------------------------------------------
create or replace function focusiq.rights_request_for_update(p_id uuid)
returns focusiq.rights_requests language plpgsql security definer set search_path = focusiq as $$
declare r focusiq.rights_requests;
begin
  if not focusiq.is_director() then raise exception 'Only Directors can handle questions and requests.'; end if;
  select * into r from focusiq.rights_requests where id = p_id for update;
  if r.id is null then raise exception 'Request not found.'; end if;
  if r.status = 'closed' then raise exception 'This request is closed.'; end if;
  return r;
end $$;

create or replace function focusiq.respond_rights_request(p_id uuid, p_body text, p_internal boolean default false)
returns void language plpgsql security definer set search_path = focusiq as $$
declare r focusiq.rights_requests := focusiq.rights_request_for_update(p_id);
begin
  insert into focusiq.rights_request_messages (request_id, kind, visible_to_employee, author_id, body)
  values (r.id, case when p_internal then 'internal' else 'reply' end, not p_internal, auth.uid(), btrim(p_body));
  if not p_internal and r.status = 'open' then
    update focusiq.rights_requests set status = 'in_progress' where id = r.id;
  end if;
end $$;

create or replace function focusiq.mark_rights_request_in_progress(p_id uuid)
returns void language plpgsql security definer set search_path = focusiq as $$
declare r focusiq.rights_requests := focusiq.rights_request_for_update(p_id);
begin
  if r.status = 'in_progress' then return; end if;
  update focusiq.rights_requests set status = 'in_progress' where id = r.id;
  insert into focusiq.rights_request_messages (request_id, kind, visible_to_employee, author_id, body)
  values (r.id, 'event', true, auth.uid(), 'We are looking into this.');
end $$;

create or replace function focusiq.extend_rights_request(p_id uuid, p_months int, p_reason text)
returns date language plpgsql security definer set search_path = focusiq as $$
declare r focusiq.rights_requests := focusiq.rights_request_for_update(p_id); new_due date;
begin
  if r.request_type not in ('copy_of_data', 'correction', 'objection') then
    raise exception 'Only data-rights requests have a legal deadline that can be extended.';
  end if;
  if r.extended_at is not null then raise exception 'The deadline has already been extended once.'; end if;
  if p_months not between 1 and 2 then raise exception 'An extension must be 1 or 2 months.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Explain to the employee why more time is needed.'; end if;
  if (now() at time zone 'UTC')::date > r.due_at then
    raise exception 'The deadline has passed – an extension must be made within the original month.';
  end if;
  new_due := focusiq.rights_request_due(r.request_type, r.created_at, p_months);
  update focusiq.rights_requests
  set due_at = new_due, status = 'in_progress', extended_reason = btrim(p_reason), extended_at = now(), extended_by = auth.uid()
  where id = r.id;
  insert into focusiq.rights_request_messages (request_id, kind, visible_to_employee, author_id, body)
  values (r.id, 'event', true, auth.uid(),
          format('We need more time to respond fully. New response date: %s (originally %s). Reason: %s',
                 to_char(new_due, 'FMDD FMMonth YYYY'), to_char(r.due_at, 'FMDD FMMonth YYYY'), btrim(p_reason)));
  return new_due;
end $$;

create or replace function focusiq.close_rights_request(p_id uuid, p_outcome text, p_summary text)
returns void language plpgsql security definer set search_path = focusiq as $$
declare r focusiq.rights_requests := focusiq.rights_request_for_update(p_id); label text;
begin
  if coalesce(btrim(p_summary), '') = '' then raise exception 'Write a closing message to the employee.'; end if;
  label := case p_outcome
    when 'answered' then 'Answered' when 'provided' then 'Information provided'
    when 'partly_provided' then 'Partly provided (some information withheld, with reasons)'
    when 'corrected' then 'Record corrected' when 'no_change_needed' then 'No change needed (record was accurate)'
    when 'upheld' then 'Objection upheld – FocusiQ processing stopped' when 'not_upheld' then 'Objection not upheld (reasons given)'
    when 'withdrawn' then 'Withdrawn by the employee' end;
  update focusiq.rights_requests set status = 'closed', outcome = p_outcome, closed_at = now() where id = r.id; -- outcome checked by constraint
  insert into focusiq.rights_request_messages (request_id, kind, visible_to_employee, author_id, body)
  values (r.id, 'event', true, auth.uid(),
          label || '. ' || btrim(p_summary) ||
          case when p_outcome in ('not_upheld', 'partly_provided')
               then ' If you are unhappy with this response, you can ask us to look at it again, or complain to the Information Commissioner’s Office (ico.org.uk).'
               else '' end);
end $$;

-- ---------------------------------------------------------------------------
-- Employee access
-- ---------------------------------------------------------------------------
create or replace function focusiq.my_rights_requests()
returns jsonb language sql stable security definer set search_path = focusiq as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'type', r.request_type, 'status', r.status, 'created_at', r.created_at,
    'respond_by', r.due_at, 'extended', r.extended_at is not null, 'outcome', r.outcome,
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'from', case when m.kind = 'employee' then 'You' else 'Walter Geering' end,
        'kind', m.kind, 'body', m.body, 'at', m.created_at) order by m.created_at), '[]'::jsonb)
      from focusiq.rights_request_messages m
      where m.request_id = r.id and m.visible_to_employee)
  ) order by r.created_at desc), '[]'::jsonb)
  from focusiq.rights_requests r
  where r.employee_id = focusiq.my_employee_id()
$$;

create or replace function focusiq.follow_up_rights_request(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path = focusiq as $$
declare r focusiq.rights_requests;
begin
  select * into r from focusiq.rights_requests where id = p_id and employee_id = focusiq.my_employee_id();
  if r.id is null then raise exception 'You can only reply to your own requests.'; end if;
  if r.status = 'closed' then raise exception 'This request is closed.'; end if;
  insert into focusiq.rights_request_messages (request_id, kind, visible_to_employee, author_id, body)
  values (r.id, 'employee', true, auth.uid(), btrim(p_body));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'respond_rights_request(uuid, text, boolean)', 'mark_rights_request_in_progress(uuid)',
    'extend_rights_request(uuid, integer, text)', 'close_rights_request(uuid, text, text)',
    'my_rights_requests()', 'follow_up_rights_request(uuid, text)'
  ] loop
    execute format('revoke all on function focusiq.%s from public', f);
    execute format('grant execute on function focusiq.%s to authenticated', f);
  end loop;
end $$;

-- Changes go through the functions above; no direct updates.
drop policy if exists rights_requests_respond on focusiq.rights_requests;
create policy rights_requests_own_insert on focusiq.rights_requests
  for insert with check (employee_id = focusiq.my_employee_id());

alter table focusiq.rights_request_messages enable row level security;
drop policy if exists rights_request_messages_director_read on focusiq.rights_request_messages;
create policy rights_request_messages_director_read on focusiq.rights_request_messages
  for select using (focusiq.is_director());
