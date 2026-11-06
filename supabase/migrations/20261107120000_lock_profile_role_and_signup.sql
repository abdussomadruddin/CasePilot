-- Self-service signups must never choose a role or get access.
-- Team members are created by the service role, which then sets role and active.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'phone',
    'customer_service'::public.app_role,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Users may edit their own name, but role and active are Admin-only.
-- Service role and SQL sessions have no auth.uid() and stay allowed.
create or replace function public.protect_profile_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and (new.role is distinct from old.role or new.active is distinct from old.active)
    and public.current_app_role() is distinct from 'admin'::public.app_role then
    raise exception 'Only an admin can change role or active status.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_access on public.profiles;
create trigger protect_profile_access
before update on public.profiles
for each row execute function public.protect_profile_access();
