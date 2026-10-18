-- Manual Lead contact only. Existing owner policies, receipt/duplicate logic stay intact.
alter table public.leads add column whatsapp_username text;
alter table public.leads add constraint leads_whatsapp_username_valid check (
  whatsapp_username is null or (
    whatsapp_username ~ '^[a-z0-9_][a-z0-9_.]{1,33}[a-z0-9_]$'
    and whatsapp_username ~ '[a-z]' and position('..' in whatsapp_username)=0
  )
);
comment on column public.leads.whatsapp_username is 'Canonical manual WhatsApp username; never a phone placeholder or username key.';

-- Serialize contact with history so retries and concurrent devices record it once.
create or replace function public.contact_lead(p_lead_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare target public.leads%rowtype;
begin
  select * into target from public.leads
    where id=p_lead_id and deleted_at is null for update;
  if not found then raise exception 'Lead is not available'; end if;
  if nullif(target.customer_phone,'') is null and target.whatsapp_username is null then
    raise exception 'Add a phone number or WhatsApp username first';
  end if;
  if target.phone_revealed_at is not null and target.status<>'new' then return; end if;
  update public.leads set phone_revealed_at=now(),status='contacted' where id=p_lead_id;
  insert into public.lead_events(lead_id,actor_id,status)
    values(p_lead_id,(select auth.uid()),'contacted');
end $$;
revoke all on function public.contact_lead(uuid) from public,anon;
grant execute on function public.contact_lead(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.record_lead_follow_up(p_lead_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  previous_status text;
  previous_count integer;
  next_count integer;
begin
  select status,follow_up_count into previous_status,previous_count
    from public.leads where id=p_lead_id and deleted_at is null and status<>'rejected'
      and phone_revealed_at is not null and (nullif(customer_phone,'') is not null or whatsapp_username is not null) for update;
  if not found then raise exception 'Lead is not available for follow-up'; end if;
  if previous_count>=6 then raise exception 'Maximum 6 follow-ups reached'; end if;
  next_count:=previous_count+1;
  update public.leads set follow_up_count=next_count,
    status=case when next_count>=4 then 'all_offer_presented' else status end,
    follow_up_activity_at=case when next_count>=4 then null when status='contacted' then now() else follow_up_activity_at end
    where id=p_lead_id;
  insert into public.lead_follow_up_actions(lead_id,actor_id,follow_up_number)
    values(p_lead_id,(select auth.uid()),next_count);
  if next_count>=4 and previous_status<>'all_offer_presented' then
    insert into public.lead_events(lead_id,actor_id,status)
      values(p_lead_id,(select auth.uid()),'all_offer_presented');
  end if;
  return next_count;
end $function$
;
