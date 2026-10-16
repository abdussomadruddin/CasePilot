create function public.save_case_remark(p_case_id uuid, p_remark text, p_expected_remark text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_case public.cases%rowtype;
  actor public.profiles%rowtype;
  activity public.case_activities%rowtype;
  saved_at timestamptz := clock_timestamp();
begin
  select * into actor from public.profiles where id=auth.uid() and active;
  if actor.id is null or actor.role='sales_manager' then raise exception 'Not permitted'; end if;
  if nullif(btrim(p_remark),'') is null then raise exception 'Enter a remark'; end if;
  select * into current_case from public.cases where id=p_case_id for update;
  if current_case.id is null then raise exception 'Case not accessible'; end if;
  if coalesce(current_case.remark,'') is distinct from coalesce(p_expected_remark,'') then
    raise exception 'Remark changed by another user. Refresh before saving.';
  end if;
  update public.cases set remark=btrim(p_remark), updated_at=saved_at,
    updated_by=actor.id, updated_by_role=actor.role,
    next_follow_up_at=case when status::text in ('rejected','car_delivery','cancelled') then null else saved_at+interval '48 hours' end
  where id=p_case_id returning * into current_case;
  if current_case.id is null then raise exception 'Not permitted'; end if;
  insert into public.case_activities(case_id,type,actor_role,actor_name,actor_id,message,created_at)
    values(p_case_id,'remark',actor.role,actor.full_name,actor.id,btrim(p_remark),saved_at)
    returning * into activity;
  return jsonb_build_object('remark',current_case.remark,'updated_at',saved_at,
    'next_follow_up_at',current_case.next_follow_up_at,'activity',to_jsonb(activity));
end $$;
revoke all on function public.save_case_remark(uuid,text,text) from public,anon;
grant execute on function public.save_case_remark(uuid,text,text) to authenticated;
