begin;
-- Existing contracts, legacy amount/signed_at/customer_id and existing identifiers are retained.
alter table public.contracts drop constraint contracts_status_check;
alter table public.contracts add constraint contracts_status_check check(status in ('draft','signed','active','completed','terminated','cancelled'));
alter table public.contracts
 add column contract_type text check(contract_type in ('sale','jeonse','monthly_rent')),
 add column contract_date date,
 add column occupancy_start_date date,
 add column lease_start_date date,
 add column lease_end_date date,
 add column closing_date date,
 add column sale_price_krw numeric(16,0) check(sale_price_krw between 0 and 9000000000000000),
 add column deposit_krw numeric(16,0) check(deposit_krw between 0 and 9000000000000000),
 add column rent_krw numeric(16,0) check(rent_krw between 0 and 9000000000000000),
 add column maintenance_fee_krw numeric(16,0) check(maintenance_fee_krw between 0 and 9000000000000000),
 add column brokerage_fee_krw numeric(16,0) check(brokerage_fee_krw between 0 and 9000000000000000),
 add column previous_contract_id uuid,
 add column overlap_override_reason text not null default '' check(length(overlap_override_reason)<=1000),
 add column property_review_required boolean not null default false,
 add column deleted_at timestamptz,
 add column version integer not null default 1 check(version>0),
 add constraint contract_lease_order check(lease_start_date is null or lease_end_date is null or lease_start_date<lease_end_date),
 add constraint contract_closing_order check(contract_date is null or closing_date is null or contract_date<=closing_date),
 add constraint contract_previous_self check(previous_contract_id is null or previous_contract_id<>id),
 add constraint contracts_office_property_id_key unique(office_id,property_id,id),
 add constraint contract_previous_fk foreign key(office_id,property_id,previous_contract_id) references public.contracts(office_id,property_id,id);
create index contracts_property_timeline_idx on public.contracts(office_id,property_id,created_at desc);
create index contracts_dates_idx on public.contracts(office_id,status,lease_end_date,closing_date) where deleted_at is null;
create index contracts_previous_idx on public.contracts(office_id,previous_contract_id);
create index contracts_search_idx on public.contracts using gin(contract_number extensions.gin_trgm_ops) where deleted_at is null;

create table public.contract_parties(
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id),contract_id uuid not null,customer_id uuid not null,
 role text not null check(role in ('landlord','tenant','seller','buyer','other')),
 name_snapshot text not null default '', company_name_snapshot text not null default '',created_at timestamptz not null default now(),
 foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,customer_id) references public.customers(office_id,id),
 unique(office_id,contract_id,customer_id,role),unique(office_id,id)
);
create table public.contract_events(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),contract_id uuid not null,
 event_type text not null,event_date timestamptz not null default clock_timestamp(),description text not null default '',actor_id uuid,
 old_values jsonb,new_values jsonb,created_at timestamptz not null default clock_timestamp(),
 foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,actor_id) references public.staff(office_id,id),unique(office_id,id)
);
create table public.contract_documents(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),contract_id uuid not null,
 storage_path text not null unique,document_type text not null check(document_type in ('contract','identification','receipt','other')),
 uploaded_by uuid not null,original_name text not null check(length(original_name) between 1 and 255),mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 10485760),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),previous_document_id uuid,created_at timestamptz not null default now(),
 foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,uploaded_by) references public.staff(office_id,id),
 unique(office_id,contract_id,id),foreign key(office_id,contract_id,previous_document_id) references public.contract_documents(office_id,contract_id,id),
 check(previous_document_id is null or previous_document_id<>id),check(storage_path like office_id::text||'/'||contract_id::text||'/%')
);
create index contract_parties_customer_idx on public.contract_parties(office_id,customer_id,contract_id);
create index contract_events_timeline_idx on public.contract_events(office_id,contract_id,event_date desc);
create index contract_events_actor_idx on public.contract_events(office_id,actor_id);
create index contract_documents_timeline_idx on public.contract_documents(office_id,contract_id,created_at desc);
create index contract_documents_uploader_idx on public.contract_documents(office_id,uploaded_by);
create index contract_documents_previous_idx on public.contract_documents(office_id,contract_id,previous_document_id);

