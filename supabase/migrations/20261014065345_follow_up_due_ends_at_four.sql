create or replace function public.record_lead_follow_up(p_lead_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  previous_status text;
  previous_count integer;
  next_count integer;
begin
  select status,follow_up_count into previous_status,previous_count
    from public.leads where id=p_lead_id and deleted_at is null and status<>'rejected'
      and phone_revealed_at is not null and nullif(customer_phone,'') is not null for update;
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
end $$;

with changed as (
  update public.leads set status='all_offer_presented',follow_up_activity_at=null,updated_at=now()
    where deleted_at is null and status='contacted' and follow_up_count>=4
    returning id,owner_id
)
insert into public.lead_events(lead_id,actor_id,status,event_kind)
  select id,owner_id,'all_offer_presented','follow_up_threshold_migration' from changed;
