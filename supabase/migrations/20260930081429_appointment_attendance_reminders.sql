alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
check (status in ('scheduled','completed','cancelled','show_up','no_show'));

alter table public.appointment_alert_deliveries drop constraint appointment_alert_deliveries_offset_minutes_check;
alter table public.appointment_alert_deliveries add constraint appointment_alert_deliveries_offset_minutes_check
check (offset_minutes in (4320,1440,240,60,-120,-180,-240,-300,-360,-420));

select cron.schedule('casepilot-close-unreported-appointments','* * * * *',
  $$update public.appointments set status='completed',updated_at=now()
    where status='scheduled' and deleted_at is null and starts_at <= now() - interval '8 hours'$$);
alter table public.appointments add column deleted_at timestamptz;
create or replace function public.guard_appointment_deletion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.deleted_at is not null then raise exception 'Cannot create deleted appointment'; end if;
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null then raise exception 'Deleted appointment cannot be edited'; end if;
    if new.deleted_at is distinct from old.deleted_at and public.current_app_role() is distinct from 'admin'::public.app_role then raise exception 'Only Admin can delete appointments'; end if;
  end if;
  return new;
end $$;
create trigger guard_appointment_deletion before insert or update on public.appointments for each row execute function public.guard_appointment_deletion();
create or replace function public.delete_appointment(p_appointment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'admin'::public.app_role then raise exception 'Only Admin can delete appointments'; end if;
  update public.appointments set deleted_at=now(),status='cancelled',updated_at=now() where id=p_appointment_id and deleted_at is null;
  if not found then raise exception 'Appointment not found'; end if;
end $$;
revoke all on function public.delete_appointment(uuid) from public,anon;
grant execute on function public.delete_appointment(uuid) to authenticated;
