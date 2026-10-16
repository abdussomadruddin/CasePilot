select cron.unschedule(jobid) from cron.job where jobname='casepilot-new-lead-alerts';
drop function public.claim_new_lead_alerts();

create function public.claim_single_new_lead_alert(p_lead_id uuid,p_owner_id uuid)
returns table(recipient_id uuid,lead_ids uuid[])
language sql security definer set search_path = public as $$
  update public.new_lead_alert_queue set claimed_at=clock_timestamp()
  where lead_id=p_lead_id and owner_id=p_owner_id and claimed_at is null
  returning owner_id,array[lead_id];
$$;
revoke all on function public.claim_single_new_lead_alert(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_single_new_lead_alert(uuid,uuid) to service_role;

create or replace function public.queue_new_lead_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare queued uuid;
begin
  if new.status='new' and new.deleted_at is null
    and (tg_op='INSERT' or new.owner_id is distinct from old.owner_id)
    and exists(select 1 from public.profiles where id=new.owner_id and active and role in ('customer_service','broker')) then
    insert into public.new_lead_alert_queue(lead_id,owner_id) values(new.id,new.owner_id)
    on conflict do nothing returning lead_id into queued;
    if queued is not null then
      perform net.http_post(
        url := 'https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/new-lead-alerts',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('lead_id',new.id,'owner_id',new.owner_id)
      );
    end if;
  end if;
  return new;
end $$;
