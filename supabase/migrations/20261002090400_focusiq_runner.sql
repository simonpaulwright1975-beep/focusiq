set search_path = focusiq;

-- FocusiQ assessment runner support.
--
-- * Employees receive question content WITHOUT answer keys or scoring metadata.
-- * Assessments are started and completed only through these functions, so the
--   randomisation seed and any agreed time adjustment are set server-side.
-- * Question images live in a private, write-once Storage bucket; each question
--   version records the image path and SHA-256, which the runner verifies.

-- Agreed adjustments can carry extra time for timed sections.
alter table focusiq.adjustment_requests
  add column if not exists time_multiplier numeric
  check (time_multiplier is null or (time_multiplier >= 1 and time_multiplier <= 3));

-- ---------------------------------------------------------------------------
-- Start an assessment (acknowledgement is enforced by the assessments trigger)
-- ---------------------------------------------------------------------------
create or replace function focusiq.employee_start_assessment(p_version text)
returns table (assessment_id uuid, seed text, time_multiplier numeric)
language plpgsql security definer set search_path = focusiq as $$
declare
  me uuid := focusiq.my_employee_id();
  open_id uuid;
  agreed focusiq.adjustment_requests;
  mult numeric := 1;
  new_id uuid;
  new_seed text := gen_random_uuid()::text;
begin
  if me is null then raise exception 'No employee record for this user.'; end if;
  if exists (select 1 from focusiq.adjustment_requests where employee_id = me and status = 'pending') then
    raise exception 'Your adjustment request is still being reviewed.';
  end if;
  -- Resume an assessment already in progress rather than starting another.
  select a.id into open_id from focusiq.assessments a
  where a.employee_id = me and a.assessment_version_id = p_version and not a.complete
  order by a.created_at desc limit 1;
  if open_id is not null then
    return query select a.id, a.delivery_context ->> 'seed', coalesce((a.delivery_context ->> 'time_multiplier')::numeric, 1)
      from focusiq.assessments a where a.id = open_id;
    return;
  end if;
  select * into agreed from focusiq.adjustment_requests
  where employee_id = me and status = 'agreed' order by decided_at desc limit 1;
  if agreed.id is not null and agreed.time_multiplier is not null then mult := agreed.time_multiplier; end if;

  insert into focusiq.assessments (employee_id, assessment_version_id, started_at, delivery_context)
  values (me, p_version, now(), jsonb_build_object('seed', new_seed, 'time_multiplier', mult))
  returning id into new_id;

  -- An agreed adjustment marks the assessment as Adjusted (comparability decided later by a Director).
  if agreed.id is not null then
    insert into focusiq.assessment_adjustments (assessment_id, description, recorded_by)
    values (new_id, agreed.description, coalesce(agreed.decided_by, auth.uid()));
  end if;
  return query select new_id, new_seed, mult;
end $$;

-- ---------------------------------------------------------------------------
-- Content for the runner – display fields only, owner only, while open
-- ---------------------------------------------------------------------------
create or replace function focusiq.assessment_content_for(p_assessment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = focusiq as $$
declare a focusiq.assessments;
begin
  select * into a from focusiq.assessments where id = p_assessment_id;
  if a.id is null or a.employee_id is distinct from focusiq.my_employee_id() then
    raise exception 'Assessment not found.';
  end if;
  if a.complete then raise exception 'This assessment has already been submitted.'; end if;
  return jsonb_build_object(
    'version', v.id,
    'title', v.title,
    'definition', v.definition,            -- sections, instructions, timing, question order
    'questions', (
      select coalesce(jsonb_object_agg(qv.id, qv.content), '{}'::jsonb)   -- content only: no answer_key / scoring_meta
      from focusiq.assessment_version_questions avq
      join focusiq.question_versions qv on qv.id = avq.question_version_id
      where avq.assessment_version_id = v.id
    ),
    'seed', a.delivery_context ->> 'seed',
    'time_multiplier', coalesce((a.delivery_context ->> 'time_multiplier')::numeric, 1)
  )
  from focusiq.assessment_versions v where v.id = a.assessment_version_id;
end $$;

-- ---------------------------------------------------------------------------
-- Complete an assessment (only the owner; only once)
-- ---------------------------------------------------------------------------
create or replace function focusiq.employee_complete_assessment(p_assessment_id uuid, p_completed_at timestamptz)
returns void
language plpgsql security definer set search_path = focusiq as $$
begin
  update focusiq.assessments
  set complete = true,
      -- Never trust a client clock beyond the server's.
      completed_at = least(coalesce(p_completed_at, now()), now())
  where id = p_assessment_id and employee_id = focusiq.my_employee_id() and not complete;
  -- Already complete (e.g. a retried request) is fine: idempotent.
end $$;

revoke all on function focusiq.employee_start_assessment(text) from public;
revoke all on function focusiq.assessment_content_for(uuid) from public;
revoke all on function focusiq.employee_complete_assessment(uuid, timestamptz) from public;
grant execute on function focusiq.employee_start_assessment(text) to authenticated;
grant execute on function focusiq.assessment_content_for(uuid) to authenticated;
grant execute on function focusiq.employee_complete_assessment(uuid, timestamptz) to authenticated;

-- Employees no longer insert assessments directly; the start function does it.
drop policy if exists assessments_own_insert on focusiq.assessments;

-- Idempotent saves from the runner's outbox: a retried event is ignored, not an error.
-- (Clients insert with ON CONFLICT (assessment_id, client_sequence) DO NOTHING.)

-- ---------------------------------------------------------------------------
-- Private, write-once storage for question images
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('assessment-media', 'assessment-media', false)
on conflict (id) do nothing;

drop policy if exists assessment_media_read on storage.objects;
create policy assessment_media_read on storage.objects
  for select to authenticated using (bucket_id = 'assessment-media' and focusiq.is_focusiq_user());

drop policy if exists assessment_media_director_upload on storage.objects;
create policy assessment_media_director_upload on storage.objects
  for insert to authenticated with check (bucket_id = 'assessment-media' and focusiq.is_director());
-- No update or delete policies: once uploaded, an image cannot be replaced or removed,
-- so the exact image an employee saw can always be shown again.
