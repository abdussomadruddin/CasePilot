drop index if exists public.leads_external_source_id_unique;

create index if not exists leads_external_source_id_idx
  on public.leads(source, source_lead_id)
  where source_lead_id is not null and source <> 'manual_upload';
