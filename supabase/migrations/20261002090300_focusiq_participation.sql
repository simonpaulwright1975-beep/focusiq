set search_path = focusiq;

-- FocusiQ participation: privacy notice, employee acknowledgement, adjustment
-- requests and data-rights requests.
--
-- The tick boxes record that the employee has read and understood the notice
-- (lawful basis: legitimate interests) – they are not "consent". No assessment
-- can start until the current published notice has been acknowledged.

create table if not exists focusiq.privacy_notices (
  version text primary key,                 -- e.g. 'privacy-notice/1.0.0'
  title text not null,
  content jsonb not null,                   -- summary, sections, acknowledgement items
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  -- A notice with unfilled [[placeholders]] can never be published.
  check (published_at is null or position('[[' in content::text) = 0),
  check (jsonb_array_length(content -> 'acknowledgements') > 0)
);

drop trigger if exists privacy_notices_immutable on focusiq.privacy_notices;
create trigger privacy_notices_immutable before update or delete on focusiq.privacy_notices
  for each row execute function focusiq.focusiq_published_is_immutable();

-- The notice employees must currently acknowledge.
create or replace function focusiq.current_privacy_notice()
returns focusiq.privacy_notices
language sql stable security definer set search_path = focusiq as $$
  select * from focusiq.privacy_notices
  where published_at is not null and published_at <= now() and retired_at is null
  order by published_at desc
  limit 1
$$;

create table if not exists focusiq.participation_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references focusiq.employees (id) on delete restrict,
  notice_version text not null references focusiq.privacy_notices (version),
  notice_sha256 text not null,
  acknowledged_items jsonb not null,       -- [{id, text}] snapshot of the wording ticked
  details_confirmed jsonb not null,         -- record details shown to the employee
  details_correct boolean not null,
  details_correction text,
  adjustment_requested boolean not null,
  adjustment_description text,
  typed_name text not null check (btrim(typed_name) <> ''),
  acknowledged_at timestamptz not null default now(),
  user_agent text,
  check (details_correct or coalesce(btrim(details_correction), '') <> ''),
  check (not adjustment_requested or coalesce(btrim(adjustment_description), '') <> '')
);
create index if not exists participation_ack_employee_idx
  on focusiq.participation_acknowledgements (employee_id, acknowledged_at);

-- The acknowledgement must match the exact published wording: same fingerprint
-- and every acknowledgement item ticked.
create or replace function focusiq.participation_ack_validate()
returns trigger language plpgsql security definer set search_path = focusiq as $$
declare n focusiq.privacy_notices;
begin
  select * into n from focusiq.privacy_notices where version = new.notice_version;
  if n.published_at is null or n.retired_at is not null then
    raise exception 'Notice % is not currently published.', new.notice_version;
  end if;
  if new.notice_sha256 <> n.content_sha256 then
    raise exception 'The acknowledged wording does not match the published notice.';
  end if;
  if (select array_agg(i ->> 'id' order by i ->> 'id') from jsonb_array_elements(new.acknowledged_items) i)
     is distinct from
     (select array_agg(i ->> 'id' order by i ->> 'id') from jsonb_array_elements(n.content -> 'acknowledgements') i) then
    raise exception 'Every acknowledgement statement must be ticked.';
  end if;
  new.acknowledged_at := now();
  return new;
end $$;

drop trigger if exists participation_ack_validate on focusiq.participation_acknowledgements;
create trigger participation_ack_validate before insert on focusiq.participation_acknowledgements
  for each row execute function focusiq.participation_ack_validate();

drop trigger if exists participation_ack_append_only on focusiq.participation_acknowledgements;
create trigger participation_ack_append_only before update or delete on focusiq.participation_acknowledgements
  for each row execute function focusiq.focusiq_append_only();

-- Adjustment requests raised from the form; a Director decides.
create table if not exists focusiq.adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references focusiq.employees (id) on delete restrict,
  acknowledgement_id uuid references focusiq.participation_acknowledgements (id) on delete restrict,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'agreed', 'declined')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (status = 'pending' or (decided_by is not null and decided_at is not null))
);

-- "Questions or concerns": questions and data-rights requests.
create table if not exists focusiq.rights_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references focusiq.employees (id) on delete restrict,
  request_type text not null check (request_type in ('question', 'copy_of_data', 'correction', 'objection')),
  message text not null check (btrim(message) <> ''),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  response text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Raise follow-ups automatically from the acknowledgement.
