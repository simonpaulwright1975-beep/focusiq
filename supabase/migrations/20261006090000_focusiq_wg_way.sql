-- "Live the Walter Geering Way – Put the Playbook into Practice": a separate,
-- 10-minute knowledge check for the sales team (app/wg-way.html). Kept apart
-- from the FocusiQ assessment and its results.
--
-- The server draws each sitting's 25 questions (balanced by topic, never two
-- near-duplicates together) and scores it. The right answers live only in
-- focusiq.wg_way_questions, which only Directors can read; staff browsers get
-- the question wording from the app and never an answer. Staff see their own
-- score and topic counts only once a Director shares it (my_wg_way_results()).
--
-- Draw counts and near-duplicate pairs must stay in step with
-- app/src/demo/wgWayBank.ts (WG_WAY_DRAW, WG_WAY_NOT_TOGETHER); tests/wgway.test.ts
-- checks this. The answer key is loaded separately (scripts/wg-way-sql.ts).

create table if not exists focusiq.wg_way_questions (
  id text primary key,
  topic text not null,
  answer text not null,
  active boolean not null default true
);
comment on table focusiq.wg_way_questions is 'WG Way check answer key – Directors only, never sent to staff';

create table if not exists focusiq.wg_way_sittings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references focusiq.employees (id),
  question_ids text[] not null,
  started_at timestamptz not null default now(),
  -- presentation id -> question id, and presentation id -> the person's latest answer
  presentations jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  -- how many runner events the server has received (so a reload resumes without re-sending)
  events_received integer not null default 0,
  submitted_at timestamptz,
  correct integer,
  total integer,
  by_topic jsonb,
  shared_at timestamptz,
  shared_by uuid references auth.users (id)
);
create index if not exists wg_way_sittings_employee on focusiq.wg_way_sittings (employee_id, started_at);
comment on table focusiq.wg_way_sittings is 'WG Way check sittings: written only through the wg_way_* functions; Directors can read them';

alter table focusiq.wg_way_questions enable row level security;
alter table focusiq.wg_way_sittings enable row level security;

drop policy if exists wg_way_questions_director on focusiq.wg_way_questions;
create policy wg_way_questions_director on focusiq.wg_way_questions for select using (focusiq.is_director());
drop policy if exists wg_way_sittings_director on focusiq.wg_way_sittings;
create policy wg_way_sittings_director on focusiq.wg_way_sittings for select using (focusiq.is_director());

revoke all on focusiq.wg_way_questions, focusiq.wg_way_sittings from public, anon, authenticated;
grant select on focusiq.wg_way_questions, focusiq.wg_way_sittings to authenticated;

-- How many questions each sitting takes from each topic (25 in all) – WG_WAY_DRAW.
create or replace function focusiq.wg_way_draw_counts()
returns table (topic text, n integer) language sql immutable set search_path = focusiq as $$
  values ('history', 4), ('way', 3), ('products', 3), ('supply', 2), ('playbook', 7), ('newbiz', 6), ('business', 0)
$$;

-- Questions too alike to appear in the same sitting – WG_WAY_NOT_TOGETHER.
create or replace function focusiq.wg_way_not_together()
returns table (a text, b text) language sql immutable set search_path = focusiq as $$
  values ('wg-13', 'wg-33'), ('wg-10', 'wg-44'), ('wg-10', 'wg-45'), ('wg-61', 'wg-53'), ('wg-61', 'wg-54')
$$;

create or replace function focusiq.wg_way_draw()
returns text[] language plpgsql volatile set search_path = focusiq as $$
declare
  picked text[];
  attempt integer := 0;
  d record;
begin
  loop
    attempt := attempt + 1;
    picked := array[]::text[];
    for d in select * from focusiq.wg_way_draw_counts() where n > 0 loop
      picked := picked || array(
        select q.id from focusiq.wg_way_questions q where q.topic = d.topic and q.active order by random() limit d.n);
    end loop;
    exit when attempt >= 100 or not exists (
      select 1 from focusiq.wg_way_not_together() p where p.a = any (picked) and p.b = any (picked));
  end loop;
  if cardinality(picked) = 0 then raise exception 'The WG Way check is not open yet.'; end if;
  return array(select x from unnest(picked) x order by random());
end $$;

-- Starts a sitting for the signed-in person, or resumes the one they left open.
create or replace function focusiq.wg_way_start()
returns table (sitting_id uuid, question_ids text[], events_received integer, presentation_ids text[])
language plpgsql security definer set search_path = focusiq as $$
declare
  me uuid := focusiq.my_employee_id();
  dept text;
  s focusiq.wg_way_sittings;
begin
  if me is null or not focusiq.is_focusiq_user() then
    raise exception 'You need a FocusiQ record to take this check. Please ask a Director.';
  end if;
  select e.department into dept from focusiq.employees e where e.id = me;
  if dept <> 'Sales' and not focusiq.is_director() then
    raise exception 'This check is for the sales team.';
  end if;
  select * into s from focusiq.wg_way_sittings w
   where w.employee_id = me and w.submitted_at is null and w.started_at > now() - interval '30 minutes'
   order by w.started_at desc limit 1;
  if not found then
    insert into focusiq.wg_way_sittings (employee_id, question_ids) values (me, focusiq.wg_way_draw()) returning * into s;
  end if;
  return query select s.id, s.question_ids, s.events_received,
    array(select k from jsonb_object_keys(s.presentations) k);
