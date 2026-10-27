-- Use a dedicated token rather than exposing the Supabase service key in a cron HTTP header.
-- Deployment order: queue migration -> application -> this scheduler migration.
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='casepilot_ai_morning_token') then
  perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'casepilot_ai_morning_token','CasePilot morning draft worker only');
 end if;
end $$;
create function public.authorize_ai_morning_worker(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select length(coalesce(p_token,''))>0 and exists(select 1 from vault.decrypted_secrets where name='casepilot_ai_morning_token' and decrypted_secret=p_token)
$$;
revoke all on function public.authorize_ai_morning_worker(text) from public,anon,authenticated;
grant execute on function public.authorize_ai_morning_worker(text) to service_role;

create function public.dispatch_ai_morning_drafts() returns void
language plpgsql security definer set search_path='' as $$
declare token text; local_time time := (now() at time zone 'Asia/Kuala_Lumpur')::time;
begin
 if local_time<time '08:30' or local_time>=time '12:00' then return; end if;
 perform public.enqueue_ai_morning_jobs();
 if not exists(select 1 from public.ai_morning_jobs where batch_day=(now() at time zone 'Asia/Kuala_Lumpur')::date and ((status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<=now()))) then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='casepilot_ai_morning_token' limit 1;
 if nullif(token,'') is null then raise exception 'Morning worker token missing'; end if;
 perform net.http_post(url:='https://casepilotsystem.vercel.app/api/ai-follow-up',headers:=jsonb_build_object('Content-Type','application/json','x-casepilot-ai-worker',token),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function public.dispatch_ai_morning_drafts() from public,anon,authenticated;
select cron.schedule('casepilot-ai-morning-drafts','* 0-3 * * *',$$select public.dispatch_ai_morning_drafts();$$);