alter table public.contract_parties enable row level security;
alter table public.contract_events enable row level security;
alter table public.contract_documents enable row level security;
revoke all on public.contract_parties,public.contract_events,public.contract_documents from public,anon,authenticated;
grant all on public.contract_parties,public.contract_events,public.contract_documents to service_role;
grant select,insert,delete on public.contract_parties to authenticated;
grant select on public.contract_events to authenticated;
grant select,insert on public.contract_documents to authenticated;
create policy parties_read on public.contract_parties for select to authenticated using(office_id=(select private.office_id()));
create policy parties_insert on public.contract_parties for insert to authenticated with check(office_id=(select private.office_id()) and exists(select 1 from public.contracts c where c.id=contract_id and c.office_id=contract_parties.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));
create policy parties_delete on public.contract_parties for delete to authenticated using(office_id=(select private.office_id()) and exists(select 1 from public.contracts c where c.id=contract_id and c.office_id=contract_parties.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));
create policy events_read on public.contract_events for select to authenticated using(office_id=(select private.office_id()));
create policy documents_read on public.contract_documents for select to authenticated using(office_id=(select private.office_id()));
create policy documents_insert on public.contract_documents for insert to authenticated with check(office_id=(select private.office_id()) and uploaded_by=(select private.staff_id()) and exists(select 1 from public.contracts c where c.id=contract_id and c.office_id=contract_documents.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));
revoke delete on public.contracts from authenticated;
drop policy assigned_delete on public.contracts;
drop policy assigned_insert on public.contracts;
create policy assigned_insert on public.contracts for insert to authenticated with check(office_id=(select private.office_id()) and deleted_at is null and contract_type is not null and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
drop policy assigned_update on public.contracts;
create policy assigned_update on public.contracts for update to authenticated using(office_id=(select private.office_id()) and deleted_at is null and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));

create function private.contract_overlaps(p_office uuid,p_property uuid,p_id uuid,p_start date,p_end date) returns boolean language sql volatile security invoker set search_path='' as $$
 select exists(select 1 from public.contracts c where c.office_id=p_office and c.property_id=p_property and c.id<>p_id and c.deleted_at is null and c.status in ('signed','active')
 and coalesce(c.lease_start_date,c.occupancy_start_date,c.contract_date,c.signed_at,'-infinity'::date)<coalesce(p_end,'infinity'::date)
 and coalesce(p_start,'-infinity'::date)<coalesce(c.lease_end_date,c.closing_date+1,'infinity'::date))
$$;
revoke all on function private.contract_overlaps(uuid,uuid,uuid,date,date) from public;
grant execute on function private.contract_overlaps(uuid,uuid,uuid,date,date) to authenticated;
create function private.guard_contract() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.office_id::text||':'||new.property_id::text,0));
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.office_id<>old.office_id or new.property_id<>old.property_id or new.previous_contract_id is distinct from old.previous_contract_id then raise exception 'Contract identity/property/origin is immutable' using errcode='42501'; end if;
  if old.deleted_at is not null then raise exception 'Archived contract is immutable' using errcode='42501'; end if;
  if new.assigned_staff_id<>old.assigned_staff_id and not private.is_manager() then raise exception 'Manager reassignment required' using errcode='42501'; end if;
  new.version=old.version+1;
  if new.contract_date is distinct from old.contract_date then new.signed_at=new.contract_date; elsif new.signed_at is distinct from old.signed_at then new.contract_date=new.signed_at; end if;
  if new.status is distinct from old.status and new.status in ('signed','active','completed','terminated','cancelled') then new.property_review_required=true; end if;
  if new.deleted_at is not null and old.status not in ('draft','cancelled') then raise exception 'End contracts by status, not deletion' using errcode='23514'; end if;
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
revoke all on function private.guard_contract() from public;
create trigger contract_guard before insert or update on public.contracts for each row execute function private.guard_contract();

create function private.contract_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare before_value jsonb;after_value jsonb;
begin
 after_value=to_jsonb(new)-'updated_at'-'version';
 if TG_OP='UPDATE' then before_value=to_jsonb(old)-'updated_at'-'version'; if before_value=after_value then return new; end if; end if;
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,old_values,new_values) values(new.office_id,new.id,case when TG_OP='INSERT' then 'created' when old.property_review_required and not new.property_review_required then 'property_reviewed' else 'updated' end,'계약 정보 변경',private.staff_id(),before_value,after_value);
 return new;
end $$;
revoke all on function private.contract_audit() from public;
create trigger contract_audit after insert or update on public.contracts for each row execute function private.contract_audit();
create function private.guard_contract_party() returns trigger language plpgsql set search_path='' as $$
begin
 select name,company_name into new.name_snapshot,new.company_name_snapshot from public.customers c where c.id=new.customer_id and c.office_id=new.office_id and c.deleted_at is null;
 if not found then raise exception 'Active office customer required' using errcode='23503'; end if;
 return new;
