begin;
-- Additive extension: existing property types and rows remain valid.
alter table public.properties drop constraint properties_property_type_check;
alter table public.properties add constraint properties_property_type_check
 check(property_type in ('apartment','house','office','retail','land','other','officetel'));
alter table public.properties drop constraint properties_status_check;
alter table public.properties add constraint properties_status_check check(status in ('available','reserved','closed','on_hold'));
alter table public.properties
 add column building_name text not null default '' check(length(building_name)<=200),
 add column floor integer check(floor between -20 and 300),
 add column total_floors integer check(total_floors between 1 and 300),
 add column premium numeric(16,0) not null default 0 check(premium>=0),
 add column business_type text not null default '' check(length(business_type)<=100),
 add column facilities text not null default '' check(length(facilities)<=5000),
 add column complex_name text not null default '' check(length(complex_name)<=200),
 add column building_dong text not null default '' check(length(building_dong)<=40),
 add column unit_number text not null default '' check(length(unit_number)<=40),
 add column room_count integer check(room_count between 0 and 100),
 add column last_confirmed_at timestamptz,
 add column deleted_at timestamptz,
 add column version integer not null default 1 check(version>0),
 add column search_text text generated always as (title||' '||building_name||' '||address||' '||complex_name) stored,
 add column normalized_address text generated always as (lower(regexp_replace(address,'[[:space:][:punct:]]','','g'))) stored,
 add constraint property_floor_order check(floor is null or total_floors is null or floor<=total_floors),
 add constraint property_safe_money check(price<=9000000000000000 and deposit<=9000000000000000 and premium<=9000000000000000);
create extension if not exists pg_trgm with schema extensions;
create index properties_search_idx on public.properties using gin(search_text extensions.gin_trgm_ops) where deleted_at is null;
create index properties_filters_idx on public.properties(office_id,status,property_type,transaction_type) where deleted_at is null;
create index properties_price_idx on public.properties(office_id,price) where deleted_at is null;
create index properties_area_idx on public.properties(office_id,area_m2) where deleted_at is null;
create index properties_floor_idx on public.properties(office_id,floor) where deleted_at is null;
create index properties_duplicates_idx on public.properties(office_id,normalized_address,floor) where deleted_at is null;
alter table public.property_images
 add column file_kind text not null default 'photo' check(file_kind in ('photo','floorplan')),
 add column original_name text not null default '' check(length(original_name)<=255),
 add column mime_type text check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf'));

create table public.property_change_history (
 id uuid primary key default gen_random_uuid(), office_id uuid not null,
 property_id uuid not null, actor_staff_id uuid,
 event text not null check(event in ('created','updated','deleted')),
 old_values jsonb, new_values jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(office_id,property_id) references public.properties(office_id,id) on delete restrict,
 foreign key(office_id,actor_staff_id) references public.staff(office_id,id),
 check(old_values is null or jsonb_typeof(old_values)='object'), check(jsonb_typeof(new_values)='object')
);
alter table public.property_change_history enable row level security;
revoke all on public.property_change_history from public,anon,authenticated;
grant select on public.property_change_history to authenticated;
grant all on public.property_change_history to service_role;
create policy office_history_read on public.property_change_history for select to authenticated
 using(office_id=(select private.office_id()) and exists(select 1 from public.properties p where p.id=property_id and p.office_id=property_change_history.office_id));
create index property_history_timeline_idx on public.property_change_history(office_id,property_id,created_at desc);
create index property_history_actor_idx on public.property_change_history(office_id,actor_staff_id);

