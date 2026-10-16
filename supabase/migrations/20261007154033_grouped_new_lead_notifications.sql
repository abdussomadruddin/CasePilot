create table public.new_lead_alert_queue (
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  queued_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  primary key (lead_id, owner_id)
);
alter table public.new_lead_alert_queue enable row level security;
revoke all on public.new_lead_alert_queue from anon, authenticated;
grant all on public.new_lead_alert_queue to service_role;
create index new_lead_alert_pending on public.new_lead_alert_queue(owner_id, queued_at) where claimed_at is null;

create function public.queue_new_lead_alert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'new' and new.deleted_at is null
    and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
    and exists (select 1 from public.profiles where id=new.owner_id and active and role in ('customer_service','broker')) then
    insert into public.new_lead_alert_queue(lead_id,owner_id) values(new.id,new.owner_id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_new_lead_alert() from public, anon, authenticated;
create trigger queue_new_lead_alert after insert or update of owner_id on public.leads
for each row execute function public.queue_new_lead_alert();

create function public.claim_new_lead_alerts() returns table(recipient_id uuid,lead_ids uuid[])
language plpgsql security definer set search_path = public as $$
begin
  if not pg_try_advisory_xact_lock(7154033) then return; end if;
  return query
  with ready as (
    select owner_id,min(queued_at) first_at from public.new_lead_alert_queue
    where claimed_at is null group by owner_id
    having min(queued_at) <= clock_timestamp() - interval '5 seconds'
  ), claimed as (
    update public.new_lead_alert_queue q set claimed_at=clock_timestamp()
    from ready r where q.owner_id=r.owner_id and q.claimed_at is null
      and q.queued_at <= r.first_at + interval '5 seconds'
    returning q.owner_id,q.lead_id
  ) select c.owner_id,array_agg(c.lead_id) from claimed c group by c.owner_id;
end $$;
revoke all on function public.claim_new_lead_alerts() from public, anon, authenticated;
grant execute on function public.claim_new_lead_alerts() to service_role;

select cron.schedule('casepilot-new-lead-alerts','5 seconds', $$
  select net.http_post(
    url := 'https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/new-lead-alerts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
