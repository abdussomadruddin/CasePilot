select cron.unschedule(jobname)
from cron.job
where jobname = 'casepilot-case-notifications';

select cron.schedule(
  'casepilot-case-notifications',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/case-notifications',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
