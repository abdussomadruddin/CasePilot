alter table public.leads add column if not exists follow_up_activity_at timestamptz;

update public.leads
set follow_up_activity_at = updated_at
where status = 'contacted' and follow_up_activity_at is null;

create index if not exists leads_contacted_follow_up_idx
on public.leads(follow_up_activity_at)
where status = 'contacted' and deleted_at is null;

create or replace function public.track_lead_follow_up_activity() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'contacted' and old.status is distinct from new.status then
    new.follow_up_activity_at := now();
  end if;
  return new;
end $$;

create trigger track_lead_follow_up_activity
before update of status on public.leads
for each row execute function public.track_lead_follow_up_activity();

create or replace function public.reset_contacted_lead_follow_up_from_note() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.leads
  set follow_up_activity_at = now()
  where id = new.lead_id and status = 'contacted' and deleted_at is null;
  return new;
end $$;

create trigger reset_contacted_lead_follow_up_from_note
after insert on public.lead_notes
for each row execute function public.reset_contacted_lead_follow_up_from_note();

create table if not exists public.lead_follow_up_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  slot_at timestamptz not null,
  due_count integer not null check (due_count > 0),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (recipient_id, slot_at)
);

alter table public.lead_follow_up_deliveries enable row level security;
revoke all on public.lead_follow_up_deliveries from anon, authenticated;

select cron.unschedule(jobname)
from cron.job
where jobname = 'casepilot-lead-follow-up';

select cron.schedule(
  'casepilot-lead-follow-up',
  '0 1,7,13 * * *',
  $$
  select net.http_post(
    url := 'https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/lead-follow-up',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
