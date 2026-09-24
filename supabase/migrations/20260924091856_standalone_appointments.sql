alter table public.appointments
  add column customer_name text,
  add column customer_phone text;

alter table public.appointments drop constraint appointment_one_subject;
alter table public.appointments drop constraint appointment_delivery_case;

alter table public.appointments
  add constraint appointment_subject_or_contact check (
    num_nonnulls(lead_id, case_id) = 1
    or (lead_id is null and case_id is null
      and nullif(btrim(customer_name), '') is not null
      and nullif(btrim(customer_phone), '') is not null)
  );
