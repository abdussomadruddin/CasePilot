create table public.lead_ingest_windows (
  identity_key text primary key,
  last_accepted_at timestamptz not null,
  last_lead_id uuid
);

alter table public.lead_ingest_windows enable row level security;
revoke all on public.lead_ingest_windows from public, anon, authenticated;
grant select, insert, update on public.lead_ingest_windows to service_role;

create or replace function public.ingest_external_lead(
  p_connector_id uuid,
  p_lead jsonb
)
returns table (lead_id uuid, duplicate boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_owner_id uuid;
  v_phone text;
  v_email text;
  v_source_lead_id text;
  v_keys text[] := array[]::text[];
  v_key text;
  v_last_accepted_at timestamptz;
  v_last_lead_id uuid;
  v_duplicate_id uuid;
  v_now timestamptz := clock_timestamp();
  v_lead_id uuid;
begin
  select connector.source, connector.owner_id
    into v_source, v_owner_id
    from public.lead_connectors connector
    join public.profiles owner on owner.id = connector.owner_id
   where connector.id = p_connector_id
     and connector.active
     and owner.active
     and owner.role in ('customer_service', 'broker');

  if v_owner_id is null or v_source not in ('meta_ads', 'tiktok_ads') then
    raise exception 'Active Meta or TikTok connector with an active owner required';
  end if;

  v_phone := regexp_replace(coalesce(p_lead->>'customer_phone', ''), '[^0-9]', '', 'g');
  if left(v_phone, 1) = '0' then
    v_phone := '60' || substr(v_phone, 2);
  end if;
  v_email := lower(btrim(coalesce(p_lead->>'email', '')));
  v_source_lead_id := btrim(coalesce(p_lead->>'source_lead_id', ''));

  if length(v_phone) between 9 and 15 then
    v_keys := array_append(v_keys, md5('phone:' || v_phone));
  end if;
  if v_email ~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    v_keys := array_append(v_keys, md5('email:' || v_email));
  end if;
  if v_source_lead_id <> '' then
    v_keys := array_append(v_keys, md5('source:' || v_source || ':' || v_source_lead_id));
  end if;

  for v_key in
    select distinct candidate.identity_key
      from unnest(v_keys) as candidate(identity_key)
     order by candidate.identity_key
  loop
    insert into public.lead_ingest_windows (identity_key, last_accepted_at)
    values (v_key, '-infinity'::timestamptz)
    on conflict (identity_key) do nothing;

    select ingest_window.last_accepted_at, ingest_window.last_lead_id
      into v_last_accepted_at, v_last_lead_id
      from public.lead_ingest_windows ingest_window
     where ingest_window.identity_key = v_key
     for update;

    if v_last_accepted_at > v_now - interval '10 minutes' then
      v_duplicate_id := coalesce(v_duplicate_id, v_last_lead_id);
    end if;
  end loop;

  if v_duplicate_id is not null then
    return query select v_duplicate_id, true;
    return;
  end if;

  insert into public.leads (
    owner_id, source, source_lead_id, source_detail, source_note,
    connector_id, customer_name, customer_phone, email, car_brand, car_model,
    status, created_at
  ) values (
    v_owner_id, v_source, nullif(v_source_lead_id, ''),
    nullif(btrim(coalesce(p_lead->>'source_detail', '')), ''),
    nullif(btrim(coalesce(p_lead->>'source_note', '')), ''),
    p_connector_id,
    nullif(btrim(coalesce(p_lead->>'customer_name', '')), ''),
    nullif(btrim(coalesce(p_lead->>'customer_phone', '')), ''),
    nullif(btrim(coalesce(p_lead->>'email', '')), ''),
    nullif(btrim(coalesce(p_lead->>'car_brand', '')), ''),
    nullif(btrim(coalesce(p_lead->>'car_model', '')), ''),
    'new',
    coalesce(nullif(p_lead->>'created_at', '')::timestamptz, v_now)
  ) returning id into v_lead_id;

  update public.lead_ingest_windows ingest_window
     set last_accepted_at = v_now, last_lead_id = v_lead_id
   where ingest_window.identity_key = any(v_keys);

  return query select v_lead_id, false;
end;
$$;

revoke all on function public.ingest_external_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_external_lead(uuid, jsonb) to service_role;
