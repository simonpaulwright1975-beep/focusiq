set search_path = focusiq;

-- FocusiQ response capture: exactly what each employee saw and did.
--
-- Two append-only records make every assessment reconstructable:
--   assessment_presentations – the exact question version and rendered content
--                              (incl. randomised option order) shown, in order
--   response_events          – every interaction, timestamped: views, revisits,
--                              answer selections/changes, timers, focus changes
-- Answer-change history, revisit history and timing are derived views.

create table if not exists focusiq.assessment_presentations (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references focusiq.assessments (id) on delete restrict,
  question_version_id uuid not null references focusiq.question_versions (id),
  sequence int not null,
  presented_at timestamptz not null,
  -- Exactly what was rendered (after option shuffling, variable substitution, etc.).
  rendered_content jsonb not null,
  timed boolean not null default false,
  time_limit_seconds int,
  unique (assessment_id, sequence)
);

create table if not exists focusiq.response_events (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references focusiq.assessments (id) on delete restrict,
  presentation_id uuid references focusiq.assessment_presentations (id) on delete restrict,
  -- Client-side ordering, so events can be replayed even if received out of order.
  client_sequence int not null,
  event_type text not null check (event_type in (
    'assessment_started', 'instructions_viewed',
    'question_presented', 'question_viewed', 'question_left', 'question_revisited',
    'answer_selected', 'answer_changed', 'answer_cleared', 'answer_submitted',
    'timer_started', 'timer_paused', 'timer_resumed', 'timer_expired',
    'focus_lost', 'focus_returned', 'connection_lost', 'connection_restored',
    'assessment_submitted'
  )),
  occurred_at timestamptz not null,           -- client clock
  received_at timestamptz not null default now(), -- server clock
  -- e.g. {"answer": "B", "previous_answer": "A"} or {"dwell_ms": 4200}
  payload jsonb not null default '{}'::jsonb,
  unique (assessment_id, client_sequence)
);
create index if not exists response_events_presentation_idx
  on focusiq.response_events (presentation_id, client_sequence);

create or replace function focusiq.focusiq_append_only()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only evidence and cannot be changed or deleted', tg_table_name;
end $$;

drop trigger if exists assessment_presentations_append_only on focusiq.assessment_presentations;
create trigger assessment_presentations_append_only
  before update or delete on focusiq.assessment_presentations
  for each row execute function focusiq.focusiq_append_only();

drop trigger if exists response_events_append_only on focusiq.response_events;
create trigger response_events_append_only
  before update or delete on focusiq.response_events
  for each row execute function focusiq.focusiq_append_only();

-- Answer-change history: every selection/change in order, with the previous answer.
create or replace view focusiq.answer_change_history
with (security_invoker = true) as
select
  e.assessment_id,
  e.presentation_id,
  p.question_version_id,
  e.client_sequence,
  e.occurred_at,
  e.event_type,
  e.payload ->> 'answer' as answer,
  lag(e.payload ->> 'answer') over w as previous_answer,
  row_number() over w as change_number
from focusiq.response_events e
join focusiq.assessment_presentations p on p.id = e.presentation_id
where e.event_type in ('answer_selected', 'answer_changed', 'answer_cleared')
window w as (partition by e.presentation_id order by e.client_sequence);

-- Revisit history: each return to a question after first leaving it.
create or replace view focusiq.revisit_history
with (security_invoker = true) as
select
  e.assessment_id,
  e.presentation_id,
  p.question_version_id,
  e.client_sequence,
  e.occurred_at,
  row_number() over (partition by e.presentation_id order by e.client_sequence) as revisit_number
from focusiq.response_events e
join focusiq.assessment_presentations p on p.id = e.presentation_id
where e.event_type = 'question_revisited';

-- Timing per presented question.
create or replace view focusiq.question_timing
with (security_invoker = true) as
select
  p.assessment_id,
  p.id as presentation_id,
  p.question_version_id,
  p.sequence,
  p.timed,
  p.time_limit_seconds,
  min(e.occurred_at) filter (where e.event_type in ('question_presented', 'question_viewed')) as first_seen_at,
  max(e.occurred_at) filter (where e.event_type = 'answer_submitted') as submitted_at,
  coalesce(sum((e.payload ->> 'dwell_ms')::numeric) filter (where e.event_type = 'question_left'), 0) / 1000.0
    as total_dwell_seconds,
  count(*) filter (where e.event_type = 'question_revisited') as revisits,
  count(*) filter (where e.event_type = 'answer_changed') as answer_changes,
  bool_or(e.event_type = 'timer_expired') as timer_expired
from focusiq.assessment_presentations p
left join focusiq.response_events e on e.presentation_id = p.id
group by p.assessment_id, p.id, p.question_version_id, p.sequence, p.timed, p.time_limit_seconds;

alter table focusiq.assessment_presentations enable row level security;
alter table focusiq.response_events enable row level security;

-- Directors can read all evidence; employees can read (and, while the
-- assessment is open, write) their own.
drop policy if exists assessment_presentations_read on focusiq.assessment_presentations;
create policy assessment_presentations_read on focusiq.assessment_presentations
  for select using (focusiq.is_director() or focusiq.owns_assessment(assessment_id));
drop policy if exists assessment_presentations_insert on focusiq.assessment_presentations;
create policy assessment_presentations_insert on focusiq.assessment_presentations
  for insert with check (
    focusiq.owns_assessment(assessment_id)
    and not exists (select 1 from focusiq.assessments a where a.id = assessment_id and a.complete)
  );

drop policy if exists response_events_read on focusiq.response_events;
create policy response_events_read on focusiq.response_events
  for select using (focusiq.is_director() or focusiq.owns_assessment(assessment_id));
drop policy if exists response_events_insert on focusiq.response_events;
create policy response_events_insert on focusiq.response_events
  for insert with check (
    focusiq.owns_assessment(assessment_id)
    and not exists (select 1 from focusiq.assessments a where a.id = assessment_id and a.complete)
  );