end $$;
revoke all on function private.guard_contract_party() from public;
create trigger party_guard before insert on public.contract_parties for each row execute function private.guard_contract_party();
create function private.party_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare v public.contract_parties;
begin
 if TG_OP='DELETE' then v=old; else v=new; end if;
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,old_values,new_values) values(v.office_id,v.contract_id,case when TG_OP='DELETE' then 'party_removed' else 'party_added' end,'계약 당사자 변경',private.staff_id(),case when TG_OP='DELETE' then to_jsonb(old) else null end,case when TG_OP='INSERT' then to_jsonb(new) else null end);
 return coalesce(new,old);
end $$;
revoke all on function private.party_audit() from public;
create trigger party_audit after insert or delete on public.contract_parties for each row execute function private.party_audit();
create function private.lock_contract_party() returns trigger language plpgsql set search_path='' as $$
declare cid uuid;
begin
 cid=case when TG_OP='DELETE' then old.contract_id else new.contract_id end;
 perform 1 from public.contracts where id=cid and deleted_at is null for update;
 if not found then raise exception 'Contract unavailable' using errcode='42501';end if;
 update public.contracts set updated_at=clock_timestamp() where id=cid;
 if not found then raise exception 'Contract edit denied' using errcode='42501';end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
revoke all on function private.lock_contract_party() from public;
create trigger a_party_lock before insert or delete on public.contract_parties for each row execute function private.lock_contract_party();
create function private.validate_contract_parties() returns trigger language plpgsql set search_path='' as $$
declare cid uuid; v public.contracts; left_role text; right_role text;
begin
 if TG_TABLE_NAME='contracts' then cid=new.id; elsif TG_OP='DELETE' then cid=old.contract_id;else cid=new.contract_id;end if;
 select * into v from public.contracts where id=cid;
 if not found or v.contract_type is null then return null;end if;
 if not exists(select 1 from public.contract_parties where contract_id=cid and customer_id=v.customer_id) then raise exception 'Primary legacy customer must be a contract party' using errcode='23514';end if;
 if v.status in ('draft','cancelled') then return null;end if;
 if v.contract_type='sale' then left_role='seller';right_role='buyer';else left_role='landlord';right_role='tenant';end if;
 if not exists(select 1 from public.contract_parties where contract_id=cid and role=left_role) or not exists(select 1 from public.contract_parties where contract_id=cid and role=right_role) then raise exception 'Required contract party roles missing' using errcode='23514';end if;
 if exists(select 1 from public.contract_parties a join public.contract_parties b on a.contract_id=b.contract_id and a.customer_id=b.customer_id where a.contract_id=cid and a.role=left_role and b.role=right_role) then raise exception 'Opposing party must be a different customer' using errcode='23514';end if;
 return null;
end $$;
revoke all on function private.validate_contract_parties() from public;
create constraint trigger contract_roles after insert or update on public.contracts deferrable initially deferred for each row execute function private.validate_contract_parties();
create constraint trigger party_roles after insert or delete on public.contract_parties deferrable initially deferred for each row execute function private.validate_contract_parties();

