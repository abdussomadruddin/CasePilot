select cron.unschedule(jobname)
from cron.job
where jobname = 'casepilot-lead-follow-up';

select cron.schedule(
  'casepilot-lead-follow-up',
  '0 1,2,3,4,6,7,8,13 * * *',
  $$
  select net.http_post(
    url := 'https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/lead-follow-up',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
