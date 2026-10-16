create function public.save_case_status(p_case_id uuid, p_status public.case_status, p_expected_status public.case_status)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_case public.cases%rowtype;
  actor public.profiles%rowtype;
  activity public.case_activities%rowtype;
  saved_at timestamptz := clock_timestamp();
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if actor.id is null or actor.role='sales_manager' then raise exception 'Not permitted'; end if;
  if actor.role='operator' and p_status::text not in ('prepare_delivery','car_delivery','cancelled') then raise exception 'Status not permitted'; end if;
  if actor.role='caller' and p_status::text='more_documents_needed' then raise exception 'Status not permitted'; end if;
  select * into current_case from public.cases where id=p_case_id for update;
  if current_case.id is null then raise exception 'Case not accessible'; end if;
  if current_case.status is distinct from p_expected_status then raise exception 'Status changed by another user. Refresh before saving.'; end if;
  if p_status is null or p_status=current_case.status then raise exception 'Select a different status'; end if;
  update public.cases set status=p_status, updated_at=saved_at, updated_by=actor.id, updated_by_role=actor.role,
    next_follow_up_at=case when p_status::text in ('rejected','car_delivery','cancelled') then null else saved_at+interval '48 hours' end
    where id=p_case_id returning * into current_case;
  if current_case.id is null then raise exception 'Not permitted'; end if;
  insert into public.case_activities(case_id,type,actor_role,actor_name,actor_id,message,status,created_at)
    values(p_case_id,'status',actor.role,actor.full_name,actor.id,'Status changed to '||p_status::text,p_status,saved_at) returning * into activity;
  return jsonb_build_object('status',current_case.status,'updated_at',saved_at,
    'next_follow_up_at',current_case.next_follow_up_at,'activity',to_jsonb(activity));
end $$;
revoke all on function public.save_case_status(uuid,public.case_status,public.case_status) from public,anon;
grant execute on function public.save_case_status(uuid,public.case_status,public.case_status) to authenticated;
