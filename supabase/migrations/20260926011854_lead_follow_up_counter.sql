alter table public.leads
add column follow_up_count integer not null default 0 check (follow_up_count >= 0);

create table public.lead_follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  follow_up_number integer not null check (follow_up_number > 0),
  created_at timestamptz not null default now(),
  unique (lead_id, follow_up_number)
);

create index lead_follow_up_actions_lead_created_idx
on public.lead_follow_up_actions(lead_id, created_at desc);

alter table public.lead_follow_up_actions enable row level security;

create policy "lead follow ups read admin or owner"
on public.lead_follow_up_actions for select to authenticated
using (exists (select 1 from public.leads where leads.id = lead_follow_up_actions.lead_id));

create policy "lead follow ups insert admin or owner"
on public.lead_follow_up_actions for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (select 1 from public.leads where leads.id = lead_follow_up_actions.lead_id)
);

grant select, insert on public.lead_follow_up_actions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'lead_follow_up_actions'
    ) then
    alter publication supabase_realtime add table public.lead_follow_up_actions;
  end if;
end $$;

create function public.record_lead_follow_up(p_lead_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_count integer;
begin
  update public.leads
  set follow_up_count = follow_up_count + 1,
      follow_up_activity_at = case when status = 'contacted' then now() else follow_up_activity_at end
  where id = p_lead_id
    and deleted_at is null
    and phone_revealed_at is not null
    and nullif(customer_phone, '') is not null
  returning follow_up_count into next_count;

  if next_count is null then
    raise exception 'Lead is not available for follow-up';
  end if;

  insert into public.lead_follow_up_actions (lead_id, actor_id, follow_up_number)
  values (p_lead_id, (select auth.uid()), next_count);

  return next_count;
end;
$$;

revoke execute on function public.record_lead_follow_up(uuid) from public, anon;
grant execute on function public.record_lead_follow_up(uuid) to authenticated;
