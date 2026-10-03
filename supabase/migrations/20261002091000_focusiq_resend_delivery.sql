set search_path = focusiq;

-- Sending through Resend: delivery tracking and richer send outcomes.
--
-- * provider_message_id links an email to Resend, so its delivery webhooks
--   (resend-webhook Edge Function → record_email_event) can mark it
--   delivered, delayed, bounced or complained (reported as spam).
-- * complete_notification() now takes the outcome from
--   supabase/functions/_shared/resend.ts: sent, retry, permanent or requeue.
-- * The Director daily summary also counts emails that were not delivered.

alter table focusiq.notification_outbox
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text
    check (delivery_status in ('delivered', 'delayed', 'bounced', 'complained')),
  add column if not exists delivery_updated_at timestamptz;
create unique index if not exists notification_outbox_provider_message
  on focusiq.notification_outbox (provider_message_id) where provider_message_id is not null;

drop function if exists focusiq.complete_notification(uuid, boolean, text);

create or replace function focusiq.complete_notification(
  p_id uuid, p_outcome text, p_detail text default null, p_message_id text default null, p_retry_after_seconds int default null)
returns void language plpgsql security definer set search_path = focusiq as $$
declare
  n notification_outbox;
  superseded boolean;
begin
  if p_outcome not in ('sent', 'retry', 'permanent', 'requeue') then raise exception 'Unknown outcome %', p_outcome; end if;
  select * into n from notification_outbox where id = p_id and status = 'sending' for update;
  if not found then return; end if;
  -- A newer update about the same thing may already be waiting; it covers this one.
  superseded := exists (select 1 from notification_outbox where coalesce_key = n.coalesce_key and status = 'pending');

  if p_outcome = 'sent' then
    update notification_outbox
       set status = 'sent', sent_at = now(), note = null, provider_message_id = nullif(p_message_id, ''), updated_at = now()
     where id = n.id;
  elsif superseded then
    update notification_outbox
       set status = 'cancelled', note = left('Superseded by a newer update after: ' || coalesce(p_detail, 'a failed attempt'), 500), updated_at = now()
     where id = n.id;
  elsif p_outcome = 'permanent' then
    update notification_outbox set status = 'failed', note = left(p_detail, 500), updated_at = now() where id = n.id;
  elsif p_outcome = 'requeue' then
    -- Not the email's fault (rate limit, or our Resend setup): no attempt is counted.
    update notification_outbox
       set status = 'pending', attempts = greatest(n.attempts - 1, 0), note = left(p_detail, 500),
           next_attempt_at = now() + make_interval(secs => coalesce(p_retry_after_seconds, 60)), updated_at = now()
     where id = n.id;
  else
    update notification_outbox set
      status = case when n.attempts >= 5 then 'failed' else 'pending' end,
      note = left(p_detail, 500),
      -- Back off 2, 4, 8, 16 minutes between attempts.
      next_attempt_at = now() + make_interval(mins => power(2, n.attempts)::int),
      updated_at = now()
    where id = n.id;
  end if;
end $$;

-- Delivery events from Resend's webhooks. Later events never downgrade an
-- earlier, more serious one (e.g. a late "delayed" after "bounced").
create or replace function focusiq.record_email_event(p_message_id text, p_status text, p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path = focusiq as $$
declare rank_of jsonb := '{"delayed": 1, "delivered": 2, "bounced": 3, "complained": 4}';
begin
  if not rank_of ? p_status then raise exception 'Unknown delivery status %', p_status; end if;
  update notification_outbox
     set delivery_status = p_status, delivery_updated_at = p_at, updated_at = now()
   where provider_message_id = p_message_id
     and coalesce((rank_of ->> delivery_status)::int, 0) <= (rank_of ->> p_status)::int;
  return found;
end $$;

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
  -- Emails that never arrived: failed after retries, or bounced (Resend webhook).
  n := (select count(*) from notification_outbox
        where (status = 'failed' or delivery_status = 'bounced')
          and coalesce(delivery_updated_at, updated_at) >= p_today - 7);
  if n > 0 then lines := lines || (focusiq.focusiq_plural(n, 'email', 'emails') || ' not delivered in the last 7 days'); end if;
  return lines;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'complete_notification(uuid, text, text, text, int)',
    'record_email_event(text, text, timestamptz)',
    'focusiq_digest_lines(date)'
  ] loop
    execute format('revoke all on function focusiq.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function focusiq.%s to service_role', f);
    end if;
  end loop;
end $$;
