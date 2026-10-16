select cron.alter_job(jobid, schedule := '0 1,2,3,4,5,6,7,8,13 * * *')
from cron.job
where jobname = 'casepilot-lead-follow-up';