end $$;

-- Saves a batch of the runner's events (only the latest answer to each question is kept).
-- p_presentations: {presentation id: question id}; p_events: [{seq, presentation_id, answer}].
create or replace function focusiq.wg_way_save(p_sitting uuid, p_presentations jsonb, p_events jsonb)
returns void language plpgsql security definer set search_path = focusiq as $$
declare
  s focusiq.wg_way_sittings;
  e record;
  bad text;
begin
  select * into s from focusiq.wg_way_sittings w where w.id = p_sitting for update;
  if not found or s.employee_id is distinct from focusiq.my_employee_id() then
    raise exception 'Sitting not found.';
  end if;
  if s.submitted_at is not null then return; end if;
  select p.value into bad from jsonb_each_text(coalesce(p_presentations, '{}'::jsonb)) p
   where not (p.value = any (s.question_ids)) limit 1;
  if bad is not null then raise exception 'That question is not part of this sitting.'; end if;
  s.presentations := s.presentations || coalesce(p_presentations, '{}'::jsonb);
  -- Answers count only within the time allowed (10 minutes, plus a margin for slow connections).
  for e in
    select (x->>'seq')::integer as seq, x->>'presentation_id' as pid, x->>'answer' as answer
      from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) x order by 1
  loop
    continue when e.seq <= s.events_received;
    if e.answer is not null and e.pid is not null and s.presentations ? e.pid
       and now() <= s.started_at + interval '13 minutes' then
      s.answers := s.answers || jsonb_build_object(e.pid, e.answer);
    end if;
    s.events_received := e.seq;
  end loop;
  update focusiq.wg_way_sittings w
     set presentations = s.presentations, answers = s.answers, events_received = s.events_received
   where w.id = s.id;
end $$;

-- Finishes and scores the sitting. Unanswered questions count as wrong. Returns nothing to the person.
create or replace function focusiq.wg_way_submit(p_sitting uuid)
returns void language plpgsql security definer set search_path = focusiq as $$
declare
  s focusiq.wg_way_sittings;
  n_correct integer;
  n_total integer;
  topics jsonb;
begin
  select * into s from focusiq.wg_way_sittings w where w.id = p_sitting for update;
  if not found or s.employee_id is distinct from focusiq.my_employee_id() then
    raise exception 'Sitting not found.';
  end if;
  if s.submitted_at is not null then return; end if;
  with given as (
    select p.value as qid, s.answers->>p.key as answer from jsonb_each_text(s.presentations) p
  ), marked as (
    select q.topic, coalesce(bool_or(g.answer = q.answer), false) as ok
      from unnest(s.question_ids) d(id)
      join focusiq.wg_way_questions q on q.id = d.id
      left join given g on g.qid = d.id
     group by d.id, q.topic
  ), per_topic as (
    select topic, count(*) filter (where ok) as c, count(*) as t from marked group by topic
  )
  select coalesce(sum(c), 0), coalesce(sum(t), 0),
         coalesce(jsonb_object_agg(topic, jsonb_build_object('correct', c, 'total', t)), '{}'::jsonb)
    into n_correct, n_total, topics from per_topic;
  update focusiq.wg_way_sittings w
     set submitted_at = now(), correct = n_correct, total = n_total, by_topic = topics
   where w.id = s.id;
end $$;

-- A Director shares a scored sitting with the person who sat it, or stops sharing it.
create or replace function focusiq.wg_way_set_shared(p_sitting uuid, p_shared boolean)
returns void language plpgsql security definer set search_path = focusiq as $$
begin
  if not focusiq.is_director() then raise exception 'Only Directors can share results.'; end if;
  update focusiq.wg_way_sittings w
     set shared_at = case when p_shared then now() end,
         shared_by = case when p_shared then auth.uid() end
   where w.id = p_sitting and w.submitted_at is not null;
  if not found then raise exception 'That sitting has not been finished.'; end if;
end $$;

-- The signed-in person's shared results: score and topic counts only (never
-- the questions, answers or who shared them), latest first.
create or replace function focusiq.my_wg_way_results()
returns table (sitting_id uuid, completed_at timestamptz, correct integer, total integer, by_topic jsonb, shared_at timestamptz)
language sql stable security definer set search_path = focusiq as $$
  select w.id, w.submitted_at, w.correct, w.total, w.by_topic, w.shared_at
    from focusiq.wg_way_sittings w
   where w.employee_id = focusiq.my_employee_id() and w.submitted_at is not null and w.shared_at is not null
   order by w.submitted_at desc
$$;

revoke all on function focusiq.wg_way_draw_counts(), focusiq.wg_way_not_together(), focusiq.wg_way_draw() from public, anon, authenticated;
revoke all on function focusiq.wg_way_start(), focusiq.wg_way_save(uuid, jsonb, jsonb), focusiq.wg_way_submit(uuid),
  focusiq.wg_way_set_shared(uuid, boolean), focusiq.my_wg_way_results() from public, anon;
grant execute on function focusiq.wg_way_start(), focusiq.wg_way_save(uuid, jsonb, jsonb), focusiq.wg_way_submit(uuid),
  focusiq.wg_way_set_shared(uuid, boolean), focusiq.my_wg_way_results() to authenticated;
