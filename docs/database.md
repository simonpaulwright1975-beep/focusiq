# FocusiQ – database (WG Main)

FocusiQ's database lives in the shared **WG Main** Supabase project (ref `hlfhyzqkzqgyuohhmzzu`, EU West). It uses its own **`focusiq` schema**, like the other Walter Geering apps (`brand_iq`, `calliq`, `pageiq`, …).

## Rules

- **Nothing goes in `public`.** WG Main already has `public.employees` (the WG staff directory) and `public.is_director()`, which belong to other apps. Every FocusiQ object is created in, and qualified with, `focusiq.`. Every FocusiQ function pins `search_path = focusiq`.
- **Sign-ins are shared with every WG app**, so being signed in is not enough. A person is a FocusiQ user only if they have a row in `focusiq.user_roles` (`focusiq.is_focusiq_user()`). Directors are `director` or `super_admin` there (`focusiq.is_director()`).
- **Access is locked down by default:**
  - every table has row-level security;
  - nothing is granted to `anon`;
  - functions that send or record emails are for `service_role` only.

## How WG Main was set up (3 October 2026)

The migrations in `supabase/migrations/` are the source of truth. Two complications came up when applying them to WG Main:

1. **Statements containing `DROP`** (even `drop … if exists`) wait for a person's approval through the Supabase tool, and timed out after 60 seconds.
2. **Two of the seven core tables** had already been created before that was spotted.

So instead of replaying each migration file, WG Main received the **finished schema** in 19 parts:

1. **`focusiq_schema`, `focusiq_core_1_people`, `focusiq_core_2_content`:** the schema and the first seven tables, exactly as in the migration files.
2. **`focusiq_a01` … `focusiq_a17_b01`:** everything else.
   - Generated with `pg_dump --schema=focusiq` from a local database built from all the migrations.
   - Contains no `DROP`.
   - Before applying, it was checked locally to rebuild an identical schema. The only differences were how Postgres prints one equivalent check constraint, and two random tokens pg_dump adds for its own command-line tool.
3. **`focusiq_c01_question_images`:** the private `assessment-media` storage bucket and its two policies.
4. **`focusiq_function_search_path`:** the same as `20261002091100_focusiq_function_search_path.sql`.

**Checked after applying:** WG Main's `focusiq` schema matches the local build. That covers 48 tables, 5 views, 61 functions, 78 policies, 39 triggers, 198 constraints, 67 indexes, the seed metrics and expectation bands, and the function grants. A signed-in WG account without a FocusiQ role sees nothing.

**New migrations** apply on top as normal. Avoid `DROP` when applying them through the Supabase tool, or approve the prompt when it appears.

## Still to do (needs the Supabase dashboard)

1. **Expose the schema to the API:** Settings → API → *Exposed schemas* → add `focusiq`. The apps and the email functions reach FocusiQ through the API, so nothing works until this is done.
2. **Email:** set the Edge Function secrets, deploy `send-notifications` and `resend-webhook`, and schedule them (see `docs/notifications.md`).
3. **People:** create `focusiq.employees` rows and `focusiq.user_roles` for Directors and staff.
   - Consider linking to the WG staff directory (`public.employees`) rather than keeping a second copy of names. That's a separate decision.
