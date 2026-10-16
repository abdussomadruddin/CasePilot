alter table public.leads
  add column has_ever_contacted boolean not null default false,
  add column received_at timestamptz,
  add column receipt_id uuid not null default gen_random_uuid(),
  add column return_count integer not null default 0;
alter table public.lead_events add column event_kind text, add column previous_owner_id uuid references public.profiles(id);
alter table public.lead_follow_up_actions add column receipt_id uuid;
update public.lead_follow_up_actions a set receipt_id=l.receipt_id from public.leads l where a.lead_id=l.id;
alter table public.lead_follow_up_actions alter column receipt_id set not null;
alter table public.lead_follow_up_actions drop constraint lead_follow_up_actions_lead_id_follow_up_number_key;
alter table public.lead_follow_up_actions add unique(lead_id,receipt_id,follow_up_number);
alter table public.new_lead_alert_queue add column receipt_id uuid;

create function public.normalize_lead_phone(value text) returns text language sql immutable set search_path='' as $$
  select case when phone ~ '^601[0-9]{8,9}$' then phone end from (
    select case when digits like '0060%' then substr(digits,3)
      when digits like '60%' then digits when digits like '0%' then '60'||substr(digits,2)
      when digits like '1%' then '60'||digits else digits end phone
    from (select regexp_replace(coalesce(value,''),'[^0-9]','','g') digits) s
  ) n;
$$;
create index leads_normalized_phone_active on public.leads(public.normalize_lead_phone(customer_phone),updated_at desc) where deleted_at is null;

create function public.set_follow_up_receipt() returns trigger language plpgsql set search_path=public as $$
begin
  select receipt_id into new.receipt_id from public.leads where id=new.lead_id for update;
  if new.receipt_id is null then raise exception 'Lead not accessible'; end if;
  return new;
end $$;
create trigger set_follow_up_receipt before insert on public.lead_follow_up_actions for each row execute function public.set_follow_up_receipt();

create function public.guard_lead_receipt() returns trigger language plpgsql set search_path=public as $$
begin
  if current_user not in ('service_role','postgres','supabase_admin') then
    if tg_op='UPDATE' and row(new.received_at,new.receipt_id,new.return_count) is distinct from row(old.received_at,old.receipt_id,old.return_count) then
      raise exception 'Only ingestion can reactivate a lead';
    end if;
    if tg_op='INSERT' then new.received_at:=null; new.return_count:=0; new.has_ever_contacted:=false; end if;
  end if;
  if tg_op='UPDATE' then new.has_ever_contacted:=old.has_ever_contacted or old.phone_revealed_at is not null or (current_user in ('service_role','postgres','supabase_admin') and new.has_ever_contacted); end if;
  new.has_ever_contacted:=new.has_ever_contacted or new.phone_revealed_at is not null;
  return new;
end $$;
create trigger guard_lead_receipt before insert or update on public.leads for each row execute function public.guard_lead_receipt();

do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.enforce_lead_workflow()'::regprocedure);
  definition:=replace(definition,'old.created_at < now()', 'coalesce(old.received_at,old.created_at) < now()');
  definition:=replace(definition, 'and new.status is distinct from old.status and not (',
    'and new.status is distinct from old.status and not (current_user in (''service_role'',''postgres'',''supabase_admin'') and new.receipt_id is distinct from old.receipt_id and new.status = ''new'') and not (');
  execute definition;
end $$;

create or replace function public.protect_lead_source() returns trigger language plpgsql set search_path=public as $$
begin
  if row(new.source,new.source_lead_id,new.source_detail,new.source_note,new.connector_id)
    is distinct from row(old.source,old.source_lead_id,old.source_detail,old.source_note,old.connector_id)
    and not (current_user in ('service_role','postgres','supabase_admin') and new.receipt_id is distinct from old.receipt_id) then
    raise exception 'Lead source cannot be changed after creation';
  end if;
  return new;
end $$;

create or replace function public.promote_old_new_contacted_leads() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  with changed as (
    update public.leads set status='need_follow_up',updated_at=now()
    where deleted_at is null and status in ('new','contacted')
      and coalesce(received_at,created_at)<now()-interval '15 days'
    returning id,owner_id
  ) insert into public.lead_events(lead_id,actor_id,status) select id,owner_id,'need_follow_up' from changed;
  get diagnostics affected=row_count; return affected;
end $$;

create function public.claim_returning_lead_alert(p_lead_id uuid,p_owner_id uuid,p_receipt_id uuid)
returns table(recipient_id uuid,lead_ids uuid[]) language sql security definer set search_path=public as $$
  update public.new_lead_alert_queue set claimed_at=clock_timestamp()
  where lead_id=p_lead_id and owner_id=p_owner_id and receipt_id=p_receipt_id and claimed_at is null
  returning owner_id,array[lead_id];
$$;
revoke all on function public.claim_returning_lead_alert(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_returning_lead_alert(uuid,uuid,uuid) to service_role;

create or replace function public.queue_new_lead_alert() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='new' and new.deleted_at is null
    and (tg_op='INSERT' or new.owner_id is distinct from old.owner_id or new.receipt_id is distinct from old.receipt_id)
    and exists(select 1 from public.profiles where id=new.owner_id and active and role in ('customer_service','broker')) then
    insert into public.new_lead_alert_queue(lead_id,owner_id,receipt_id) values(new.id,new.owner_id,new.receipt_id)
    on conflict(lead_id,owner_id) do update set receipt_id=excluded.receipt_id,queued_at=clock_timestamp(),claimed_at=null,sent_at=null,last_error=null;
    perform net.http_post(
      url:='https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/new-lead-alerts',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('lead_id',new.id,'owner_id',new.owner_id,'receipt_id',new.receipt_id)
    );
  end if;
  return new;
end $$;
drop trigger queue_new_lead_alert on public.leads;
create trigger queue_new_lead_alert after insert or update of owner_id,receipt_id on public.leads for each row execute function public.queue_new_lead_alert();

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
    if nullif(btrim(v_existing.source_note),'') is not null then
      insert into public.lead_notes(lead_id,author_id,body)
      values(v_existing.id,v_existing.owner_id,'Previous inquiry: ' || v_existing.source_note);
    end if;
    update public.leads set
      owner_id=v_owner_id, source=v_source, source_lead_id=nullif(v_source_lead_id,''),
      source_detail=nullif(btrim(p_lead->>'source_detail'),''),
      source_note=coalesce(nullif(btrim(p_lead->>'source_note'),''),source_note),
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

