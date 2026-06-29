create extension if not exists "pgcrypto";

do $$
begin
  create type public.app_role as enum (
    'admin',
    'customer_service',
    'finance',
    'caller',
    'operator'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.case_status as enum (
    'documents_collected',
    'more_documents_needed',
    'submission',
    'rejected',
    'lou_received',
    'lou_submitted_for_order',
    'car_registered',
    'car_delivered',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.activity_type as enum (
    'case',
    'status',
    'remark',
    'document',
    'bank',
    'notification',
    'follow_up'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'customer_service',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  car_model text not null,
  car_variant text not null,
  car_color text not null,
  status public.case_status not null default 'documents_collected',
  remark text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_by_role public.app_role not null default 'customer_service',
  updated_by_role public.app_role not null default 'customer_service',
  next_follow_up_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_banks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  bank_name text not null,
  banker_name text not null,
  banker_phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text,
  uploaded_by uuid references public.profiles(id),
  uploaded_by_role public.app_role not null default 'customer_service',
  uploaded_at timestamptz not null default now()
);

create table if not exists public.case_activities (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  type public.activity_type not null,
  actor_id uuid references public.profiles(id),
  actor_role public.app_role not null,
  actor_name text,
  message text not null,
  status public.case_status,
  created_at timestamptz not null default now()
);

create table if not exists public.case_notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  role public.app_role not null,
  reason text not null,
  status public.case_status,
  due_at timestamptz not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cases_status_idx on public.cases(status);
create index if not exists cases_updated_at_idx on public.cases(updated_at desc);
create index if not exists case_activities_case_id_idx on public.case_activities(case_id, created_at desc);
create index if not exists case_notifications_due_idx on public.case_notifications(role, due_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_cases_updated_at on public.cases;
create trigger touch_cases_updated_at
before update on public.cases
for each row execute function public.touch_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.app_role;
begin
  begin
    requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'customer_service')::public.app_role;
  exception
    when invalid_text_representation then
      requested_role := 'customer_service'::public.app_role;
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    requested_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_banks enable row level security;
alter table public.case_documents enable row level security;
alter table public.case_activities enable row level security;
alter table public.case_notifications enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin')
with check (id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists "cases read authenticated" on public.cases;
create policy "cases read authenticated"
on public.cases for select
to authenticated
using (deleted_at is null);

drop policy if exists "cases insert operations" on public.cases;
create policy "cases insert operations"
on public.cases for insert
to authenticated
with check (public.current_app_role() in ('admin', 'customer_service'));

drop policy if exists "cases update operations" on public.cases;
create policy "cases update operations"
on public.cases for update
to authenticated
using (public.current_app_role() in ('admin', 'customer_service', 'finance', 'caller', 'operator'))
with check (public.current_app_role() in ('admin', 'customer_service', 'finance', 'caller', 'operator'));

drop policy if exists "case banks read authenticated" on public.case_banks;
create policy "case banks read authenticated"
on public.case_banks for select
to authenticated
using (true);

drop policy if exists "case banks manage permitted" on public.case_banks;
create policy "case banks manage permitted"
on public.case_banks for all
to authenticated
using (public.current_app_role() in ('admin', 'customer_service', 'finance'))
with check (public.current_app_role() in ('admin', 'customer_service', 'finance'));

drop policy if exists "case documents read authenticated" on public.case_documents;
create policy "case documents read authenticated"
on public.case_documents for select
to authenticated
using (true);

drop policy if exists "case documents insert permitted" on public.case_documents;
create policy "case documents insert permitted"
on public.case_documents for insert
to authenticated
with check (public.current_app_role() in ('admin', 'customer_service'));

drop policy if exists "case activities read authenticated" on public.case_activities;
create policy "case activities read authenticated"
on public.case_activities for select
to authenticated
using (true);

drop policy if exists "case activities insert authenticated" on public.case_activities;
create policy "case activities insert authenticated"
on public.case_activities for insert
to authenticated
with check (public.current_app_role() is not null);

drop policy if exists "case notifications read role" on public.case_notifications;
create policy "case notifications read role"
on public.case_notifications for select
to authenticated
using (role = public.current_app_role() or public.current_app_role() = 'admin');

insert into storage.buckets (id, name, public, file_size_limit)
values ('case-documents', 'case-documents', true, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "case documents storage read" on storage.objects;
create policy "case documents storage read"
on storage.objects for select
to authenticated
using (bucket_id = 'case-documents');

drop policy if exists "case documents storage upload" on storage.objects;
create policy "case documents storage upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'case-documents'
  and public.current_app_role() in ('admin', 'customer_service')
);

drop policy if exists "case documents storage admin delete" on storage.objects;
create policy "case documents storage admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'case-documents'
  and public.current_app_role() = 'admin'
);
