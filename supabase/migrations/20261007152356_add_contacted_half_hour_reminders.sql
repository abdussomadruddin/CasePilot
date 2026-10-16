select cron.schedule(
  'casepilot-lead-follow-up-half-hour',
  '30 1-9 * * *',
  (select command from cron.job where jobname = 'casepilot-lead-follow-up')
);
