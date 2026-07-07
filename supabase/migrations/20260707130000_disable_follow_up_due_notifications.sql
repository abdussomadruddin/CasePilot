select cron.unschedule(jobname)
from cron.job
where jobname = 'casepilot-case-notifications';
