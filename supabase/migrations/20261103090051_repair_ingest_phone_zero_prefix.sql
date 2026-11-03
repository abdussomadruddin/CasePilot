-- Repair only redundant trunk zeroes; retain Malaysian mobile length validation.
create or replace function public.normalize_lead_phone(value text) returns text language sql immutable set search_path='' as $$
 select case when phone ~ '^601[0-9]{8,9}$' then phone end from (
  select case when digits like '60%' then '60'||regexp_replace(substr(digits,3),'^0+','')
   when digits like '0%' then '60'||regexp_replace(digits,'^0+','')
   when digits like '1%' then '60'||digits else digits end phone
  from (select case when raw like '0060%' then substr(raw,3) else raw end digits
   from (select regexp_replace(coalesce(value,''),'[^0-9]','','g') raw) r) s
 ) n;
$$;
-- Expression index must be rebuilt when its immutable normalizer changes.
reindex index public.leads_normalized_phone_active;
