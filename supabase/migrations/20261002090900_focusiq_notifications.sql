set search_path = focusiq;

-- Email notifications.
--
-- Emails are a nudge to sign in, never a copy of the content: no adjustment
-- details, request text, replies, summaries or Director names. Employee emails
-- come from "Walter Geering"; Directors get one daily summary of counts with
-- no employee names. The wording mirrors src/participation/notifications.ts
-- (tests/notifications.test.ts checks the fixed wording appears here).
--
-- Flow: triggers and Director functions queue emails in notification_outbox.
-- Repeat updates about the same thing (same coalesce_key) replace a pending
-- email instead of adding another. The send-notifications Edge Function
-- claims pending emails, sends them and records the result. See
-- docs/notifications.md for scheduling.

create table if not exists focusiq.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'adjustment_decided', 'request_reply', 'request_extended', 'request_closed', 'summary_released',
    'day_invitation', 'day_updated', 'acknowledgement_reminder', 'director_digest'
  )),
  recipient_employee_id uuid references focusiq.employees (id) on delete restrict,
  recipient_user_id uuid references auth.users (id) on delete cascade,
  subject text not null,
  body text not null,           -- plain text; {{link}} is replaced when sent
  coalesce_key text not null,
  context jsonb not null default '{}'::jsonb, -- e.g. the booking for day emails
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'cancelled', 'failed', 'skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(recipient_employee_id, recipient_user_id) = 1),
  check ((kind = 'director_digest') = (recipient_user_id is not null))
);
create unique index if not exists notification_outbox_one_pending
  on focusiq.notification_outbox (coalesce_key) where status = 'pending';
create index if not exists notification_outbox_due on focusiq.notification_outbox (next_attempt_at) where status = 'pending';

-- Room names used in invitations.
alter table focusiq.assessment_days
  add column if not exists main_room_name text not null default 'Main assessment room',
  add column if not exists quiet_room_name text not null default 'Quiet room';

create table if not exists focusiq.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  director_digest boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table focusiq.notification_outbox enable row level security;
alter table focusiq.notification_preferences enable row level security;
drop policy if exists notification_outbox_director_read on focusiq.notification_outbox;
create policy notification_outbox_director_read on focusiq.notification_outbox for select using (focusiq.is_director());
drop policy if exists notification_preferences_own on focusiq.notification_preferences;
create policy notification_preferences_own on focusiq.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Wording (mirror of src/participation/notifications.ts)
-- ---------------------------------------------------------------------------
create or replace function focusiq.focusiq_email_body(p_name text, p_lines text[])
returns text language sql immutable as $$
  select (case when coalesce(btrim(p_name), '') = '' then 'Hello,'
               else 'Hello ' || (regexp_split_to_array(btrim(p_name), '\s+'))[1] || ',' end)
    || E'\n\n' || array_to_string(p_lines, E'\n') || E'\n\n'
    || 'This is an automatic message from FocusiQ at Walter Geering. Replies to this email are not monitored: please use "Questions or concerns" in FocusiQ instead.'
$$;

create or replace function focusiq.focusiq_day_date(d date)
returns text language sql immutable as $$ select to_char(d, 'FMDay FMDD FMMonth YYYY') $$;

create or replace function focusiq.focusiq_employee_email(p_kind text, p_name text, out subject text, out body text)
language plpgsql immutable as $$
declare line text;
begin
  case p_kind
    when 'adjustment_decided' then
      subject := 'Your FocusiQ adjustment request has been reviewed';
      line := 'Walter Geering has reviewed your adjustment request for the FocusiQ assessment. Sign in to FocusiQ to see the outcome:';
    when 'request_reply' then
      subject := 'New reply to your FocusiQ question or request';
      line := 'Walter Geering has replied to your question or request. Sign in to FocusiQ to read the reply:';
    when 'request_extended' then
      subject := 'Update on your FocusiQ request';
      line := 'Walter Geering needs more time to respond fully to your request. Sign in to FocusiQ to see the new response date and the reason:';
    when 'request_closed' then
      subject := 'Your FocusiQ question or request has been closed';
      line := 'Walter Geering has closed your question or request. Sign in to FocusiQ to read the final message:';
    when 'summary_released' then
      subject := 'Your FocusiQ summary is ready';
      line := 'Your FocusiQ summary is ready to read. Sign in to FocusiQ to see it:';
    when 'acknowledgement_reminder' then
      subject := 'Please complete your FocusiQ acknowledgement';
      line := 'Before your FocusiQ assessment, please read the privacy notice and complete the short acknowledgement form. It takes about 5 minutes:';
    else raise exception 'Unknown notification kind %', p_kind;
  end case;
  body := focusiq.focusiq_email_body(p_name, array[line, '{{link}}']);
