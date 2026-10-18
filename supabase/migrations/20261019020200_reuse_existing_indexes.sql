-- Audit found existing indexes that cover these access paths. Remove only the
-- redundant indexes introduced in reduce_usage; retain every original index.
drop index if exists public.case_activity_summary_lookup_idx;
drop index if exists public.lead_latest_note_lookup_idx;
drop index if exists public.lead_due_reminder_lookup_idx;
drop index if exists public.appointment_due_reminder_lookup_idx;
