-- Computed relationship: retain dashboard decision inputs without transferring full timelines.
-- Every (type, role, nonempty remark) bucket keeps its latest event, preserving
-- latest remark/update and role-attention decisions (including equal-time events by role).
create or replace function public.case_activity_summaries(public.cases)
returns setof public.case_activities
language sql stable security invoker set search_path = '' as $$
  select distinct on (a.type,a.actor_role,(a.type='remark' and btrim(a.message)<>'')) a.*
  from public.case_activities a where a.case_id=$1.id
  order by a.type,a.actor_role,(a.type='remark' and btrim(a.message)<>''),a.created_at desc,a.id desc
$$;
revoke all on function public.case_activity_summaries(public.cases) from public,anon;
grant execute on function public.case_activity_summaries(public.cases) to authenticated;

create index if not exists case_activity_summary_lookup_idx
  on public.case_activities(case_id,type,actor_role,created_at desc);
create index if not exists lead_latest_note_lookup_idx on public.lead_notes(lead_id,created_at desc);
create index if not exists case_due_reminder_lookup_idx on public.cases(next_follow_up_at)
  where deleted_at is null and status not in ('rejected','car_delivery','cancelled');
create index if not exists lead_due_reminder_lookup_idx on public.leads(follow_up_activity_at,owner_id)
  where deleted_at is null and status='contacted' and follow_up_count<4;
create index if not exists appointment_due_reminder_lookup_idx on public.appointments(starts_at)
  where deleted_at is null and status='scheduled';
notify pgrst,'reload schema';
