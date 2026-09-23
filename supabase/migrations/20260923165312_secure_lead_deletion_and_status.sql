alter table public.leads add column if not exists rejection_reason text;

drop policy if exists "leads read admin or owner" on public.leads;
create policy "leads read admin or owner" on public.leads for select to authenticated
using (
  public.current_app_role() = 'admin'
  or (deleted_at is null and public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
);

create or replace function public.enforce_lead_workflow() returns trigger
language plpgsql set search_path = public as $$
declare
  actor_role public.app_role;
begin
  actor_role := public.current_app_role();
  if tg_op = 'INSERT' and (new.status <> 'new' or new.phone_revealed_at is not null) then
    raise exception 'New leads must start before the first call';
  end if;
  if tg_op = 'UPDATE' then
    if new.deleted_at is distinct from old.deleted_at and actor_role <> 'admin' then
      raise exception 'Only Admin can delete leads';
    end if;
    if old.deleted_at is not null then
      raise exception 'Deleted leads cannot be edited';
    end if;
    if actor_role in ('customer_service', 'broker') and old.phone_revealed_at is not null
      and new.status = 'new' and old.status <> 'new' then
      raise exception 'Contacted leads cannot return to New';
    end if;
    if old.phone_revealed_at is null and new.phone_revealed_at is null
      and new.status is distinct from old.status then
      raise exception 'Call the lead before changing status';
    end if;
    if actor_role in ('customer_service', 'broker') and new.status = 'rejected'
      and old.status is distinct from new.status and nullif(trim(new.rejection_reason), '') is null then
      raise exception 'Add a note explaining why the lead was rejected';
    end if;
  end if;
  return new;
end $$;

create trigger enforce_lead_workflow before insert or update on public.leads
for each row execute function public.enforce_lead_workflow();