-- Business mutations still run under the caller's RLS; only this audit INSERT is privileged.
create function private.record_property_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_values jsonb; after_values jsonb; kind text;
begin
 after_values=jsonb_build_object('price',new.price,'deposit',new.deposit,'premium',new.premium,'status',new.status,'assigned_staff_id',new.assigned_staff_id,'deleted_at',new.deleted_at);
 if tg_op='INSERT' then kind='created';
 else
 before_values=jsonb_build_object('price',old.price,'deposit',old.deposit,'premium',old.premium,'status',old.status,'assigned_staff_id',old.assigned_staff_id,'deleted_at',old.deleted_at);
 if before_values=after_values then return new; end if;
 kind=case when old.deleted_at is null and new.deleted_at is not null then 'deleted' else 'updated' end;
 end if;
 insert into public.property_change_history(office_id,property_id,actor_staff_id,event,old_values,new_values)
 values(new.office_id,new.id,private.staff_id(),kind,before_values,after_values);
 return new;
end $$;
revoke all on function private.record_property_change() from public,anon,authenticated;
create trigger property_audit after insert or update on public.properties for each row execute function private.record_property_change();
create or replace function private.guard_property_change() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
 if new.office_id<>old.office_id then raise exception 'office_id is immutable' using errcode='42501'; end if;
 if new.id<>old.id then raise exception 'Property id is immutable' using errcode='42501'; end if;
 new.version=old.version+1;
 if new.deleted_at is distinct from old.deleted_at then new.deleted_at=clock_timestamp(); end if;
 end if;
 if auth.uid() is not null and new.office_id is distinct from private.office_id() then raise exception 'Office mismatch' using errcode='42501'; end if;
 if not exists(select 1 from public.staff s where s.id=new.assigned_staff_id and s.office_id=new.office_id and s.active) then
 raise exception 'Active office staff required' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.guard_property_change() from public,anon,authenticated;
create trigger property_guard before insert or update on public.properties for each row execute function private.guard_property_change();
-- Tenant-scoped archive reads remain available for audit. App queries hide deleted rows.
-- Keeping tenant SELECT permits SECURITY INVOKER soft deletion without bypassing RLS.
-- Deleted rows cannot be edited or restored by normal clients.
alter policy tenant_read on public.properties using(office_id=(select private.office_id()));
alter policy assigned_insert on public.properties with check(office_id=(select private.office_id()) and deleted_at is null and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
alter policy assigned_update on public.properties using(office_id=(select private.office_id()) and deleted_at is null and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())))
 with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
revoke delete on public.properties from authenticated;
drop policy assigned_delete on public.properties;
create function public.soft_delete_property(p_id uuid,p_version integer) returns void
 language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 update public.properties set deleted_at=clock_timestamp() where id=p_id and version=p_version and deleted_at is null;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Not editable or stale property' using errcode='40001'; end if;
end $$;
revoke all on function public.soft_delete_property(uuid,integer) from public,anon;
grant execute on function public.soft_delete_property(uuid,integer) to authenticated;
create policy live_property_files on public.property_images as restrictive for all to authenticated
 using(exists(select 1 from public.properties p where p.id=property_id and p.office_id=property_images.office_id and p.deleted_at is null))
 with check(exists(select 1 from public.properties p where p.id=property_id and p.office_id=property_images.office_id and p.deleted_at is null));
-- A single policy protects photos and plans, including requests made directly to Storage.
create or replace function private.can_write_image(object_name text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties p join public.staff s on s.office_id=p.office_id
 where s.user_id=(select auth.uid()) and s.active and p.deleted_at is null
 and split_part(object_name,'/',1)=p.office_id::text and split_part(object_name,'/',2)=p.id::text
 and split_part(object_name,'/',3)<>'' and (s.role in ('owner','manager') or p.assigned_staff_id=s.id))
$$;
create function private.can_read_image(object_name text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.properties p join public.staff s on s.office_id=p.office_id
 where s.user_id=(select auth.uid()) and s.active and p.deleted_at is null
 and split_part(object_name,'/',1)=p.office_id::text and split_part(object_name,'/',2)=p.id::text and split_part(object_name,'/',3)<>'')
$$;
revoke all on function private.can_read_image(text) from public,anon;
grant execute on function private.can_read_image(text) to authenticated;
alter policy estatematch_image_read on storage.objects using(bucket_id='property-images' and private.can_read_image(name));
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'] where id='property-images';
commit;
