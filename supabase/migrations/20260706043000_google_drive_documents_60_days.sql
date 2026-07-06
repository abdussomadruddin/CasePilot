create or replace function public.set_case_document_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is null then
    new.expires_at = new.uploaded_at + interval '60 days';
  end if;

  return new;
end;
$$;

update public.case_documents
set expires_at = uploaded_at + interval '60 days'
where deleted_at is null
and (
  expires_at is null
  or expires_at < uploaded_at + interval '60 days'
);

create index if not exists case_documents_storage_path_idx
on public.case_documents(storage_path);
