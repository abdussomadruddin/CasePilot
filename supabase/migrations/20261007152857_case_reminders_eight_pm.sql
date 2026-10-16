select cron.alter_job(jobid, schedule := '0 0,12 * * *')
from cron.job
where jobname = 'casepilot-case-notifications';
