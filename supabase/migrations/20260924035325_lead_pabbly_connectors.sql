alter table public.leads
  add column if not exists source text not null default 'manual_upload',
  add column if not exists source_lead_id text,
  add column if not exists source_detail text,
  add column if not exists source_note text;

alter table public.leads
  add constraint leads_source_check check (source in ('manual_upload', 'meta_ads', 'tiktok_ads'));

create unique index if not exists leads_external_source_id_unique
  on public.leads(source, source_lead_id)
  where source_lead_id is not null and source <> 'manual_upload';

drop policy if exists "leads insert admin or owner" on public.leads;
create policy "leads insert admin or owner" on public.leads for insert to authenticated
with check (
  source = 'manual_upload'
  and (
    public.current_app_role() = 'admin'
    or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
  )
);

create table if not exists public.lead_connectors (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('meta_ads', 'tiktok_ads')),
  label text not null check (length(trim(label)) between 1 and 80),
  owner_id uuid not null references public.profiles(id),
  key_hash text not null unique check (key_hash ~ '^[a-f0-9]{64}$'),
  key_hint text not null,
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_connectors_owner_idx on public.lead_connectors(owner_id);

alter table public.leads add column if not exists connector_id uuid references public.lead_connectors(id);
create index if not exists leads_connector_idx on public.leads(connector_id) where connector_id is not null;

create or replace function public.protect_lead_source() returns trigger
language plpgsql set search_path = public as $$
begin
  if row(new.source, new.source_lead_id, new.source_detail, new.source_note, new.connector_id)
    is distinct from row(old.source, old.source_lead_id, old.source_detail, old.source_note, old.connector_id) then
    raise exception 'Lead source cannot be changed after creation';
  end if;
  return new;
end $$;

create trigger protect_lead_source before update on public.leads
  for each row execute function public.protect_lead_source();

create or replace function public.validate_lead_connector_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.owner_id and role in ('customer_service', 'broker') and active
  ) then
    raise exception 'Connector owner must be an active Customer Service or Broker';
  end if;
  return new;
end $$;

create trigger validate_lead_connector_owner
  before insert or update of owner_id on public.lead_connectors
  for each row execute function public.validate_lead_connector_owner();

create trigger touch_lead_connectors_updated_at
  before update on public.lead_connectors
  for each row execute function public.touch_updated_at();

alter table public.lead_connectors enable row level security;

create policy "lead connectors admin read"
  on public.lead_connectors for select to authenticated
  using (public.current_app_role() = 'admin');
create policy "lead connectors admin insert"
  on public.lead_connectors for insert to authenticated
  with check (public.current_app_role() = 'admin');
create policy "lead connectors admin update"
  on public.lead_connectors for update to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

grant select, insert, update on public.lead_connectors to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_connectors'
    ) then
    alter publication supabase_realtime add table public.lead_connectors;
  end if;
end $$;
