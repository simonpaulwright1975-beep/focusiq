-- Hardening (Supabase security advisor: function_search_path_mutable).
-- Pin the search path of the remaining helper and trigger functions so a
-- caller's search path can never change which objects they resolve.
alter function focusiq.assessment_adjustments_guard() set search_path = focusiq;
alter function focusiq.assessment_scores_immutable() set search_path = focusiq;
alter function focusiq.benchmark_audit_append_only() set search_path = focusiq;
alter function focusiq.benchmark_eligibility_guard() set search_path = focusiq;
alter function focusiq.benchmark_snapshot_immutable() set search_path = focusiq;
alter function focusiq.focusiq_append_only() set search_path = focusiq;
alter function focusiq.focusiq_day_date(date) set search_path = focusiq;
alter function focusiq.focusiq_day_email(boolean, text, date, text, text, text, integer, boolean) set search_path = focusiq;
alter function focusiq.focusiq_email_body(text, text[]) set search_path = focusiq;
alter function focusiq.focusiq_employee_email(text, text) set search_path = focusiq;
alter function focusiq.focusiq_next_working_day(date) set search_path = focusiq;
alter function focusiq.focusiq_plural(integer, text, text) set search_path = focusiq;
alter function focusiq.focusiq_published_is_immutable() set search_path = focusiq;
alter function focusiq.rights_request_due(text, timestamp with time zone, integer) set search_path = focusiq;
