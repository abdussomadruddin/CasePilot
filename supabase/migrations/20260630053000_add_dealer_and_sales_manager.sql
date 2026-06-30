alter type public.app_role add value if not exists 'sales_manager';

alter table public.cases
add column if not exists dealer text not null default 'kah_motor';

update public.cases
set dealer = 'kah_motor'
where dealer is null or dealer not in ('kah_motor', 'other_dealer');

alter table public.cases
drop constraint if exists cases_dealer_check;

alter table public.cases
add constraint cases_dealer_check
check (dealer in ('kah_motor', 'other_dealer'));

create index if not exists cases_dealer_idx on public.cases(dealer);

drop policy if exists "cases read authenticated" on public.cases;
create policy "cases read authenticated"
on public.cases for select
to authenticated
using (
  public.current_app_role() is not null
  and (
    public.current_app_role()::text <> 'sales_manager'
    or dealer = 'kah_motor'
  )
);

drop policy if exists "case banks read authenticated" on public.case_banks;
create policy "case banks read authenticated"
on public.case_banks for select
to authenticated
using (
  public.current_app_role() is not null
  and (
    public.current_app_role()::text <> 'sales_manager'
    or exists (
      select 1
      from public.cases
      where cases.id = case_banks.case_id
      and cases.dealer = 'kah_motor'
    )
  )
);

drop policy if exists "case documents read authenticated" on public.case_documents;
create policy "case documents read authenticated"
on public.case_documents for select
to authenticated
using (
  public.current_app_role() is not null
  and (
    public.current_app_role()::text <> 'sales_manager'
    or exists (
      select 1
      from public.cases
      where cases.id = case_documents.case_id
      and cases.dealer = 'kah_motor'
    )
  )
);

drop policy if exists "case activities read authenticated" on public.case_activities;
create policy "case activities read authenticated"
on public.case_activities for select
to authenticated
using (
  public.current_app_role() is not null
  and (
    public.current_app_role()::text <> 'sales_manager'
    or exists (
      select 1
      from public.cases
      where cases.id = case_activities.case_id
      and cases.dealer = 'kah_motor'
    )
  )
);

drop policy if exists "case activities insert authenticated" on public.case_activities;
create policy "case activities insert authenticated"
on public.case_activities for insert
to authenticated
with check (
  public.current_app_role()::text in (
    'admin',
    'customer_service',
    'finance',
    'caller',
    'operator'
  )
);
