alter table public.cases
add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create index if not exists cases_owner_id_idx on public.cases(owner_id);

update public.cases c
set owner_id = c.created_by
from public.profiles p
where c.owner_id is null
  and p.id = c.created_by
  and p.role in ('customer_service', 'broker');

drop policy if exists "cases read authenticated" on public.cases;
create policy "cases read authenticated"
on public.cases for select to authenticated
using (
  public.current_app_role() in ('admin', 'customer_service', 'finance')
  or (public.current_app_role() = 'broker' and owner_id = (select auth.uid()))
  or (public.current_app_role() = 'sales_manager' and dealer = 'kah_motor')
  or (
    public.current_app_role() in ('caller', 'operator')
    and not exists (
      select 1 from public.profiles owner_profile
      where owner_profile.id = cases.owner_id and owner_profile.role = 'broker'
    )
  )
);

drop policy if exists "cases insert operations" on public.cases;
create policy "cases insert operations"
on public.cases for insert to authenticated
with check (
  public.current_app_role() = 'admin'
  or (public.current_app_role() = 'customer_service' and owner_id = (select auth.uid()))
  or (
    public.current_app_role() = 'broker'
    and owner_id = (select auth.uid())
    and dealer = 'other_dealer'
  )
);

drop policy if exists "cases update operations" on public.cases;
create policy "cases update operations"
on public.cases for update to authenticated
using (
  public.current_app_role() in ('admin', 'finance')
  or (
    public.current_app_role() = 'customer_service'
    and not exists (
      select 1 from public.profiles owner_profile
      where owner_profile.id = cases.owner_id and owner_profile.role = 'broker'
    )
  )
  or (public.current_app_role() = 'broker' and owner_id = (select auth.uid()))
  or (
    public.current_app_role() in ('caller', 'operator')
    and not exists (
      select 1 from public.profiles owner_profile
      where owner_profile.id = cases.owner_id and owner_profile.role = 'broker'
    )
  )
)
with check (
  public.current_app_role() in ('admin', 'finance')
  or (
    public.current_app_role() = 'customer_service'
    and not exists (
      select 1 from public.profiles owner_profile
      where owner_profile.id = cases.owner_id and owner_profile.role = 'broker'
    )
  )
  or (
    public.current_app_role() = 'broker'
    and owner_id = (select auth.uid())
    and dealer = 'other_dealer'
  )
  or (
    public.current_app_role() in ('caller', 'operator')
    and not exists (
      select 1 from public.profiles owner_profile
      where owner_profile.id = cases.owner_id and owner_profile.role = 'broker'
    )
  )
);

drop policy if exists "case banks read authenticated" on public.case_banks;
create policy "case banks read authenticated"
on public.case_banks for select to authenticated
using (exists (select 1 from public.cases where cases.id = case_banks.case_id));

drop policy if exists "case banks manage permitted" on public.case_banks;
create policy "case banks manage permitted"
on public.case_banks for all to authenticated
using (
  exists (
    select 1 from public.cases
    where cases.id = case_banks.case_id
      and (
        public.current_app_role() in ('admin', 'finance')
        or (public.current_app_role() = 'broker' and cases.owner_id = (select auth.uid()))
        or (public.current_app_role() = 'customer_service' and not exists (
          select 1 from public.profiles p where p.id = cases.owner_id and p.role = 'broker'
        ))
      )
  )
)
with check (
  exists (
    select 1 from public.cases
    where cases.id = case_banks.case_id
      and (
        public.current_app_role() in ('admin', 'finance')
        or (public.current_app_role() = 'broker' and cases.owner_id = (select auth.uid()))
        or (public.current_app_role() = 'customer_service' and not exists (
          select 1 from public.profiles p where p.id = cases.owner_id and p.role = 'broker'
        ))
      )
  )
);

drop policy if exists "case documents read authenticated" on public.case_documents;
create policy "case documents read authenticated"
on public.case_documents for select to authenticated
using (exists (select 1 from public.cases where cases.id = case_documents.case_id));

drop policy if exists "case documents insert permitted" on public.case_documents;
create policy "case documents insert permitted"
on public.case_documents for insert to authenticated
with check (
  exists (
    select 1 from public.cases
    where cases.id = case_documents.case_id
      and (
        public.current_app_role() = 'admin'
        or (public.current_app_role() = 'broker' and cases.owner_id = (select auth.uid()))
        or (public.current_app_role() = 'customer_service' and not exists (
          select 1 from public.profiles p where p.id = cases.owner_id and p.role = 'broker'
        ))
      )
  )
);

drop policy if exists "case activities read authenticated" on public.case_activities;
create policy "case activities read authenticated"
on public.case_activities for select to authenticated
using (exists (select 1 from public.cases where cases.id = case_activities.case_id));

drop policy if exists "case activities insert authenticated" on public.case_activities;
create policy "case activities insert authenticated"
on public.case_activities for insert to authenticated
with check (
  exists (
    select 1 from public.cases
    where cases.id = case_activities.case_id
      and (
        public.current_app_role() in ('admin', 'finance', 'caller', 'operator')
        or (public.current_app_role() = 'broker' and cases.owner_id = (select auth.uid()))
        or (public.current_app_role() = 'customer_service' and not exists (
          select 1 from public.profiles p where p.id = cases.owner_id and p.role = 'broker'
        ))
      )
  )
);

drop policy if exists "case notifications read role" on public.case_notifications;
create policy "case notifications read role"
on public.case_notifications for select to authenticated
using (
  public.current_app_role() = 'admin'
  or role = public.current_app_role()
);

drop policy if exists "case documents storage upload" on storage.objects;
create policy "case documents storage upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'case-documents'
  and public.current_app_role() in ('admin', 'customer_service', 'broker')
);