end $$;

create or replace function focusiq.focusiq_day_email(
  p_updated boolean, p_name text, p_date date, p_start text, p_end text, p_room text, p_minutes int, p_acknowledged boolean,
  out subject text, out body text)
language plpgsql immutable as $$
declare lines text[];
begin
  lines := array[
    case when p_updated then 'Your FocusiQ assessment time has changed. Your new booking is:' else 'Your FocusiQ assessment is booked:' end,
    '',
    'When: ' || focusiq.focusiq_day_date(p_date) || ', ' || p_start || ' to ' || p_end,
    'Where: ' || p_room,
    'Allow: about ' || p_minutes || ' minutes, including time to settle in',
    '',
    'A computer will be ready for you. There is nothing to prepare.',
    'If you can’t make this time, please let your manager know.'
  ];
  if not p_acknowledged then
    lines := lines || array['', 'Before the day, please read the privacy notice and complete the acknowledgement in FocusiQ:', '{{link}}'];
  end if;
  subject := case when p_updated then 'Updated: your' else 'Your' end
    || ' FocusiQ assessment: ' || focusiq.focusiq_day_date(p_date) || ', ' || p_start;
  body := focusiq.focusiq_email_body(p_name, lines);
end $$;

-- ---------------------------------------------------------------------------
-- Queueing
-- ---------------------------------------------------------------------------
create or replace function focusiq.focusiq_queue_notification(
  p_kind text, p_employee_id uuid, p_user_id uuid, p_subject text, p_body text, p_key text, p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = focusiq as $$
declare existing uuid;
begin
  update notification_outbox
     set kind = p_kind, subject = p_subject, body = p_body, context = p_context, created_at = now(), updated_at = now()
   where coalesce_key = p_key and status = 'pending'
  returning id into existing;
  if existing is not null then return existing; end if;
  insert into notification_outbox (kind, recipient_employee_id, recipient_user_id, subject, body, coalesce_key, context)
  values (p_kind, p_employee_id, p_user_id, p_subject, p_body, p_key, p_context)
  returning id into existing;
  return existing;
end $$;

create or replace function focusiq.focusiq_notify_employee(p_kind text, p_employee_id uuid, p_key text)
returns void language plpgsql security definer set search_path = focusiq as $$
declare e record; m record;
begin
  select display_name into e from employees where id = p_employee_id;
  m := focusiq.focusiq_employee_email(p_kind, e.display_name);
  perform focusiq.focusiq_queue_notification(p_kind, p_employee_id, null, m.subject, m.body, p_key);
end $$;

create or replace function focusiq.notify_adjustment_decided()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  perform focusiq.focusiq_notify_employee('adjustment_decided',
    (select employee_id from adjustment_requests where id = new.request_id), 'adjustment:' || new.request_id);
  return new;
end $$;
drop trigger if exists adjustment_decisions_notify on focusiq.adjustment_decisions;
create trigger adjustment_decisions_notify after insert on focusiq.adjustment_decisions
  for each row execute function focusiq.notify_adjustment_decided();

create or replace function focusiq.notify_request_reply()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  if new.kind = 'reply' then
    perform focusiq.focusiq_notify_employee('request_reply',
      (select employee_id from rights_requests where id = new.request_id), 'request:' || new.request_id);
  end if;
  return new;
end $$;
drop trigger if exists rights_request_messages_notify on focusiq.rights_request_messages;
create trigger rights_request_messages_notify after insert on focusiq.rights_request_messages
  for each row execute function focusiq.notify_request_reply();

create or replace function focusiq.notify_request_change()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    perform focusiq.focusiq_notify_employee('request_closed', new.employee_id, 'request:' || new.id);
  elsif new.extended_at is distinct from old.extended_at and new.extended_at is not null then
    perform focusiq.focusiq_notify_employee('request_extended', new.employee_id, 'request:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists rights_requests_notify on focusiq.rights_requests;
create trigger rights_requests_notify after update on focusiq.rights_requests
  for each row execute function focusiq.notify_request_change();

create or replace function focusiq.notify_summary_released()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  perform focusiq.focusiq_notify_employee('summary_released', new.employee_id, 'summary:' || new.employee_id);
  return new;
end $$;
drop trigger if exists summary_releases_notify on focusiq.summary_releases;
create trigger summary_releases_notify after insert on focusiq.summary_releases
  for each row execute function focusiq.notify_summary_released();

-- A summary withdrawn before its email went out: don't send it.
create or replace function focusiq.cancel_summary_notification()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  update notification_outbox
     set status = 'cancelled', note = 'Summary withdrawn before the email was sent', updated_at = now()
   where status = 'pending'
     and coalesce_key = 'summary:' || (select employee_id from summary_releases where id = new.release_id);
  return new;
end $$;
drop trigger if exists summary_withdrawals_notify on focusiq.summary_withdrawals;
create trigger summary_withdrawals_notify after insert on focusiq.summary_withdrawals
  for each row execute function focusiq.cancel_summary_notification();

-- ---------------------------------------------------------------------------
-- Director actions
-- ---------------------------------------------------------------------------

-- Invitations for an assessment day. The app computes the session plan
-- (src/participation/readiness.ts) and passes each booking; sessions are
-- fixed at the same time. People with an open objection are not invited.
-- Outcomes: invited, updated, unchanged, objection_open, not_active.
create or replace function focusiq.send_assessment_day_invitations(p_day_id uuid, p_bookings jsonb)
returns table (employee_id uuid, outcome text)
language plpgsql security definer set search_path = focusiq as $$
#variable_conflict use_column
declare
  d assessment_days;
  b jsonb;
  e employees;
  key text;
  booking jsonb;
  prev notification_outbox;
  acknowledged boolean;
  m record;
  updated boolean;
begin
  if not focusiq.is_director() then raise exception 'Only Directors can send invitations.'; end if;
  select * into d from assessment_days where id = p_day_id;
  if not found then raise exception 'Assessment day not found.'; end if;
  for b in select * from jsonb_array_elements(p_bookings) loop
    select * into e from employees where id = (b ->> 'employee_id')::uuid;
    if not found or e.status <> 'active' then
      employee_id := (b ->> 'employee_id')::uuid; outcome := 'not_active'; return next; continue;
    end if;
    if exists (select 1 from rights_requests r where r.employee_id = e.id and r.request_type = 'objection' and r.status <> 'closed') then
      employee_id := e.id; outcome := 'objection_open'; return next; continue;
    end if;
    if (b ->> 'start') !~ '^\d{2}:\d{2}$' or (b ->> 'end') !~ '^\d{2}:\d{2}$' or coalesce(btrim(b ->> 'room'), '') = '' then
      raise exception 'Each booking needs a start, an end and a room.';
    end if;
    insert into assessment_day_assignments (day_id, employee_id, session_number)
    values (d.id, e.id, (b ->> 'session_number')::int)
    on conflict (day_id, employee_id) do update set session_number = excluded.session_number, fixed_by = auth.uid(), fixed_at = now();

    key := 'day:' || d.id || ':' || e.id;
    booking := jsonb_build_object('date', d.day_date, 'start', b ->> 'start', 'end', b ->> 'end', 'room', b ->> 'room');
    select * into prev from notification_outbox o
     where o.coalesce_key = key and o.status in ('pending', 'sending', 'sent')
     order by o.created_at desc limit 1;
    if found and prev.context = booking then
      employee_id := e.id; outcome := 'unchanged'; return next; continue;
    end if;
    -- An update only if an earlier booking actually went out.
    updated := exists (select 1 from notification_outbox o where o.coalesce_key = key and o.status in ('sending', 'sent'));
    acknowledged := exists (
      select 1 from participation_acknowledgements pa
      where pa.employee_id = e.id and pa.notice_version = (select version from focusiq.current_privacy_notice()));
    m := focusiq.focusiq_day_email(updated, e.display_name, d.day_date, b ->> 'start', b ->> 'end', b ->> 'room',
                                  (b ->> 'minutes')::int, acknowledged);
    perform focusiq.focusiq_queue_notification(case when updated then 'day_updated' else 'day_invitation' end,
                                              e.id, null, m.subject, m.body, key, booking);
    employee_id := e.id; outcome := case when updated then 'updated' else 'invited' end; return next;
  end loop;
end $$;

-- Reminders to acknowledge the current notice, at most one every 3 days.
-- Outcomes: reminded, already_acknowledged, recently_reminded, not_active.
create or replace function focusiq.send_acknowledgement_reminders(p_employee_ids uuid[])
returns table (employee_id uuid, outcome text)
language plpgsql security definer set search_path = focusiq as $$
#variable_conflict use_column
declare e employees; v_id uuid;
begin
  if not focusiq.is_director() then raise exception 'Only Directors can send reminders.'; end if;
  foreach v_id in array p_employee_ids loop
    select * into e from employees where employees.id = v_id;
    employee_id := v_id;
    if not found or e.status <> 'active' then outcome := 'not_active';
    elsif exists (select 1 from participation_acknowledgements pa
                  where pa.employee_id = e.id and pa.notice_version = (select version from focusiq.current_privacy_notice())) then
      outcome := 'already_acknowledged';
    elsif exists (select 1 from notification_outbox o
                  where o.recipient_employee_id = e.id and o.kind = 'acknowledgement_reminder'
                    and o.status not in ('cancelled')
                    and coalesce(o.sent_at, o.created_at) > now() - interval '3 days') then
      outcome := 'recently_reminded';
    else
      perform focusiq.focusiq_notify_employee('acknowledgement_reminder', e.id, 'ack-reminder:' || e.id);
      outcome := 'reminded';
    end if;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Director daily summary (run by pg_cron; see docs/notifications.md)
-- ---------------------------------------------------------------------------
create or replace function focusiq.focusiq_plural(n int, one text, many text)
returns text language sql immutable as $$ select n || ' ' || case when n = 1 then one else many end $$;

create or replace function focusiq.focusiq_digest_lines(p_today date)
returns text[] language plpgsql stable security definer set search_path = focusiq as $$
declare
  lines text[] := '{}';
  n int;
  day assessment_days;
  notice text := (select version from focusiq.current_privacy_notice());
begin
  n := (select count(*) from adjustment_requests where status = 'pending');
  if n > 0 then lines := lines || (focusiq.focusiq_plural(n, 'adjustment request', 'adjustment requests') || ' awaiting a decision'); end if;
  n := (select count(*) from rights_requests where status <> 'closed' and due_at < p_today);
  if n > 0 then lines := lines || (focusiq.focusiq_plural(n, 'question or request', 'questions or requests') || ' overdue'); end if;
  n := (select count(*) from rights_requests where status <> 'closed' and due_at between p_today and p_today + 7);
  if n > 0 then lines := lines || (focusiq.focusiq_plural(n, 'question or request', 'questions or requests') || ' due within 7 days'); end if;
  select * into day from assessment_days where day_date between p_today and p_today + 3 order by day_date limit 1;
  if found then
    -- Same blocking rules as src/participation/readiness.ts.
    n := (select count(*) from employees e where e.status = 'active' and (
      not exists (select 1 from participation_acknowledgements pa where pa.employee_id = e.id and pa.notice_version = notice)
      or exists (select 1 from adjustment_requests ar where ar.employee_id = e.id and ar.status = 'pending')
      or exists (select 1 from rights_requests r where r.employee_id = e.id and r.request_type = 'objection' and r.status <> 'closed')));
    if n > 0 then
      lines := lines || ('Assessment day on ' || focusiq.focusiq_day_date(day.day_date) || ': '
                         || focusiq.focusiq_plural(n, 'person', 'people') || ' not ready yet');
    end if;
  end if;
  return lines;
end $$;

create or replace function focusiq.queue_director_digests(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = focusiq as $$
declare
  today date := (p_now at time zone 'Europe/London')::date;
  lines text[] := focusiq.focusiq_digest_lines(today);
  director uuid;
  queued int := 0;
  n int := coalesce(array_length(lines, 1), 0);
begin
  -- Scheduled at 07:00 and 08:00 UTC on weekdays: this sends at 08:00 UK time
  -- all year (GMT and BST); the per-day key stops a second email.
  if extract(hour from p_now at time zone 'Europe/London') < 8 then return 0; end if;
  if n = 0 then return 0; end if;
  for director in
    select ur.user_id from user_roles ur
    left join notification_preferences np on np.user_id = ur.user_id
    where ur.role in ('director', 'super_admin') and coalesce(np.director_digest, true)
  loop
    if not exists (select 1 from notification_outbox where coalesce_key = 'digest:' || director || ':' || today) then
      perform focusiq.focusiq_queue_notification('director_digest', null, director,
        'FocusiQ: ' || focusiq.focusiq_plural(n, 'thing needs', 'things need') || ' your attention',
        focusiq.focusiq_email_body('', array['Today in FocusiQ:', '']
          || (select array_agg('- ' || l) from unnest(lines) l)
          || array['', 'Sign in to the FocusiQ dashboard to deal with them:', '{{link}}']),
        'digest:' || director || ':' || today);
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end $$;

-- ---------------------------------------------------------------------------
-- Sending (service role only: used by the send-notifications Edge Function)
-- ---------------------------------------------------------------------------
create or replace function focusiq.claim_notifications(p_limit int default 50)
returns table (id uuid, kind text, audience text, email text, subject text, body text)
language plpgsql security definer set search_path = focusiq as $$
#variable_conflict use_column
begin
  -- Too old to be useful (e.g. queued while sending was not configured).
  update notification_outbox o set status = 'skipped', note = 'Not sent within 7 days of being queued', updated_at = now()
   where o.status = 'pending' and o.created_at < now() - interval '7 days';
  -- Nobody to send to: record it rather than retrying for ever.
  update notification_outbox o set status = 'skipped', note = 'No email address on record', updated_at = now()
   where o.status = 'pending' and o.next_attempt_at <= now()
     and not exists (
       select 1 from auth.users u
       where u.email is not null
         and u.id = coalesce(o.recipient_user_id, (select e.user_id from employees e where e.id = o.recipient_employee_id)));
  return query
  with claimed as (
    select o.id from notification_outbox o
    where o.status = 'pending' and o.next_attempt_at <= now()
    order by o.created_at
    limit p_limit
    for update skip locked
  )
  update notification_outbox o
     set status = 'sending', attempts = o.attempts + 1, updated_at = now()
    from claimed
   where o.id = claimed.id
  returning o.id, o.kind,
    case when o.recipient_user_id is null then 'employee' else 'director' end,
    (select u.email from auth.users u
      where u.id = coalesce(o.recipient_user_id, (select e.user_id from employees e where e.id = o.recipient_employee_id)))::text,
    o.subject, o.body;
end $$;

create or replace function focusiq.complete_notification(p_id uuid, p_ok boolean, p_error text default null)
returns void language plpgsql security definer set search_path = focusiq as $$
declare n notification_outbox;
begin
  select * into n from notification_outbox where id = p_id and status = 'sending' for update;
  if not found then return; end if;
  if p_ok then
    update notification_outbox set status = 'sent', sent_at = now(), note = null, updated_at = now() where id = n.id;
  elsif exists (select 1 from notification_outbox where coalesce_key = n.coalesce_key and status = 'pending') then
    -- A newer update about the same thing is already queued and covers this one.
    update notification_outbox set status = 'cancelled', note = left('Superseded by a newer update after a failed attempt: ' || coalesce(p_error, ''), 500), updated_at = now()
     where id = n.id;
  else
    update notification_outbox set
      status = case when n.attempts >= 5 then 'failed' else 'pending' end,
      note = left(p_error, 500),
      -- Back off 2, 4, 8, 16 minutes between attempts.
      next_attempt_at = now() + make_interval(mins => power(2, n.attempts)::int),
      updated_at = now()
    where id = n.id;
  end if;
end $$;

-- Recover emails stuck in 'sending' (e.g. the function crashed mid-batch).
create or replace function focusiq.release_stuck_notifications()
returns int language plpgsql security definer set search_path = focusiq as $$
declare n notification_outbox; released int := 0;
begin
  for n in select * from notification_outbox where status = 'sending' and updated_at < now() - interval '10 minutes' for update skip locked loop
    if exists (select 1 from notification_outbox where coalesce_key = n.coalesce_key and status = 'pending') then
      update notification_outbox set status = 'cancelled', note = 'Superseded by a newer update', updated_at = now() where id = n.id;
    else
      update notification_outbox set status = 'pending', updated_at = now() where id = n.id;
      released := released + 1;
    end if;
  end loop;
  return released;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'focusiq_queue_notification(text, uuid, uuid, text, text, text, jsonb)',
    'focusiq_notify_employee(text, uuid, text)',
    'focusiq_digest_lines(date)',
    'queue_director_digests(timestamptz)',
    'claim_notifications(int)',
    'complete_notification(uuid, boolean, text)',
    'release_stuck_notifications()'
  ] loop
    execute format('revoke all on function focusiq.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function focusiq.%s to service_role', f);
    end if;
  end loop;
  foreach f in array array['send_assessment_day_invitations(uuid, jsonb)', 'send_acknowledgement_reminders(uuid[])'] loop
    execute format('revoke all on function focusiq.%s from public', f);
    execute format('grant execute on function focusiq.%s to authenticated', f);
  end loop;
end $$;
