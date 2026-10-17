-- Keep returning leads with their existing owner and retain existing notes.
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
  v_existing public.leads%rowtype;
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

  v_phone := public.normalize_lead_phone(p_lead->>'customer_phone');
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

  if v_phone is not null then
    select * into v_existing from public.leads l
    where l.deleted_at is null and public.normalize_lead_phone(l.customer_phone)=v_phone
    order by l.updated_at desc,l.id limit 1 for update;
  end if;
  if v_existing.id is not null then
    -- Returning inquiries belong to the existing owner, even across connectors.
    v_owner_id := v_existing.owner_id;
    if nullif(btrim(p_lead->>'source_note'),'') is not null
      and btrim(p_lead->>'source_note') is distinct from nullif(btrim(v_existing.source_note),'') then
      insert into public.lead_notes(lead_id,author_id,body)
      values(v_existing.id,v_existing.owner_id,'Incoming inquiry: ' || btrim(p_lead->>'source_note'));
    end if;
    update public.leads set
      owner_id=v_owner_id, source=v_source, source_lead_id=nullif(v_source_lead_id,''),
      source_detail=nullif(btrim(p_lead->>'source_detail'),''),
      source_note=coalesce(nullif(btrim(source_note),''),nullif(btrim(p_lead->>'source_note'),'')),
      connector_id=p_connector_id,
      customer_name=coalesce(nullif(btrim(p_lead->>'customer_name'),''),customer_name),
      customer_phone=coalesce(nullif(btrim(p_lead->>'customer_phone'),''),customer_phone),
      email=coalesce(nullif(btrim(p_lead->>'email'),''),email),
      car_brand=coalesce(nullif(btrim(p_lead->>'car_brand'),''),car_brand),
      car_model=coalesce(nullif(btrim(p_lead->>'car_model'),''),car_model),
      has_ever_contacted=has_ever_contacted or phone_revealed_at is not null
        or exists(select 1 from public.lead_events e where e.lead_id=v_existing.id and e.status='contacted')
        or exists(select 1 from public.lead_follow_up_actions a where a.lead_id=v_existing.id),
      status='new', phone_revealed_at=null, follow_up_count=0,
      follow_up_activity_at=null, rejection_reason=null,
      received_at=v_now, receipt_id=gen_random_uuid(), return_count=return_count+1
    where id=v_existing.id returning id into v_lead_id;
    insert into public.lead_events(lead_id,actor_id,status,event_kind,previous_owner_id)
    values(v_lead_id,v_owner_id,'new','reentered',v_existing.owner_id);
  else
  insert into public.leads (
    owner_id, source, source_lead_id, source_detail, source_note,
    connector_id, customer_name, customer_phone, email, car_brand, car_model,
    status, created_at, received_at
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
    coalesce(nullif(p_lead->>'created_at', '')::timestamptz, v_now), v_now
  ) returning id into v_lead_id;

  end if;

  update public.lead_ingest_windows ingest_window
     set last_accepted_at = v_now, last_lead_id = v_lead_id
   where ingest_window.identity_key = any(v_keys);

  return query select v_lead_id, false;
end;
$$;

revoke all on function public.ingest_external_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_external_lead(uuid, jsonb) to service_role;

