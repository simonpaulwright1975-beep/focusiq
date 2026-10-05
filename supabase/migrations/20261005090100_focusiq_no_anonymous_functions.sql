-- No FocusiQ function is callable without signing in.
--
-- Postgres lets everyone (PUBLIC, which includes Supabase's `anon` role)
-- execute new functions by default. Every FocusiQ function already checks who
-- is calling, but anonymous access should not exist at all (Supabase security
-- advisor 0028). For each FocusiQ function still open to PUBLIC: take that
-- away and give it to signed-in users and the service role instead. Functions
-- already restricted (e.g. service-role-only email sending) are untouched.
-- Trigger functions do not need EXECUTE to fire.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'focusiq'
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Future FocusiQ functions start closed; migrations grant what each one needs.
alter default privileges in schema focusiq revoke execute on functions from public;
