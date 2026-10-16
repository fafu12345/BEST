begin;
alter table public.properties
 add column remarks text not null default '' check(length(remarks)<=2000),
 add column owner_name text not null default '' check(length(owner_name)<=100),
 add column owner_phone text not null default '' check(length(owner_phone)<=40 and owner_phone ~ '^[0-9+()[:space:]-]*$');
alter table public.property_buildings
 add column address text not null default '' check(length(address)<=500),
 add column total_floors integer check(total_floors between 1 and 300);
grant update(address,total_floors) on public.property_buildings to authenticated;
create policy building_metadata_update on public.property_buildings for update to authenticated using(office_id=private.office_id() and private.is_manager()) with check(office_id=private.office_id() and private.is_manager());
alter table public.property_contacts add column relationship text not null default 'other' check(relationship in ('landlord','tenant','seller','buyer','resident','other'));
grant update(relationship) on public.property_contacts to authenticated;
create function public.save_property_contact_v2(p_property uuid,p_name text,p_phone text,p_phone2 text,p_access_code text,p_contact uuid default null,p_version integer default null,p_customer_version integer default null,p_relationship text default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if p_relationship is not null and p_relationship not in ('landlord','tenant','seller','buyer','resident','other') then raise exception 'Invalid relationship' using errcode='23514';end if;
 result=public.save_property_contact(p_property,p_name,p_phone,p_phone2,p_access_code,p_contact,p_version,p_customer_version);
 if p_relationship is not null then update public.property_contacts set relationship=p_relationship where id=result and relationship<>p_relationship;end if;
 return result;
end$$;
revoke all on function public.save_property_contact_v2(uuid,text,text,text,text,uuid,integer,integer,text) from public,anon;
grant execute on function public.save_property_contact_v2(uuid,text,text,text,text,uuid,integer,integer,text) to authenticated;
-- Soft deletion retains contracts, parties, documents, receipts and renewal links.
create or replace function private.guard_contract() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.office_id::text||':'||new.property_id::text,0));
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.office_id<>old.office_id or new.property_id<>old.property_id or new.previous_contract_id is distinct from old.previous_contract_id then raise exception 'Contract identity/property/origin is immutable' using errcode='42501'; end if;
  if old.deleted_at is not null then raise exception 'Archived contract is immutable' using errcode='42501'; end if;
  if new.assigned_staff_id<>old.assigned_staff_id and not private.is_manager() then raise exception 'Manager reassignment required' using errcode='42501'; end if;
  new.version=old.version+1;
  if new.contract_date is distinct from old.contract_date then new.signed_at=new.contract_date; elsif new.signed_at is distinct from old.signed_at then new.contract_date=new.signed_at; end if;
  if new.status is distinct from old.status and new.status in ('signed','active','completed','terminated','cancelled') then new.property_review_required=true; end if;
  if new.deleted_at is not null then
   if (to_jsonb(new)-'deleted_at'-'updated_at'-'version') is distinct from (to_jsonb(old)-'deleted_at'-'updated_at'-'version') then raise exception 'Archive separately from other edits' using errcode='23514';end if;
   new.deleted_at=clock_timestamp();return new;
  end if;
 else
  new.version=1;new.contract_date=coalesce(new.contract_date,new.signed_at);new.signed_at=coalesce(new.contract_date,new.signed_at);
  if new.deleted_at is not null then raise exception 'Cannot create archived contract' using errcode='23514'; end if;
  new.property_review_required=new.status in ('signed','active');
 end if;
 if TG_OP='INSERT' or new.assigned_staff_id is distinct from old.assigned_staff_id then
  if not exists(select 1 from public.staff s where s.id=new.assigned_staff_id and s.office_id=new.office_id and s.active) then raise exception 'Active office assignee required' using errcode='23503'; end if;
 end if;
 if TG_OP='INSERT' then
  if not exists(select 1 from public.properties p where p.id=new.property_id and p.office_id=new.office_id and p.deleted_at is null) then raise exception 'Active office property required' using errcode='23503'; end if;
 end if;
 if new.previous_contract_id is not null and exists(
  with recursive chain as (
   select c.id,c.previous_contract_id,array[c.id] as seen,false as cycle from public.contracts c where c.id=new.previous_contract_id and c.office_id=new.office_id and c.property_id=new.property_id
   union all select c.id,c.previous_contract_id,a.seen||c.id,c.id=any(a.seen) from public.contracts c join chain a on c.id=a.previous_contract_id where c.office_id=new.office_id and c.property_id=new.property_id and not a.cycle
  ) select 1 from chain where id=new.id or previous_contract_id=new.id or cycle
 ) then raise exception 'Renewal origin cycle forbidden' using errcode='23514';end if;
 if new.contract_type is not null then
  if new.sale_price_krw is null or new.deposit_krw is null or new.rent_krw is null or new.maintenance_fee_krw is null or new.brokerage_fee_krw is null then raise exception 'Explicit contract amounts required' using errcode='23514'; end if;
  if new.contract_type='sale' then new.amount=new.sale_price_krw; else new.amount=new.deposit_krw; end if;
  if new.contract_type='sale' and (new.deposit_krw<>0 or new.rent_krw<>0) or new.contract_type='jeonse' and (new.sale_price_krw<>0 or new.rent_krw<>0) or new.contract_type='monthly_rent' and new.sale_price_krw<>0 then raise exception 'Amounts do not match contract type' using errcode='23514'; end if;
  if new.status in ('signed','active','completed','terminated') and new.contract_date is null then raise exception 'Contract date required' using errcode='23514'; end if;
  if new.contract_type<>'sale' and new.status in ('signed','active','completed','terminated') and (new.lease_start_date is null or new.lease_end_date is null) then raise exception 'Lease dates required' using errcode='23514'; end if;
  if new.status in ('signed','active') and private.contract_overlaps(new.office_id,new.property_id,new.id,coalesce(new.lease_start_date,new.occupancy_start_date,new.contract_date),coalesce(new.lease_end_date,new.closing_date+1)) and length(trim(new.overlap_override_reason))<5 then raise exception 'OVERLAP: period overlap requires an exception reason' using errcode='23514'; end if;
 end if;
 return new;
