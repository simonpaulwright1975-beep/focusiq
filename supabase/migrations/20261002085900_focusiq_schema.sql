-- FocusiQ lives in its own schema in the shared WG Main project, like the
-- other Walter Geering apps (brand_iq, calliq, pageiq, …). Nothing FocusiQ
-- creates touches public: WG Main already has public.employees (the staff
-- directory) and public.is_director() belonging to other apps.
--
-- Signed-in users get table access; row-level security on every FocusiQ
-- table decides what they can actually see. Nothing is granted to anon.
-- To use it through the API, add "focusiq" to Settings → API → Exposed schemas.
create schema if not exists focusiq;

grant usage on schema focusiq to authenticated, service_role;
grant select, insert, update, delete on all tables in schema focusiq to authenticated;
grant all on all tables in schema focusiq to service_role;
grant usage, select on all sequences in schema focusiq to authenticated, service_role;
alter default privileges in schema focusiq grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema focusiq grant all on tables to service_role;
alter default privileges in schema focusiq grant usage, select on sequences to authenticated, service_role;