create or replace function focusiq.participation_ack_followups()
returns trigger language plpgsql security definer set search_path = focusiq as $$
begin
  if new.adjustment_requested then
    insert into focusiq.adjustment_requests (employee_id, acknowledgement_id, description)
    values (new.employee_id, new.id, new.adjustment_description);
  end if;
  if not new.details_correct then
    insert into focusiq.rights_requests (employee_id, request_type, message)
    values (new.employee_id, 'correction', new.details_correction);
  end if;
  return new;
end $$;

drop trigger if exists participation_ack_followups on focusiq.participation_acknowledgements;
create trigger participation_ack_followups after insert on focusiq.participation_acknowledgements
  for each row execute function focusiq.participation_ack_followups();

-- No assessment may start without an acknowledgement of the current notice.
create or replace function focusiq.assessment_requires_acknowledgement()
returns trigger language plpgsql security definer set search_path = focusiq as $$
declare n focusiq.privacy_notices := focusiq.current_privacy_notice();
begin
  if n.version is null then
    raise exception 'No FocusiQ privacy notice has been published yet.';
  end if;
  if not exists (
    select 1 from focusiq.participation_acknowledgements
    where employee_id = new.employee_id and notice_version = n.version
  ) then
    raise exception 'The employee must acknowledge the current privacy notice (%) before starting an assessment.', n.version;
  end if;
  return new;
end $$;

drop trigger if exists assessment_requires_acknowledgement on focusiq.assessments;
create trigger assessment_requires_acknowledgement before insert on focusiq.assessments
  for each row execute function focusiq.assessment_requires_acknowledgement();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
create or replace function focusiq.my_employee_id()
returns uuid language sql stable security definer set search_path = focusiq as $$
  select id from focusiq.employees where user_id = auth.uid()
$$;

alter table focusiq.privacy_notices enable row level security;
alter table focusiq.participation_acknowledgements enable row level security;
alter table focusiq.adjustment_requests enable row level security;
alter table focusiq.rights_requests enable row level security;

drop policy if exists privacy_notices_read on focusiq.privacy_notices;
create policy privacy_notices_read on focusiq.privacy_notices
  for select using (published_at is not null or focusiq.is_director());
drop policy if exists privacy_notices_director on focusiq.privacy_notices;
create policy privacy_notices_director on focusiq.privacy_notices
  for all using (focusiq.is_director()) with check (focusiq.is_director());

drop policy if exists participation_ack_own_read on focusiq.participation_acknowledgements;
create policy participation_ack_own_read on focusiq.participation_acknowledgements
  for select using (employee_id = focusiq.my_employee_id() or focusiq.is_director());
drop policy if exists participation_ack_own_insert on focusiq.participation_acknowledgements;
create policy participation_ack_own_insert on focusiq.participation_acknowledgements
  for insert with check (employee_id = focusiq.my_employee_id());

drop policy if exists adjustment_requests_read on focusiq.adjustment_requests;
create policy adjustment_requests_read on focusiq.adjustment_requests
  for select using (employee_id = focusiq.my_employee_id() or focusiq.is_director());
drop policy if exists adjustment_requests_decide on focusiq.adjustment_requests;
create policy adjustment_requests_decide on focusiq.adjustment_requests
  for update using (focusiq.can_alter_benchmark_inclusion())
  with check (focusiq.can_alter_benchmark_inclusion() and decided_by = auth.uid());

drop policy if exists rights_requests_read on focusiq.rights_requests;
create policy rights_requests_read on focusiq.rights_requests
  for select using (employee_id = focusiq.my_employee_id() or focusiq.is_director());
drop policy if exists rights_requests_own_insert on focusiq.rights_requests;
create policy rights_requests_own_insert on focusiq.rights_requests
  for insert with check (employee_id = focusiq.my_employee_id() and status = 'open' and response is null);
drop policy if exists rights_requests_respond on focusiq.rights_requests;
create policy rights_requests_respond on focusiq.rights_requests
  for update using (focusiq.is_director()) with check (focusiq.is_director());

-- Employees start their own assessments (the trigger above enforces the acknowledgement).
drop policy if exists assessments_own_insert on focusiq.assessments;
create policy assessments_own_insert on focusiq.assessments
  for insert with check (employee_id = focusiq.my_employee_id() and not complete);
