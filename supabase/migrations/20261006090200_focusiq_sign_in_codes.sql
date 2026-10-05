-- One-time sign-in codes: a Director gives a person a short code (e.g. on the
-- day of an assessment), and the person types it into FocusiQ instead of their
-- Hub email and password.
--
-- A code works once, for 12 hours, and making a new code for someone cancels
-- their unused one. Only a hash is stored. The code is swapped for a sign-in by
-- the Edge Function `focusiq-code-sign-in` (service role only: redeem_sign_in_code is
-- not callable by anyone signed in or anonymous). Because WG Main's sign-ins
-- are shared, the sign-in is to the person's Walter Geering account: give codes
-- to the person directly, never through a shared channel.

create table if not exists focusiq.sign_in_codes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references focusiq.employees (id),
  code_hash text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists sign_in_codes_employee on focusiq.sign_in_codes (employee_id, created_at);
comment on table focusiq.sign_in_codes is 'One-time sign-in codes (hash only). Written and read only through the functions below.';

alter table focusiq.sign_in_codes enable row level security;
revoke all on focusiq.sign_in_codes from public, anon, authenticated;

-- Upper-case letters and digits without look-alikes (no I, L, O, 0, 1).
create or replace function focusiq.sign_in_code_hash(p_code text)
returns text language sql immutable set search_path = focusiq as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
$$;

-- A Director makes a code for one person; it is shown once and never stored in plain text.
create or replace function focusiq.create_sign_in_code(p_employee_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = focusiq as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  raw text := '';
  i integer;
  e focusiq.employees;
  until_at timestamptz := now() + interval '12 hours';
begin
  if not focusiq.is_director() then raise exception 'Only Directors can make sign-in codes.'; end if;
  select * into e from focusiq.employees where id = p_employee_id;
  if not found then raise exception 'That person is not in FocusiQ.'; end if;
  if e.status <> 'active' then raise exception 'That person is not active in FocusiQ.'; end if;
  if e.user_id is null then raise exception 'That person has no Walter Geering login yet: set one up in the Hub first.'; end if;
  -- 10 characters from 31 (about 50 bits). gen_random_uuid() is cryptographically random;
  -- bytes 6 and 8 of each uuid carry its version and variant, so read only bytes 0–5 and 10–13.
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13] loop
    raw := raw || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  update focusiq.sign_in_codes c set cancelled_at = now()
   where c.employee_id = p_employee_id and c.used_at is null and c.cancelled_at is null;
  insert into focusiq.sign_in_codes (employee_id, code_hash, created_by, expires_at)
  values (p_employee_id, focusiq.sign_in_code_hash(raw), auth.uid(), until_at);
  return query select substr(raw, 1, 5) || '-' || substr(raw, 6, 5), until_at;
end $$;

-- Latest code per person, for the Staff tab (never the code itself).
create or replace function focusiq.sign_in_code_status()
returns table (employee_id uuid, created_at timestamptz, expires_at timestamptz, used_at timestamptz)
language sql stable security definer set search_path = focusiq as $$
  select distinct on (c.employee_id) c.employee_id, c.created_at, c.expires_at, c.used_at
    from focusiq.sign_in_codes c
   where focusiq.is_director() and c.cancelled_at is null
   order by c.employee_id, c.created_at desc
$$;

-- Used by the focusiq-code-sign-in Edge Function (service role): marks the code used and
-- returns the person's login id, or null when the code is wrong, used, cancelled or expired.
create or replace function focusiq.redeem_sign_in_code(p_code text)
returns uuid language plpgsql security definer set search_path = focusiq as $$
declare
  login uuid;
begin
  update focusiq.sign_in_codes c set used_at = now()
   where c.code_hash = focusiq.sign_in_code_hash(p_code)
     and c.used_at is null and c.cancelled_at is null and c.expires_at > now()
  returning (select e.user_id from focusiq.employees e where e.id = c.employee_id and e.status = 'active') into login;
  return login;
end $$;

revoke all on function focusiq.sign_in_code_hash(text), focusiq.create_sign_in_code(uuid),
  focusiq.sign_in_code_status(), focusiq.redeem_sign_in_code(text) from public, anon, authenticated;
grant execute on function focusiq.create_sign_in_code(uuid), focusiq.sign_in_code_status() to authenticated;
grant execute on function focusiq.redeem_sign_in_code(text) to service_role;
