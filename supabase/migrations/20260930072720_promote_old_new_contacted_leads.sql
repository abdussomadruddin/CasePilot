-- Only the database scheduler may advance an uncalled, expired New lead.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.enforce_lead_workflow()'::regprocedure);
  if position('and new.status is distinct from old.status then' in definition) = 0 then
    raise exception 'Unexpected lead workflow definition; refusing to weaken guard';
  end if;
  definition := replace(definition,
    'and new.status is distinct from old.status then',
    'and new.status is distinct from old.status
      and not (current_user in (''postgres'', ''supabase_admin'')
        and auth.uid() is null
        and old.status = ''new'' and new.status = ''need_follow_up''
        and old.deleted_at is null
        and old.created_at < now() - interval ''15 days'') then');
  execute definition;
end $$;

create or replace function public.promote_old_new_contacted_leads()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  affected integer;
begin
  with changed as (
    update public.leads
    set status = 'need_follow_up', updated_at = now()
    where deleted_at is null and status in ('new', 'contacted')
      and created_at < now() - interval '15 days'
    returning id, owner_id
  )
  insert into public.lead_events (lead_id, actor_id, status)
  select id, owner_id, 'need_follow_up' from changed;
  get diagnostics affected = row_count;
  return affected;
end $$;

revoke all on function public.promote_old_new_contacted_leads() from public, anon, authenticated, service_role;
select cron.schedule('casepilot-promote-old-leads', '* * * * *',
  'select public.promote_old_new_contacted_leads()');
select public.promote_old_new_contacted_leads();
