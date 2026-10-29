create table public.vso_dealers (
 id uuid primary key, data jsonb not null check(jsonb_typeof(data)='object' and length(trim(data->>'dealerName'))>0),
 active boolean not null default true, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null
);
alter table public.vso_dealers enable row level security;
revoke all on public.vso_dealers from public, anon, authenticated;
grant select on public.vso_dealers to authenticated;
grant all on public.vso_dealers to service_role;
create policy vso_dealers_read on public.vso_dealers for select to authenticated using (
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role::text in ('admin','broker','customer_service'))
);
-- Writes are restricted to this explicit Admin-only CAS operation.
create function public.save_vso_dealer(p_id uuid, p_version integer, p_data jsonb, p_active boolean)
returns public.vso_dealers language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.vso_dealers; k text; v jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role::text='admin') then raise exception 'Access denied' using errcode='42501'; end if;
 if p_version is null or p_version<0 or p_active is null or jsonb_typeof(p_data)<>'object' or coalesce(length(trim(p_data->>'dealerName')),0)=0 then raise exception 'Invalid dealer'; end if;
 for k,v in select * from jsonb_each(p_data) loop
  if k not in ('dealerName','dealerRegistration','dealerAddress','dealerPhone','dealerEmail','dealerFax','salesAdvisorName','salesAdvisorNric','salesManagerName','salesManagerNric') or jsonb_typeof(v)<>'string' or length(v#>>'{}') > (case when k='dealerAddress' then 1000 else 200 end) then raise exception 'Invalid dealer field'; end if;
 end loop;
 if p_version=0 then
  insert into public.vso_dealers(id,data,active,updated_by) values(p_id,p_data,p_active,auth.uid()) on conflict(id) do nothing returning * into r;
 else
  update public.vso_dealers set data=p_data,active=p_active,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id and version=p_version returning * into r;
 end if;
 if r.id is null then raise exception 'DEALER_CONFLICT' using errcode='40001'; end if;
 return r;
end $$;
revoke all on function public.save_vso_dealer(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_vso_dealer(uuid,integer,jsonb,boolean) to authenticated;
