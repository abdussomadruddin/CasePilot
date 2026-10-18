-- Read only: sizes, scheduler retention candidates and indexes. No customer data.
select pg_size_pretty(pg_database_size(current_database())) as database_size;
select schemaname,relname,pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 20;
select count(*) as cron_log_rows,count(*) filter(where end_time<now()-interval '30 days') as expired_cron_logs
from cron.job_run_details;
select jobname,schedule from cron.job order by jobname;
select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('cases','leads','appointments','case_activities','lead_notes');
