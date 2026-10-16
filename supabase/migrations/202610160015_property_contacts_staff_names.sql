begin;
-- Keep customer IDs/history. A phone-only customer is valid; no invented name.
alter table public.customers drop constraint customers_name_check;
alter table public.customers add constraint customers_name_check check(length(trim(name))<=100 and (length(trim(name))>0 or length(regexp_replace(coalesce(phone,''),'[^0-9]','','g'))>=7));
alter table public.customers add column phone2 text not null default '' check(length(phone2)<=40 and phone2 ~ '^[0-9+()[:space:]-]*$');
create table public.property_contacts (
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),
 property_id uuid not null,customer_id uuid not null,access_code text not null default '' check(length(access_code)<=100),
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(office_id,property_id) references public.properties(office_id,id) on delete cascade,
 foreign key(office_id,customer_id) references public.customers(office_id,id) on delete restrict,
 unique(office_id,property_id,customer_id)
);
create index property_contacts_customer_idx on public.property_contacts(office_id,customer_id);
alter table public.property_contacts enable row level security;
revoke all on public.property_contacts from public,anon,authenticated;
grant select,insert,delete on public.property_contacts to authenticated;
grant update(access_code) on public.property_contacts to authenticated;
grant all on public.property_contacts to service_role;
create policy office_read on public.property_contacts for select to authenticated using(office_id=(select private.office_id()));
create policy contact_insert on public.property_contacts for insert to authenticated with check(office_id=(select private.office_id()) and exists(select 1 from public.properties p where p.id=property_id and p.office_id=property_contacts.office_id and p.deleted_at is null and (private.is_manager() or p.assigned_staff_id=private.staff_id())) and exists(select 1 from public.customers c where c.id=customer_id and c.office_id=property_contacts.office_id and c.deleted_at is null));
create policy contact_update on public.property_contacts for update to authenticated using(office_id=(select private.office_id()) and exists(select 1 from public.properties p where p.id=property_id and p.office_id=property_contacts.office_id and p.deleted_at is null and (private.is_manager() or p.assigned_staff_id=private.staff_id()))) with check(office_id=(select private.office_id()));
create policy contact_delete on public.property_contacts for delete to authenticated using(office_id=(select private.office_id()) and exists(select 1 from public.properties p where p.id=property_id and p.office_id=property_contacts.office_id and p.deleted_at is null and (private.is_manager() or p.assigned_staff_id=private.staff_id())));
create function private.contact_version() returns trigger language plpgsql set search_path='' as $$begin new.version=old.version+1;return new;end$$;
revoke all on function private.contact_version() from public;
create trigger contact_version before update on public.property_contacts for each row execute function private.contact_version();
create trigger updated_at before update on public.property_contacts for each row execute function private.touch_updated_at();
-- Invoker keeps the existing property/customer RLS in force. All changes are atomic.
create function public.save_property_contact(p_property uuid,p_name text,p_phone text,p_phone2 text,p_access_code text,p_contact uuid default null,p_version integer default null,p_customer_version integer default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.properties; link public.property_contacts; c public.customers; result uuid;
begin
 select * into p from public.properties where id=p_property and deleted_at is null for update;
 if p.id is null or not(private.is_manager() or p.assigned_staff_id=private.staff_id()) then raise exception 'Property edit denied' using errcode='42501';end if;
 if p_phone is null or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 20 or length(p_phone)>40 or p_phone !~ '^[0-9+()[:space:]-]*$' or p_name is null or length(p_name)>100 or p_phone2 is null or length(p_phone2)>40 or p_phone2 !~ '^[0-9+()[:space:]-]*$' or p_access_code is null or length(p_access_code)>100 then raise exception 'Invalid contact input' using errcode='23514';end if;
 if p_contact is null then
  insert into public.customers(office_id,assigned_staff_id,name,phone,phone2) values(p.office_id,p.assigned_staff_id,trim(p_name),trim(p_phone),trim(p_phone2)) returning id into result;
  insert into public.property_contacts(office_id,property_id,customer_id,access_code) values(p.office_id,p.id,result,p_access_code) returning id into result;
 else
  select * into link from public.property_contacts where id=p_contact and property_id=p.id for update;
  if link.id is null or link.version is distinct from p_version then raise exception 'Contact changed' using errcode='40001';end if;
  select * into c from public.customers where id=link.customer_id and deleted_at is null for update;
  if c.id is null or c.version is distinct from p_customer_version or not(private.is_manager() or c.assigned_staff_id=private.staff_id()) then raise exception 'Customer changed or edit denied' using errcode='40001';end if;
  update public.customers set name=trim(p_name),phone=trim(p_phone),phone2=trim(p_phone2) where id=c.id;
  update public.property_contacts set access_code=p_access_code where id=link.id;result=link.id;
 end if;
 return result;
end$$;
revoke all on function public.save_property_contact(uuid,text,text,text,text,uuid,integer,integer) from public,anon;
grant execute on function public.save_property_contact(uuid,text,text,text,text,uuid,integer,integer) to authenticated;
create or replace view public.customer_property_links with (security_invoker=true) as
 select distinct office_id,customer_id,property_id from public.consultations where property_id is not null
 union select office_id,customer_id,property_id from public.property_contacts;
-- Only display_name can be changed, even through direct REST calls. No new role privileges.
grant update(display_name) on public.staff to authenticated;
create policy manager_name_update on public.staff for update to authenticated using(office_id=(select private.office_id()) and (select private.is_manager())) with check(office_id=(select private.office_id()) and (select private.is_manager()));
create or replace function public.property_related_customers(p_property uuid) returns jsonb language sql stable security invoker set search_path='' as $$
with ids as(
 select cp.customer_id from public.contract_parties cp join public.contracts c on c.id=cp.contract_id and c.office_id=cp.office_id where c.property_id=p_property and c.deleted_at is null
 union select c.customer_id from public.contracts c where c.property_id=p_property and c.deleted_at is null
 union select customer_id from public.consultations where property_id=p_property
 union select customer_id from public.property_contacts where property_id=p_property
),people as(select u.id,u.name,u.company_name,u.deleted_at from public.customers u join ids on ids.customer_id=u.id where exists(select 1 from public.properties p where p.id=p_property and p.office_id=u.office_id))
select jsonb_build_object('count',(select count(*) from people),'people',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from people order by name,id limit 20)x),'[]'::jsonb))
$$;
commit;
