begin;
-- Preserve existing IDs, assignments, matching fields and every old customer/consultation row.
alter table public.customers
 add column customer_kind text not null default 'individual' check(customer_kind in ('individual','company')),
 add column company_name text not null default '' check(length(company_name)<=200),
 add column contact_consent boolean,
 add column consent_recorded_at timestamptz,
 add column next_contact_at timestamptz,
 add column privacy_basis text not null default 'unrecorded' check(privacy_basis in ('unrecorded','consent','contract','legal_obligation','legitimate_interest','other')),
 add column privacy_basis_note text not null default '' check(length(privacy_basis_note)<=1000),
 add column processing_purpose text not null default '' check(length(processing_purpose)<=500),
 add column retention_until date,
 add column deleted_at timestamptz,
 add column version integer not null default 1 check(version>0),
 add column normalized_company_name text generated always as (lower(regexp_replace(trim(company_name),'[[:space:]]+',' ','g'))) stored,
 add column normalized_name text generated always as (lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))) stored,
 add column normalized_phone text generated always as (regexp_replace(coalesce(phone,''),'[^0-9]','','g')) stored,
 add column normalized_email text generated always as (lower(trim(coalesce(email,'')))) stored,
 add column search_text text generated always as (name||' '||company_name||' '||coalesce(phone,'')||' '||regexp_replace(coalesce(phone,''),'[^0-9]','','g')||' '||coalesce(email,'')) stored;
create index customers_search_idx on public.customers using gin(search_text extensions.gin_trgm_ops) where deleted_at is null;
create index customers_name_idx on public.customers(office_id,normalized_name) where deleted_at is null;
create index customers_company_name_idx on public.customers(office_id,normalized_company_name) where deleted_at is null;
create index customers_phone_idx on public.customers(office_id,normalized_phone) where deleted_at is null;
create index customers_email_idx on public.customers(office_id,normalized_email) where deleted_at is null;
create index customers_contact_idx on public.customers(office_id,next_contact_at) where deleted_at is null;
create index customers_retention_idx on public.customers(office_id,retention_until) where deleted_at is null;

create function private.guard_customer() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.id is distinct from old.id or new.office_id is distinct from old.office_id then raise exception 'Customer identity is immutable' using errcode='42501'; end if;
  if old.deleted_at is not null then raise exception 'Archived customer is read-only' using errcode='42501'; end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id and not private.is_manager() then raise exception 'Only managers may reassign' using errcode='42501'; end if;
  new.version=old.version+1;
  new.consent_recorded_at=case when new.contact_consent is distinct from old.contact_consent then clock_timestamp() else old.consent_recorded_at end;
  if new.deleted_at is not null then new.deleted_at=clock_timestamp(); end if;
 else
  if new.deleted_at is not null then raise exception 'Cannot create archived customer' using errcode='23514'; end if;
  new.version=1;
  new.consent_recorded_at=case when new.contact_consent is null then null else clock_timestamp() end;
 end if;
 if TG_OP='INSERT' or new.assigned_staff_id is distinct from old.assigned_staff_id then
  if not exists(select 1 from public.staff where id=new.assigned_staff_id and office_id=new.office_id and active) then raise exception 'Active office staff required' using errcode='23503'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_customer() from public;
create trigger customer_guard before insert or update on public.customers for each row execute function private.guard_customer();
-- Same office archival reads remain for audit and the future contract history; application routes hide deleted rows.
revoke delete on public.customers from authenticated;
drop policy assigned_delete on public.customers;
drop policy assigned_insert on public.customers;
create policy assigned_insert on public.customers for insert to authenticated with check(office_id=(select private.office_id()) and deleted_at is null and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
drop policy assigned_update on public.customers;
create policy assigned_update on public.customers for update to authenticated using(office_id=(select private.office_id()) and deleted_at is null and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));

alter table public.consultations add column contact_method text not null default 'other' check(contact_method in ('phone','visit','email','message','other'));
create index consultations_customer_time_idx on public.consultations(office_id,customer_id,consulted_at desc);
-- The original per-author policies still apply. Additional restrictive checks protect customer ownership and archives.
create policy customer_consultation_insert on public.consultations as restrictive for insert to authenticated with check(exists(select 1 from public.customers c where c.id=consultations.customer_id and c.office_id=consultations.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));
create policy customer_consultation_update on public.consultations as restrictive for update to authenticated using(exists(select 1 from public.customers c where c.id=consultations.customer_id and c.office_id=consultations.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id())))) with check(exists(select 1 from public.customers c where c.id=consultations.customer_id and c.office_id=consultations.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));
revoke delete on public.consultations from authenticated;
drop policy assigned_delete on public.consultations;
-- Derived links use the caller's existing consultation RLS, never a view owner's privileges.
create view public.customer_property_links with (security_invoker=true) as
 select distinct office_id,customer_id,property_id from public.consultations where property_id is not null;
revoke all on public.customer_property_links from public,anon,authenticated;
grant select on public.customer_property_links to authenticated;
-- No fixed customer role and no contract/party schema changes in this phase.
commit;
