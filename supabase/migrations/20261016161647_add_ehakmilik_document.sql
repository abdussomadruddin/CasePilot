alter table public.client_document_drafts drop constraint client_document_drafts_kind_check;
alter table public.client_document_drafts add constraint client_document_drafts_kind_check check (kind in ('invoice','honda_vso','receipt','ehakmilik'));

create or replace function public.save_client_document_bundle(payload jsonb) returns jsonb
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
      if jsonb_typeof(item->'data') is distinct from 'object' or item->>'kind' not in ('invoice','honda_vso','receipt','ehakmilik') then raise exception 'Invalid document'; end if;
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
