create table public.document_clients (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 12000),
  version integer not null default 1 check (version > 0),
  last_save_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_clients_owner_idx on public.document_clients(owner_id, updated_at desc);
create table public.client_purchases (
  id uuid primary key,
  client_id uuid not null references public.document_clients(id),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 12000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_purchases_client_idx on public.client_purchases(client_id);
create table public.client_document_drafts (
  id uuid primary key,
  purchase_id uuid not null references public.client_purchases(id),
  kind text not null check (kind in ('invoice', 'honda_vso', 'receipt')),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 24000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_document_drafts_purchase_idx on public.client_document_drafts(purchase_id);
create unique index client_document_singleton_idx on public.client_document_drafts(purchase_id, kind) where kind <> 'receipt';
alter table public.document_clients enable row level security;
alter table public.client_purchases enable row level security;
alter table public.client_document_drafts enable row level security;
revoke all on public.document_clients, public.client_purchases, public.client_document_drafts from anon, authenticated;
grant select on public.document_clients, public.client_purchases, public.client_document_drafts to authenticated;
create function public.can_access_client_document(client_uuid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.document_clients c
    join public.profiles p on p.id = auth.uid()
    where c.id = client_uuid and p.active and p.role <> 'sales_manager'
      and (p.role = 'admin' or c.owner_id = p.id)
  );
$$;
revoke all on function public.can_access_client_document(uuid) from public, anon, authenticated;
grant execute on function public.can_access_client_document(uuid) to authenticated;
create policy client_read on public.document_clients for select to authenticated using (
  public.can_access_client_document(id)
);
create policy purchase_read on public.client_purchases for select to authenticated using (
  public.can_access_client_document(client_id)
);
create policy document_read on public.client_document_drafts for select to authenticated using (
  exists(select 1 from public.client_purchases p where p.id = purchase_id and public.can_access_client_document(p.client_id))
);

-- One transaction locks the client and checks every loaded version before writing.
create function public.save_client_document_bundle(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor public.profiles%rowtype;
  c public.document_clients%rowtype;
  p public.client_purchases%rowtype;
  d public.client_document_drafts%rowtype;
  item jsonb;
  cid uuid := (payload->'client'->>'id')::uuid;
  pid uuid := (payload->'purchase'->>'id')::uuid;
  token uuid := (payload->>'saveToken')::uuid;
begin
  select * into actor from public.profiles where id = auth.uid() and active and role <> 'sales_manager';
  if actor.id is null then raise exception 'Access denied' using errcode = '42501'; end if;
  if cid is null or pid is null or token is null or octet_length(payload::text) > 100000
    or jsonb_typeof(payload->'client'->'data') is distinct from 'object'
    or jsonb_typeof(payload->'purchase'->'data') is distinct from 'object'
    or jsonb_typeof(payload->'documents') is distinct from 'array'
    or jsonb_array_length(payload->'documents') > 100 then raise exception 'Invalid client data'; end if;
  if coalesce(trim(payload->'client'->'data'->>'customerName'), '') = '' and coalesce(trim(payload->'client'->'data'->>'phone'), '') = '' then raise exception 'Nama atau telefon diperlukan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text, 0));
  select * into c from public.document_clients where id = cid for update;
  if found and actor.role <> 'admin' and c.owner_id <> actor.id then raise exception 'Access denied' using errcode = '42501'; end if;
  select * into p from public.client_purchases where id = pid for update;
  if p.id is not null and p.client_id <> cid then raise exception 'Access denied' using errcode = '42501'; end if;
  if c.last_save_token is distinct from token then
    if coalesce(c.version, 0) is distinct from (payload->'client'->>'version')::integer then raise exception 'CLIENT_VERSION_CONFLICT' using errcode = '40001'; end if;
    if coalesce(p.version, 0) is distinct from (payload->'purchase'->>'version')::integer then raise exception 'CLIENT_VERSION_CONFLICT' using errcode = '40001'; end if;
    for item in select value from jsonb_array_elements(payload->'documents') loop
      if jsonb_typeof(item->'data') is distinct from 'object' or item->>'kind' not in ('invoice','honda_vso','receipt') then raise exception 'Invalid document'; end if;
      select * into d from public.client_document_drafts where id = (item->>'id')::uuid for update;
      if d.id is not null and (d.purchase_id <> pid or d.kind <> item->>'kind') then raise exception 'Access denied' using errcode = '42501'; end if;
      if coalesce(d.version, 0) is distinct from (item->>'version')::integer then raise exception 'CLIENT_VERSION_CONFLICT' using errcode = '40001'; end if;
    end loop;
    insert into public.document_clients(id, owner_id, data, last_save_token) values(cid, actor.id, payload->'client'->'data', token)
      on conflict(id) do update set data = excluded.data, version = document_clients.version + 1, last_save_token = token, updated_at = now()
      where document_clients.owner_id = actor.id or actor.role = 'admin';
    insert into public.client_purchases(id, client_id, data) values(pid, cid, payload->'purchase'->'data')
      on conflict(id) do update set data = excluded.data, version = client_purchases.version + 1, updated_at = now();
    for item in select value from jsonb_array_elements(payload->'documents') loop
      insert into public.client_document_drafts(id, purchase_id, kind, data) values((item->>'id')::uuid, pid, item->>'kind', item->'data')
        on conflict(id) do update set data = excluded.data, version = client_document_drafts.version + 1, updated_at = now();
    end loop;
  end if;
  return jsonb_build_object(
    'client', (select to_jsonb(x) from public.document_clients x where x.id = cid),
    'purchase', (select to_jsonb(x) from public.client_purchases x where x.id = pid),
    'documents', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.client_document_drafts x where x.purchase_id = pid), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.save_client_document_bundle(jsonb) from public, anon;
grant execute on function public.save_client_document_bundle(jsonb) to authenticated;

do $$ declare t text; begin
  foreach t in array array['document_clients','client_purchases','client_document_drafts'] loop
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