-- All business mutations run under the user's RLS in one transaction.
create function public.save_contract(p_id uuid,p_version integer,p_data jsonb,p_parties jsonb,p_property_status text default null,p_property_version integer default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare cid uuid;v public.contracts;sid uuid;oid uuid;primary_customer uuid;
begin
 sid=private.staff_id();oid=private.office_id();if sid is null then raise exception 'Membership required' using errcode='42501';end if;
 if jsonb_typeof(p_parties)<>'array' or jsonb_array_length(p_parties)<1 or jsonb_array_length(p_parties)>30 then raise exception '1..30 parties required' using errcode='23514';end if;
 select (x->>'customer_id')::uuid into primary_customer from jsonb_array_elements(p_parties) x order by case when x->>'role' in ('buyer','tenant') then 0 else 1 end limit 1;
 if p_id is null then
  insert into public.contracts(office_id,property_id,assigned_staff_id,customer_id,contract_number,amount,contract_type,status,contract_date,occupancy_start_date,lease_start_date,lease_end_date,closing_date,sale_price_krw,deposit_krw,rent_krw,maintenance_fee_krw,brokerage_fee_krw,previous_contract_id,overlap_override_reason,notes)
  values(oid,(p_data->>'property_id')::uuid,coalesce((p_data->>'assigned_staff_id')::uuid,sid),primary_customer,coalesce(nullif(p_data->>'contract_number',''),'EM-'||gen_random_uuid()::text),0,p_data->>'contract_type',p_data->>'status',(p_data->>'contract_date')::date,(p_data->>'occupancy_start_date')::date,(p_data->>'lease_start_date')::date,(p_data->>'lease_end_date')::date,(p_data->>'closing_date')::date,(p_data->>'sale_price_krw')::numeric,(p_data->>'deposit_krw')::numeric,(p_data->>'rent_krw')::numeric,(p_data->>'maintenance_fee_krw')::numeric,(p_data->>'brokerage_fee_krw')::numeric,(p_data->>'previous_contract_id')::uuid,coalesce(p_data->>'overlap_override_reason',''),coalesce(p_data->>'notes','')) returning id into cid;
 else
  select * into v from public.contracts where id=p_id and deleted_at is null for update;
  if not found or v.version<>p_version then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
  if p_data->>'property_id'<>v.property_id::text or (p_data->>'previous_contract_id')::uuid is distinct from v.previous_contract_id then raise exception 'Contract origin is immutable' using errcode='42501';end if;
  update public.contracts set assigned_staff_id=coalesce((p_data->>'assigned_staff_id')::uuid,v.assigned_staff_id),customer_id=primary_customer,contract_number=coalesce(nullif(p_data->>'contract_number',''),v.contract_number),contract_type=p_data->>'contract_type',status=p_data->>'status',contract_date=(p_data->>'contract_date')::date,occupancy_start_date=(p_data->>'occupancy_start_date')::date,lease_start_date=(p_data->>'lease_start_date')::date,lease_end_date=(p_data->>'lease_end_date')::date,closing_date=(p_data->>'closing_date')::date,sale_price_krw=(p_data->>'sale_price_krw')::numeric,deposit_krw=(p_data->>'deposit_krw')::numeric,rent_krw=(p_data->>'rent_krw')::numeric,maintenance_fee_krw=(p_data->>'maintenance_fee_krw')::numeric,brokerage_fee_krw=(p_data->>'brokerage_fee_krw')::numeric,overlap_override_reason=coalesce(p_data->>'overlap_override_reason',''),notes=coalesce(p_data->>'notes','') where id=p_id returning id into cid;
  if cid is null then raise exception 'Contract edit denied' using errcode='42501';end if;
 end if;
 delete from public.contract_parties cp where cp.contract_id=cid and not exists(select 1 from jsonb_array_elements(p_parties) x where (x->>'customer_id')::uuid=cp.customer_id and x->>'role'=cp.role);
 insert into public.contract_parties(office_id,contract_id,customer_id,role) select oid,cid,(x->>'customer_id')::uuid,x->>'role' from jsonb_array_elements(p_parties) x where not exists(select 1 from public.contract_parties cp where cp.contract_id=cid and cp.customer_id=(x->>'customer_id')::uuid and cp.role=x->>'role');
 if p_property_status is not null then
  if p_property_status not in ('available','reserved','closed','on_hold') then raise exception 'Invalid property status' using errcode='23514';end if;
  select * into v from public.contracts where id=cid;
  update public.properties set status=p_property_status where id=v.property_id and version=p_property_version and deleted_at is null;
  if not found then raise exception 'PROPERTY_VERSION_OR_PERMISSION' using errcode='40001';end if;
  update public.contracts set property_review_required=false where id=cid;
 end if;
 return cid;
end $$;
-- Review events are emitted by the audit trigger; callers have no event write privilege.
revoke all on function public.save_contract(uuid,integer,jsonb,jsonb,text,integer) from public;
grant execute on function public.save_contract(uuid,integer,jsonb,jsonb,text,integer) to authenticated;
-- Caller-scoped directory avoids truncating customers with many contracts and searches legacy dates too.
create view public.contract_directory with (security_invoker=true) as
 select c.*,jsonb_build_object('title',p.title,'deleted_at',p.deleted_at) as properties,
 coalesce(c.contract_date,c.signed_at) as effective_contract_date,
 c.contract_number||' '||p.title||' '||coalesce(customer.name,'')||' '||coalesce(customer.company_name,'')||' '||coalesce((select string_agg(cp.name_snapshot||' '||cp.company_name_snapshot||' '||coalesce(pc.name,'')||' '||coalesce(pc.company_name,''),' ') from public.contract_parties cp left join public.customers pc on pc.id=cp.customer_id and pc.office_id=cp.office_id where cp.contract_id=c.id and cp.office_id=c.office_id),'') as search_text,
 array(select cp.customer_id from public.contract_parties cp where cp.contract_id=c.id and cp.office_id=c.office_id union select c.customer_id) as customer_ids
 from public.contracts c join public.properties p on p.id=c.property_id and p.office_id=c.office_id left join public.customers customer on customer.id=c.customer_id and customer.office_id=c.office_id;
revoke all on public.contract_directory from public,anon,authenticated;
grant select on public.contract_directory to authenticated;
commit;
