-- The scheduler calls the send-notifications Edge Function with a token kept
-- in Supabase Vault ('focusiq_cron_secret'). The function checks it here, so
-- nobody has to copy the token into Edge Function secrets by hand.
create or replace function focusiq.cron_token_valid(p_token text)
returns boolean language plpgsql stable security definer set search_path = focusiq as $$
begin
  return coalesce(p_token, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'focusiq_cron_secret' and decrypted_secret = p_token);
end $$;
revoke all on function focusiq.cron_token_valid(text) from public;
grant execute on function focusiq.cron_token_valid(text) to service_role;
