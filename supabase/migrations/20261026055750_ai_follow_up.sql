-- Secrets and working metadata are server-only. No chat or draft text is persisted.
create table public.ai_follow_up_settings (
  id boolean primary key default true check (id),
  openai_secret text, murpati_secret text,
  revision integer not null default 1,
  daily_limit integer not null default 50 check (daily_limit between 1 and 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create table public.ai_device_assignments (
  session_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null, name text not null,
  updated_at timestamptz not null default now()
);
create index ai_device_assignments_user on public.ai_device_assignments(user_id);
create table public.ai_generation_locks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  request_id uuid not null, expires_at timestamptz not null
);
create table public.ai_follow_up_drafts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  session_id text not null, phone text not null,
  revision integer not null, snapshot text not null,
  conversation_hash text not null default '',
  recipient_phone text not null default '', recipient_username text not null default '',
  ticket uuid not null default gen_random_uuid(),
  outcome text not null default 'generating' check (outcome in ('generating','ready','blocked','failed','superseded','opened')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  opened_at timestamptz, follow_up_count integer
);
create index ai_drafts_user_created on public.ai_follow_up_drafts(user_id,created_at desc);
create index ai_drafts_lead_opened on public.ai_follow_up_drafts(lead_id,opened_at desc) where opened_at is not null;
alter table public.ai_follow_up_settings enable row level security;
alter table public.ai_device_assignments enable row level security;
alter table public.ai_generation_locks enable row level security;
alter table public.ai_follow_up_drafts enable row level security;
revoke all on public.ai_follow_up_settings, public.ai_device_assignments, public.ai_generation_locks, public.ai_follow_up_drafts from public,anon,authenticated;
grant all on public.ai_follow_up_settings, public.ai_device_assignments, public.ai_generation_locks, public.ai_follow_up_drafts to service_role;

-- Hash all prompt-relevant database fields, including note edits and linked cases.
create function public.ai_lead_snapshot(p_lead_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select md5(jsonb_build_object('lead',to_jsonb(l),
   'notes',(select jsonb_agg(to_jsonb(n) order by n.created_at,n.id) from public.lead_notes n where n.lead_id=l.id),
   'cases',(select jsonb_agg(jsonb_build_object('id',c.id,'owner',c.owner_id,'status',c.status,'remark',c.remark,'model',c.car_model,'updated',c.updated_at,'deleted',c.deleted_at) order by c.id) from public.cases c where c.lead_id=l.id))::text)
 from public.leads l where l.id=p_lead_id and l.deleted_at is null
$$;
revoke all on function public.ai_lead_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.ai_lead_snapshot(uuid) to service_role;

create function public.claim_ai_generation(p_user_id uuid,p_request_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare affected integer; max_daily integer;
begin
 insert into public.ai_generation_locks(user_id,request_id,expires_at)
 values(p_user_id,p_request_id,now()+interval '90 seconds')
 on conflict(user_id) do update set request_id=excluded.request_id,expires_at=excluded.expires_at
 where public.ai_generation_locks.expires_at<=now();
 get diagnostics affected = row_count;
 if affected=0 then return false; end if;
 select daily_limit into max_daily from public.ai_follow_up_settings where id;
 if (select count(*) from public.ai_follow_up_drafts where user_id=p_user_id and created_at>=date_trunc('day',now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur') >= coalesce(max_daily,50) then
   raise exception 'Had harian AI dicapai. Hubungi Admin.';
 end if;
 update public.ai_follow_up_drafts set outcome='superseded' where user_id=p_user_id and outcome='ready';
 return true;
end $$;
revoke all on function public.claim_ai_generation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_generation(uuid,uuid) to service_role;

-- Only a server holding the private ticket can hand off a generated draft.
-- Existing contact/follow-up functions and triggers run in the same transaction.
create function public.open_ai_follow_up(p_draft_id uuid,p_ticket uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare d public.ai_follow_up_drafts%rowtype; l public.leads%rowtype; member_role text; current_revision integer; n integer;
begin
 select role into member_role from public.profiles where id=auth.uid() and active;
 if member_role is null or member_role not in ('admin','customer_service','broker') then raise exception 'Access denied'; end if;
 select * into d from public.ai_follow_up_drafts where id=p_draft_id and user_id=auth.uid() and ticket=p_ticket for update;
 if not found or d.expires_at<=now() then raise exception 'Draf tamat atau tidak tersedia. Jana semula.'; end if;
 select revision into current_revision from public.ai_follow_up_settings where id for share;
 if current_revision is distinct from d.revision then raise exception 'Tetapan berubah. Jana semula.'; end if;
 perform 1 from public.ai_device_assignments where session_id=d.session_id and user_id=auth.uid() and phone=d.phone for share;
 if not found then raise exception 'Device tidak lagi ditetapkan kepada anda.'; end if;
 select * into l from public.leads where id=d.lead_id and deleted_at is null for update;
 if not found or (member_role<>'admin' and l.owner_id<>auth.uid()) or l.status='rejected' then raise exception 'Lead tidak tersedia.'; end if;
 if coalesce(l.customer_phone,'')<>d.recipient_phone or coalesce(l.whatsapp_username,'')<>d.recipient_username then raise exception 'Penerima berubah. Jana semula.'; end if;
 if d.outcome='opened' then return d.follow_up_count; end if;
 if d.outcome<>'ready' or public.ai_lead_snapshot(l.id) is distinct from d.snapshot then raise exception 'Maklumat Lead atau Case berubah. Jana semula.'; end if;
 n:=l.follow_up_count;
 if l.status='new' or l.phone_revealed_at is null then
   perform public.contact_lead(l.id);
 elsif n<6 then
   n:=public.record_lead_follow_up(l.id);
 end if;
 update public.ai_follow_up_drafts set outcome='opened',opened_at=now(),follow_up_count=n where id=d.id;
 return n;
end $$;
revoke all on function public.open_ai_follow_up(uuid,uuid) from public,anon;
grant execute on function public.open_ai_follow_up(uuid,uuid) to authenticated;
