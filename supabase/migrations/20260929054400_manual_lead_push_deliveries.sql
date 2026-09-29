create table public.manual_lead_push_deliveries (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.manual_lead_push_deliveries enable row level security;
revoke all on public.manual_lead_push_deliveries from anon, authenticated;
