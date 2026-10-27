-- Encrypted, same-day preparation. No message send, contact or reminder rules change.
alter table public.ai_follow_up_drafts add column prepared_for date, add column cached_payload text;
create index ai_prepared_lookup on public.ai_follow_up_drafts(user_id,lead_id,session_id,prepared_for,created_at desc) where cached_payload is not null;
create table public.ai_morning_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 session_id text references public.ai_device_assignments(session_id) on delete set null,
 enabled boolean not null default true,updated_at timestamptz not null default now()
);
create table public.ai_morning_jobs (
 id uuid primary key default gen_random_uuid(),batch_day date not null,
 user_id uuid not null references public.profiles(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete cascade,
 session_id text not null references public.ai_device_assignments(session_id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','ready','blocked','failed','skipped')),
 attempts integer not null default 0,lease_id uuid,lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),last_error text,
 draft_id uuid references public.ai_follow_up_drafts(id) on delete set null,
 updated_at timestamptz not null default now(),unique(batch_day,user_id,lead_id,session_id)
);
create index ai_morning_pending on public.ai_morning_jobs(batch_day,next_attempt_at) where status in ('queued','running');
alter table public.ai_morning_preferences enable row level security;
alter table public.ai_morning_jobs enable row level security;
revoke all on public.ai_morning_preferences,public.ai_morning_jobs from public,anon,authenticated;
grant all on public.ai_morning_preferences,public.ai_morning_jobs to service_role;

-- Preserve other leads' prepared drafts when any one generation starts.
create or replace function public.claim_ai_generation(p_user_id uuid,p_request_id uuid) returns boolean
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
 return true;
end $$;

create function public.enqueue_ai_morning_jobs(p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path='' as $$
declare day date := (p_now at time zone 'Asia/Kuala_Lumpur')::date; n integer; cut timestamptz;
begin
 if (p_now at time zone 'Asia/Kuala_Lumpur')::time < time '08:30' or (p_now at time zone 'Asia/Kuala_Lumpur')::time >= time '12:00' then return 0; end if;
 cut := (day+time '09:30') at time zone 'Asia/Kuala_Lumpur';
 -- Clear ciphertext as soon as the next morning run sees expiry. Metadata stays for audit.
 update public.ai_follow_up_drafts set cached_payload=null where cached_payload is not null and expires_at<=p_now;
 insert into public.ai_morning_jobs(batch_day,user_id,lead_id,session_id)
 select day,l.owner_id,l.id,d.session_id from public.leads l
 join public.profiles p on p.id=l.owner_id and p.active and p.role in ('customer_service','broker')
 left join public.ai_morning_preferences pref on pref.user_id=l.owner_id
 join lateral (
  select a.session_id from public.ai_device_assignments a where a.user_id=l.owner_id
  and (a.session_id=pref.session_id or (pref.session_id is null and (select count(*) from public.ai_device_assignments x where x.user_id=l.owner_id)=1))
 ) d on true
 where l.deleted_at is null and l.status='contacted' and l.follow_up_count<4 and l.follow_up_activity_at<=cut-interval '24 hours'
 and coalesce(pref.enabled,true) and nullif(trim(l.customer_phone),'') is not null
 and exists(select 1 from public.ai_follow_up_settings where id and openai_secret is not null and murpati_secret is not null)
 and not exists(select 1 from public.ai_sales_stage_state s where s.lead_id=l.id and s.session_id=d.session_id and s.stage_id in ('WON','LOST'))
 order by l.follow_up_activity_at,l.id
 on conflict(batch_day,user_id,lead_id,session_id) do nothing;
 get diagnostics n=row_count;return n;
end $$;

create function public.claim_ai_morning_jobs(p_now timestamptz default now()) returns setof public.ai_morning_jobs
language plpgsql security invoker set search_path='' as $$
declare day date := (p_now at time zone 'Asia/Kuala_Lumpur')::date;
begin
 update public.ai_morning_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,lease_until=null,last_error='Worker terganggu. Retry terhad.',updated_at=p_now
 where batch_day=day and status='running' and lease_until<=p_now;
 update public.ai_morning_jobs j set status='skipped',last_error='Lead, pemilik atau device tidak lagi layak.',updated_at=p_now
 where j.batch_day=day and j.status='queued' and not exists (
 select 1 from public.leads l join public.profiles p on p.id=l.owner_id
 join public.ai_device_assignments a on a.user_id=l.owner_id and a.session_id=j.session_id
 left join public.ai_morning_preferences pref on pref.user_id=l.owner_id
 where l.id=j.lead_id and l.owner_id=j.user_id and p.active and p.role in ('customer_service','broker')
 and l.deleted_at is null and l.status='contacted' and l.follow_up_count<4
 and l.follow_up_activity_at<=((day+time '09:30') at time zone 'Asia/Kuala_Lumpur')-interval '24 hours'
 and coalesce(pref.enabled,true) and (pref.session_id is null or pref.session_id=j.session_id));
 return query
 with picked as (
  select j.id from public.ai_morning_jobs j where j.batch_day=day and j.status='queued' and j.attempts<3 and j.next_attempt_at<=p_now
  and not exists(select 1 from public.ai_morning_jobs busy where busy.user_id=j.user_id and busy.status='running' and busy.lease_until>p_now)
  and j.id=(select first_job.id from public.ai_morning_jobs first_job where first_job.user_id=j.user_id and first_job.batch_day=day and first_job.status='queued' and first_job.next_attempt_at<=p_now and first_job.attempts<3 order by first_job.updated_at,first_job.id limit 1)
  order by j.updated_at,j.id limit 4 for update skip locked
 ) update public.ai_morning_jobs j set status='running',attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=p_now+interval '3 minutes',updated_at=p_now from picked where j.id=picked.id returning j.*;
end $$;
revoke all on function public.enqueue_ai_morning_jobs(timestamptz),public.claim_ai_morning_jobs(timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_ai_morning_jobs(timestamptz),public.claim_ai_morning_jobs(timestamptz) to service_role;

-- Remove cached text after successful handoff, retaining existing idempotency metadata.
alter function public.open_ai_follow_up(uuid,uuid) rename to open_ai_follow_up_with_playbook;
revoke all on function public.open_ai_follow_up_with_playbook(uuid,uuid) from public,anon,authenticated;
create function public.open_ai_follow_up(p_draft_id uuid,p_ticket uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 n:=public.open_ai_follow_up_with_playbook(p_draft_id,p_ticket);
 update public.ai_follow_up_drafts set cached_payload=null where id=p_draft_id;
 return n;
end $$;
revoke all on function public.open_ai_follow_up(uuid,uuid) from public,anon;
grant execute on function public.open_ai_follow_up(uuid,uuid) to authenticated;