end $$;

create function private.archive_contract_tasks() returns trigger language plpgsql security definer set search_path='' as $$declare sid uuid;begin
 if old.deleted_at is null and new.deleted_at is not null then
 update public.expiration_tasks set status='cancelled' where contract_id=new.id and office_id=new.office_id and status in ('pending','in_progress');
 end if;return new;
end$$;
revoke all on function private.archive_contract_tasks() from public,anon,authenticated,service_role;
create trigger archived_contract_tasks after update of deleted_at on public.contracts for each row execute function private.archive_contract_tasks();
-- The UPDATE uses existing office/manager RLS; the guard restricts the new column grants.
alter table public.staff add column deleted_at timestamptz,add constraint archived_staff_inactive check(deleted_at is null or not active);
grant update(active,deleted_at) on public.staff to authenticated;
create function private.guard_staff_archive() returns trigger language plpgsql set search_path='' as $$
declare actor public.staff;
begin
 if auth.uid() is null or current_user='postgres' then return new;end if;
 if old.deleted_at is not null then raise exception 'Archived staff immutable' using errcode='42501';end if;
 if new.active is distinct from old.active or new.deleted_at is distinct from old.deleted_at then
 select * into actor from public.staff where id=private.staff_id() and active;
 if actor.id is null or actor.office_id<>old.office_id or actor.role not in ('owner','manager') or actor.id=old.id or old.role='owner' or (actor.role='manager' and old.role<>'agent') then raise exception 'Staff deletion denied' using errcode='42501';end if;
 if new.active or new.deleted_at is null then raise exception 'Use soft deletion; cannot reactivate from client' using errcode='42501';end if;
 new.deleted_at=clock_timestamp();
 end if;
 return new;
end$$;
revoke all on function private.guard_staff_archive() from public;
create trigger staff_archive_guard before update on public.staff for each row execute function private.guard_staff_archive();
create function private.record_business_archive() returns trigger language plpgsql security definer set search_path='' as $$declare sid uuid;begin
 if old.deleted_at is null and new.deleted_at is not null then
 sid=private.staff_id();if private.office_id() is distinct from new.office_id then sid=null;end if;
 insert into public.access_audit_events(office_id,actor_id,action,entity_id) values(new.office_id,sid,case when TG_TABLE_NAME='staff' then 'staff_archived' else 'contract_archived' end,new.id);
 end if;return new;
end$$;
revoke all on function private.record_business_archive() from public,anon,authenticated,service_role;
create trigger staff_archive_audit after update of deleted_at on public.staff for each row execute function private.record_business_archive();
create trigger contract_archive_audit after update of deleted_at on public.contracts for each row execute function private.record_business_archive();
commit;
