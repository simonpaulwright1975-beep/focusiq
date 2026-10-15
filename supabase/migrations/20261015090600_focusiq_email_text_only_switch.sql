-- Plain-text-only switch for FocusiQ emails. Microsoft 365 delivered the plain
-- invitation but held back the styled (HTML) one, so the HTML version can be
-- turned off from the database while that is looked into.
alter table focusiq.email_settings add column if not exists html_off boolean not null default false;

create or replace function focusiq.email_html_off()
returns boolean language sql stable security definer set search_path = focusiq as $$
  select coalesce((select html_off from focusiq.email_settings where id), false)
$$;
revoke all on function focusiq.email_html_off() from public, anon, authenticated;
grant execute on function focusiq.email_html_off() to service_role;
