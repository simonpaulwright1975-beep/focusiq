-- Email test mode (every email to one address) is set by the Edge Function
-- secret FOCUSIQ_EMAIL_REDIRECT_TO. This switch lets it be turned off from the
-- database, without the Supabase dashboard: when test_mode_off is true,
-- send-notifications ignores the secret and emails go to the real recipients.
create table if not exists focusiq.email_settings (
  id boolean primary key default true check (id),
  test_mode_off boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into focusiq.email_settings (id) values (true) on conflict (id) do nothing;
alter table focusiq.email_settings enable row level security;
revoke all on focusiq.email_settings from public, anon, authenticated;

create or replace function focusiq.email_test_mode_off()
returns boolean language sql stable security definer set search_path = focusiq as $$
  select coalesce((select test_mode_off from focusiq.email_settings where id), false)
$$;
revoke all on function focusiq.email_test_mode_off() from public, anon, authenticated;
grant execute on function focusiq.email_test_mode_off() to service_role;
