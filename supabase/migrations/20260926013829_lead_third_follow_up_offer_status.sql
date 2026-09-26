create or replace function public.record_lead_follow_up(p_lead_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_status text;
  next_count integer;
begin
  select status into previous_status
  from public.leads
  where id = p_lead_id
    and deleted_at is null
    and phone_revealed_at is not null
    and nullif(customer_phone, '') is not null
  for update;

  if not found then
    raise exception 'Lead is not available for follow-up';
  end if;

  update public.leads
  set follow_up_count = follow_up_count + 1,
      status = case when follow_up_count + 1 = 3 then 'all_offer_presented' else status end,
      follow_up_activity_at = case
        when status = 'contacted' and follow_up_count + 1 <> 3 then now()
        else follow_up_activity_at
      end
  where id = p_lead_id
  returning follow_up_count into next_count;

  insert into public.lead_follow_up_actions (lead_id, actor_id, follow_up_number)
  values (p_lead_id, (select auth.uid()), next_count);

  if next_count = 3 and previous_status <> 'all_offer_presented' then
    insert into public.lead_events (lead_id, actor_id, status)
    values (p_lead_id, (select auth.uid()), 'all_offer_presented');
  end if;

  return next_count;
end;
$$;
