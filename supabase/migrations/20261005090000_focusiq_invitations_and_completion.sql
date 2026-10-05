set search_path = focusiq;

-- Invitations, completion emails and the daily summary's completion count.
--
-- * focusiq_invitation: a Director adds someone to FocusiQ (Staff tab) and
--   invites them, or resends the invitation (invite_staff()).
-- * assessment_completed: sent when an employee submits their assessment.
-- * The Director daily summary adds "N assessments completed since the last
--   summary" (information, not action) and is also sent when that is all there
--   is to say.
-- * sync_staff_directory() now gives the employee role to people whose login
--   was created after they were added to FocusiQ.
--
-- Emails stay content-free (CLAUDE.md). The wording is mirrored by
-- src/participation/notifications.ts (tests/notifications.test.ts).

-- ---------------------------------------------------------------------------
-- New email kinds
-- ---------------------------------------------------------------------------
alter table focusiq.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table focusiq.notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'adjustment_decided', 'request_reply', 'request_extended', 'request_closed', 'summary_released',
  'day_invitation', 'day_updated', 'acknowledgement_reminder', 'focusiq_invitation', 'assessment_completed',
  'director_digest'
));

create or replace function focusiq.focusiq_employee_email(p_kind text, p_name text, out subject text, out body text)
language plpgsql immutable set search_path = focusiq as $$
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
    when 'focusiq_invitation' then
      subject := 'You are invited to take part in FocusiQ';
      line := 'Walter Geering has invited you to take part in FocusiQ, which helps us understand how people approach their work so we can support you better. It is not a pass/fail test. Sign in with your usual Walter Geering account to find out more:';
    when 'assessment_completed' then
      subject := 'Thank you – your FocusiQ assessment is complete';
      line := 'Thank you for completing your FocusiQ assessment. Your answers have been saved. Walter Geering will review them and you will receive your own summary afterwards. You can sign in to FocusiQ at any time:';
    else raise exception 'Unknown notification kind %', p_kind;
  end case;
  body := focusiq.focusiq_email_body(p_name, array[line, '{{link}}']);
end $$;

-- ---------------------------------------------------------------------------
-- Completion email
-- ---------------------------------------------------------------------------
create or replace function focusiq.notify_assessment_completed()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  if new.complete and not coalesce(old.complete, false) then
    perform focusiq.focusiq_notify_employee('assessment_completed', new.employee_id, 'completed:' || new.id);
  end if;
  return new;
end $$;

create or replace trigger assessments_notify_completed
  after update of complete on focusiq.assessments
  for each row execute function focusiq.notify_assessment_completed();

-- ---------------------------------------------------------------------------
-- Invitations (Directors)
-- ---------------------------------------------------------------------------
-- Returns 'invited', 'recently_invited' (within 3 days, or still waiting to
-- send), 'no_login' (no WG account yet: set one up in the Hub first) or
-- 'not_active'.
create or replace function focusiq.invite_staff(p_employee_id uuid)
returns text language plpgsql security definer set search_path = focusiq as $$
declare e employees;
begin
  if not focusiq.is_director() then raise exception 'Only Directors can send FocusiQ invitations.'; end if;
  select * into e from employees where id = p_employee_id;
  if not found then raise exception 'That person is not in FocusiQ.'; end if;
  if e.status <> 'active' then return 'not_active'; end if;
  if e.user_id is null then return 'no_login'; end if;
  if exists (
    select 1 from notification_outbox o
    where o.coalesce_key = 'invite:' || e.id
      and (o.status in ('pending', 'sending') or (o.status = 'sent' and o.sent_at > now() - interval '3 days'))
  ) then
    return 'recently_invited';
  end if;
  perform focusiq.focusiq_notify_employee('focusiq_invitation', e.id, 'invite:' || e.id);
  return 'invited';
end $$;

-- When each person in FocusiQ was last invited (Staff tab).
create or replace function focusiq.staff_invitations()
returns table (employee_id uuid, last_invited_at timestamptz, invitation_status text)
language plpgsql stable security definer set search_path = focusiq as $$
#variable_conflict use_column
begin
  if not focusiq.is_director() then raise exception 'Only Directors can view invitations.'; end if;
  return query
  select distinct on (o.recipient_employee_id) o.recipient_employee_id, coalesce(o.sent_at, o.created_at), o.status
  from notification_outbox o
  where o.kind = 'focusiq_invitation'
  order by o.recipient_employee_id, o.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- Staff directory sync: logins created after someone was added get the role
-- ---------------------------------------------------------------------------
create or replace function focusiq.sync_staff_directory()
returns jsonb language plpgsql security definer set search_path = focusiq as $$
declare
  renamed int; left_count int; returned int; logins int; roles int;
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

-- ---------------------------------------------------------------------------
-- Director daily summary: completion count
-- ---------------------------------------------------------------------------
-- Information lines (no action needed): counts only, never names.
create or replace function focusiq.focusiq_digest_info_lines(p_now timestamptz)
returns text[] language plpgsql stable security definer set search_path = focusiq as $$
declare
  today date := (p_now at time zone 'Europe/London')::date;
  -- The previous working day's summary (Monday's covers the weekend).
  prev date := today - case extract(isodow from today)::int when 1 then 3 when 7 then 2 else 1 end;
  since timestamptz := (prev + time '08:00') at time zone 'Europe/London';
  n int;
begin
  n := (select count(*) from assessments where complete and completed_at >= since and completed_at < p_now);
  if n > 0 then return array[focusiq.focusiq_plural(n, 'assessment', 'assessments') || ' completed since the last summary']; end if;
  return '{}';
end $$;

create or replace function focusiq.queue_director_digests(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = focusiq as $$
declare
  today date := (p_now at time zone 'Europe/London')::date;
  lines text[] := focusiq.focusiq_digest_lines(today);
  info text[] := focusiq.focusiq_digest_info_lines(p_now);
  director uuid;
  queued int := 0;
  n int := coalesce(array_length(lines, 1), 0);
  m int := coalesce(array_length(info, 1), 0);
begin
  -- Scheduled at 07:00 and 08:00 UTC on weekdays: this sends at 08:00 UK time
  -- all year (GMT and BST); the per-day key stops a second email.
  if extract(hour from p_now at time zone 'Europe/London') < 8 then return 0; end if;
  if n + m = 0 then return 0; end if;
  for director in
    select ur.user_id from user_roles ur
    left join notification_preferences np on np.user_id = ur.user_id
    where ur.role in ('director', 'super_admin') and coalesce(np.director_digest, true)
  loop
    if not exists (select 1 from notification_outbox where coalesce_key = 'digest:' || director || ':' || today) then
      perform focusiq.focusiq_queue_notification('director_digest', null, director,
        case when n > 0 then 'FocusiQ: ' || focusiq.focusiq_plural(n, 'thing needs', 'things need') || ' your attention'
             else 'FocusiQ: daily summary' end,
        focusiq.focusiq_email_body('', array['Today in FocusiQ:', '']
          || (select array_agg('- ' || l) from unnest(lines || info) l)
          || array['', case when n > 0 then 'Sign in to the FocusiQ dashboard to deal with them:'
                            else 'Sign in to the FocusiQ dashboard to see more:' end, '{{link}}']),
        'digest:' || director || ':' || today);
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function focusiq.invite_staff(uuid) from public;
revoke all on function focusiq.staff_invitations() from public;
revoke all on function focusiq.focusiq_digest_info_lines(timestamptz) from public;
revoke all on function focusiq.notify_assessment_completed() from public;
grant execute on function focusiq.invite_staff(uuid) to authenticated;
grant execute on function focusiq.staff_invitations() to authenticated;
