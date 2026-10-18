-- Only scheduler execution diagnostics are expired. Business history, contacts,
-- notes, notifications, queue receipts and delivery idempotency records are retained.
create schema if not exists casepilot_maintenance;
revoke all on schema casepilot_maintenance from public,anon,authenticated;
create or replace function casepilot_maintenance.prune_scheduler_logs()
returns bigint language plpgsql security invoker set search_path='' as $$
declare removed bigint;
begin
  delete from cron.job_run_details where end_time<now()-interval '30 days';
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function casepilot_maintenance.prune_scheduler_logs() from public,anon,authenticated;
select cron.schedule('casepilot-prune-scheduler-logs','20 19 * * *',
  'select casepilot_maintenance.prune_scheduler_logs()');
