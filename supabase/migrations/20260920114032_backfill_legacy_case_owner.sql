update public.cases
set owner_id = (
  select id
  from public.profiles
  where role = 'customer_service'
    and active = true
  order by created_at
  limit 1
)
where owner_id is null
  and exists (
    select 1
    from public.profiles
    where role = 'customer_service'
      and active = true
  );
