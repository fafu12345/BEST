begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('property-images','property-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create function private.can_write_image(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties p join public.staff s on s.office_id=p.office_id
 where s.user_id=(select auth.uid()) and s.active
 and split_part(object_name,'/',1)=p.office_id::text
 and split_part(object_name,'/',2)=p.id::text
 and split_part(object_name,'/',3)<>''
 and (s.role in ('owner','manager') or p.assigned_staff_id=s.id))
$$;
revoke all on function private.can_write_image(text) from public;
grant execute on function private.can_write_image(text) to authenticated;
-- Supabase owns storage.objects and enables RLS. Bucket remains private.
create policy estatematch_image_read on storage.objects for select to authenticated
using(bucket_id='property-images' and split_part(name,'/',1)=(select private.office_id())::text);
create policy estatematch_image_insert on storage.objects for insert to authenticated
with check(bucket_id='property-images' and private.can_write_image(name));
create policy estatematch_image_update on storage.objects for update to authenticated
using(bucket_id='property-images' and private.can_write_image(name))
with check(bucket_id='property-images' and private.can_write_image(name));
create policy estatematch_image_delete on storage.objects for delete to authenticated
using(bucket_id='property-images' and private.can_write_image(name));
commit;
