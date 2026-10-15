begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('contract-documents','contract-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function private.can_upload_contract_document(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.contracts c join public.staff s on s.office_id=c.office_id
 where s.user_id=auth.uid() and s.active and c.deleted_at is null
 and split_part(object_name,'/',1)=c.office_id::text and split_part(object_name,'/',2)=c.id::text
 and object_name~'^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
 and (s.role in ('owner','manager') or c.assigned_staff_id=s.id))
$$;
revoke all on function private.can_upload_contract_document(text) from public;
grant execute on function private.can_upload_contract_document(text) to authenticated;
-- Every authenticated content access is logged INSIDE Storage's SELECT policy.
-- Signing, public access, transforms, listings and metadata endpoints have no permission.
create function private.contract_document_access(object_name text,object_owner text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare d public.contract_documents;s public.staff;op text;
begin
 select * into s from public.staff where user_id=auth.uid() and active;
 if not found then return false;end if;
 op=storage.operation();
 if op='storage.object.get_authenticated' then
  select docs.* into d from public.contract_documents docs join public.contracts c on c.id=docs.contract_id and c.office_id=docs.office_id where docs.storage_path=object_name and docs.office_id=s.office_id and c.deleted_at is null;
  if not found then return false;end if;
  insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,new_values) values(d.office_id,d.contract_id,'document_download','계약 서류 다운로드 접근 승인',s.id,jsonb_build_object('document_id',d.id,'sha256',d.sha256));
  return true;
 end if;
 -- Only failed/unregistered uploads may be cleaned up by their creator. Registered originals are immutable.
 if op in ('storage.object.upload','storage.object.delete','storage.object.delete_many') then
  return object_owner=auth.uid()::text and private.can_upload_contract_document(object_name) and not exists(select 1 from public.contract_documents where storage_path=object_name);
 end if;
 return false;
end $$;
revoke all on function private.contract_document_access(text,text) from public;
grant execute on function private.contract_document_access(text,text) to authenticated;
create policy contract_storage_read on storage.objects for select to authenticated using(bucket_id='contract-documents' and private.contract_document_access(name,owner_id));
create policy contract_storage_insert on storage.objects for insert to authenticated with check(bucket_id='contract-documents' and storage.allow_only_operation('object.upload') and private.can_upload_contract_document(name));
create policy contract_storage_cleanup on storage.objects for delete to authenticated using(bucket_id='contract-documents' and owner_id=auth.uid()::text and private.can_upload_contract_document(name) and not exists(select 1 from public.contract_documents d where d.storage_path=name));
-- No storage UPDATE policy: upsert/replace/move of originals are denied.
create function private.guard_contract_document() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.staff;o storage.objects;
begin
 select * into s from public.staff where user_id=auth.uid() and active;
 if not found or s.office_id<>new.office_id or s.id<>new.uploaded_by then raise exception 'Uploader identity mismatch' using errcode='42501';end if;
 select * into o from storage.objects where bucket_id='contract-documents' and name=new.storage_path and owner_id=auth.uid()::text;
 if not found or (o.metadata->>'size')::bigint<>new.byte_size or o.metadata->>'mimetype'<>new.mime_type then raise exception 'Stored file metadata mismatch' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.guard_contract_document() from public;
create trigger document_guard before insert on public.contract_documents for each row execute function private.guard_contract_document();
create function private.audit_contract_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,new_values) values(new.office_id,new.contract_id,'document_uploaded','계약 서류 추가 · 원본 보존',private.staff_id(),jsonb_build_object('document_id',new.id,'sha256',new.sha256,'previous_document_id',new.previous_document_id,'document_type',new.document_type));return new;
end $$;
revoke all on function private.audit_contract_document() from public;
create trigger document_audit after insert on public.contract_documents for each row execute function private.audit_contract_document();
commit;
