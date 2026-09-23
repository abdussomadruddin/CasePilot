create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null check (length(trim(customer_phone)) > 0),
  phone_revealed_at timestamptz,
  email text,
  car_brand text not null check (length(trim(car_brand)) > 0),
  car_model text not null check (length(trim(car_model)) > 0),
  status text not null default 'new' check (status in (
    'new', 'contacted', 'number_invalid', 'all_offer_presented',
    'potential', 'need_follow_up', 'rejected', 'document_collected'
  )),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_owner_updated_idx on public.leads(owner_id, updated_at desc);

create or replace function public.validate_lead_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = new.owner_id and role in ('customer_service', 'broker') and active) then
    raise exception 'Lead owner must be an active Customer Service or Broker';
  end if;
  return new;
end $$;
create trigger validate_lead_owner before insert or update of owner_id on public.leads
for each row execute function public.validate_lead_owner();

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists lead_notes_lead_created_idx on public.lead_notes(lead_id, created_at);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_events_lead_created_idx on public.lead_events(lead_id, created_at);

alter table public.cases add column if not exists lead_id uuid references public.leads(id);
create unique index if not exists cases_lead_id_unique on public.cases(lead_id) where lead_id is not null;

create or replace function public.validate_case_lead() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.lead_id is not distinct from old.lead_id then
    return new;
  end if;
  if new.lead_id is not null and not exists (
    select 1 from public.leads where id = new.lead_id and deleted_at is null and owner_id = new.owner_id
  ) then
    raise exception 'Case lead must belong to the case owner';
  end if;
  return new;
end $$;
create trigger validate_case_lead before insert or update of lead_id on public.cases
for each row execute function public.validate_case_lead();

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  lead_id uuid references public.leads(id),
  case_id uuid references public.cases(id),
  kind text not null check (kind in ('test_drive', 'delivery')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  starts_at timestamptz not null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_one_subject check (num_nonnulls(lead_id, case_id) = 1),
  constraint appointment_delivery_case check (kind <> 'delivery' or case_id is not null)
);

create index if not exists appointments_owner_start_idx on public.appointments(owner_id, starts_at);
create index if not exists appointments_scheduled_start_idx on public.appointments(starts_at)
  where status = 'scheduled';

create table if not exists public.appointment_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  appointment_starts_at timestamptz not null,
  offset_minutes integer not null check (offset_minutes in (4320, 1440, 240, 60)),
  due_at timestamptz not null,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (appointment_id, recipient_id, appointment_starts_at, offset_minutes)
);

create index if not exists appointment_alert_pending_idx
  on public.appointment_alert_deliveries(due_at) where sent_at is null;

create trigger touch_leads_updated_at before update on public.leads
for each row execute function public.touch_updated_at();
create trigger touch_appointments_updated_at before update on public.appointments
for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_events enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_alert_deliveries enable row level security;

create policy "leads read admin or owner" on public.leads for select to authenticated
using (deleted_at is null and (
  public.current_app_role() = 'admin'
  or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
));

create policy "leads insert admin or owner" on public.leads for insert to authenticated
with check (
  public.current_app_role() = 'admin'
  or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
);

create policy "leads update admin or owner" on public.leads for update to authenticated
using (
  public.current_app_role() = 'admin'
  or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
)
with check (
  public.current_app_role() = 'admin'
  or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
);

create policy "lead notes read admin or owner" on public.lead_notes for select to authenticated
using (exists (select 1 from public.leads where leads.id = lead_notes.lead_id));

create policy "lead notes insert admin or owner" on public.lead_notes for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.leads where leads.id = lead_notes.lead_id)
);

create policy "lead events read admin or owner" on public.lead_events for select to authenticated
using (exists (select 1 from public.leads where leads.id = lead_events.lead_id));

create policy "lead events insert admin or owner" on public.lead_events for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (select 1 from public.leads where leads.id = lead_events.lead_id)
);

create policy "appointments read admin or owner" on public.appointments for select to authenticated
using (
  public.current_app_role() = 'admin'
  or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
);

create policy "appointments insert admin or owner" on public.appointments for insert to authenticated
with check (
  (public.current_app_role() = 'admin'
    or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid())))
  and (lead_id is null or exists (
    select 1 from public.leads where leads.id = lead_id and leads.owner_id = appointments.owner_id
  ))
  and (case_id is null or exists (
    select 1 from public.cases where cases.id = case_id
      and cases.owner_id = appointments.owner_id and cases.deleted_at is null
  ))
);

create policy "appointments update admin or owner" on public.appointments for update to authenticated
using (
  public.current_app_role() = 'admin'
  or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid()))
)
with check (
  (public.current_app_role() = 'admin'
    or (public.current_app_role() in ('customer_service', 'broker') and owner_id = (select auth.uid())))
  and (lead_id is null or exists (
    select 1 from public.leads where leads.id = lead_id and leads.owner_id = appointments.owner_id
  ))
  and (case_id is null or exists (
    select 1 from public.cases where cases.id = case_id
      and cases.owner_id = appointments.owner_id and cases.deleted_at is null
  ))
);

grant select, insert, update on public.leads, public.appointments to authenticated;
grant select, insert on public.lead_notes to authenticated;
grant select, insert on public.lead_events to authenticated;

do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['leads', 'lead_notes', 'lead_events', 'appointments'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

select cron.schedule(
  'casepilot-appointment-alerts',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://kfyqyxiycvdknlcpjmts.supabase.co/functions/v1/appointment-alerts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
