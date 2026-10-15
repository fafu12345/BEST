begin;
-- Shared office/type-specific choices. Ordinary users can append choices, never rename or move them.
create table public.property_buildings (
 id uuid primary key default gen_random_uuid(),
 office_id uuid not null references public.offices(id),
 property_type text not null check(property_type in ('retail','office','apartment','officetel')),
 name text not null check(length(trim(name)) between 1 and 200),
 normalized_name text generated always as (lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))) stored,
 created_by uuid default private.staff_id(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,created_by) references public.staff(office_id,id),
 unique(office_id,property_type,id), unique(office_id,property_type,normalized_name)
);
alter table public.property_buildings enable row level security;
revoke all on public.property_buildings from public,anon,authenticated;
grant select,insert on public.property_buildings to authenticated;
grant all on public.property_buildings to service_role;
create policy building_read on public.property_buildings for select to authenticated using(office_id=(select private.office_id()));
create policy building_add on public.property_buildings for insert to authenticated with check(office_id=(select private.office_id()) and created_by=(select private.staff_id()));
create trigger protect_tenant before update on public.property_buildings for each row execute function private.protect_tenant();
create trigger updated_at before update on public.property_buildings for each row execute function private.touch_updated_at();
create index property_buildings_creator_idx on public.property_buildings(office_id,created_by);

alter table public.properties
 add column building_id uuid,
 add column store_name text not null default '' check(length(store_name)<=200),
 -- NULL identifies old rows: legacy rent price remains readable without rewriting financial history.
 add column monthly_rent numeric(16,0) check(monthly_rent between 0 and 9000000000000000),
 add constraint property_building_same_office_type foreign key(office_id,property_type,building_id)
 references public.property_buildings(office_id,property_type,id);
create index properties_building_idx on public.properties(office_id,property_type,building_id) where deleted_at is null;

-- Import meaningful existing names. Do not invent directory names from free-text listing titles.
insert into public.property_buildings(office_id,property_type,name,created_by)
select office_id,property_type,min(trim(coalesce(nullif(trim(complex_name),''),nullif(trim(building_name),'')))),null
from public.properties
where property_type in ('retail','office','apartment','officetel') and coalesce(nullif(trim(complex_name),''),nullif(trim(building_name),'')) is not null
group by office_id,property_type,lower(regexp_replace(trim(coalesce(nullif(trim(complex_name),''),nullif(trim(building_name),''))),'[[:space:]]+',' ','g'));
-- Schema-only association backfill: no financial changes or fabricated business/audit events.
-- Temporarily suspend only the two application triggers inside this transaction; RLS policies remain enabled.
alter table public.properties disable trigger property_guard;
alter table public.properties disable trigger property_audit;
update public.properties p set building_id=b.id
from public.property_buildings b
where b.office_id=p.office_id and b.property_type=p.property_type
and b.normalized_name=lower(regexp_replace(trim(coalesce(nullif(trim(p.complex_name),''),nullif(trim(p.building_name),''))),'[[:space:]]+',' ','g'));
alter table public.properties enable trigger property_guard;
alter table public.properties enable trigger property_audit;

create function private.bind_property_building() returns trigger language plpgsql set search_path='' as $$
declare building_name text;
begin
 if new.building_id is null then return new; end if;
 select b.name into building_name from public.property_buildings b
 where b.id=new.building_id and b.office_id=new.office_id and b.property_type=new.property_type;
 if not found then raise exception 'Building must match office and property type' using errcode='23503'; end if;
 new.building_name=building_name;
 new.complex_name=case when new.property_type in ('apartment','officetel') then building_name else '' end;
 new.title=left(concat_ws(' ',building_name,
  case when new.building_dong<>'' then new.building_dong||case when new.building_dong like '%동' then '' else '동' end end,
  case when new.unit_number<>'' then new.unit_number||case when new.unit_number like '%호' then '' else '호' end end,
  case when new.property_type='retail' then nullif(new.store_name,'') end),200);
 return new;
end $$;
revoke all on function private.bind_property_building() from public,anon,authenticated;
create trigger property_building_bind before insert or update on public.properties for each row execute function private.bind_property_building();

-- Preserve legacy price semantics: sale=price, lease=deposit represented in price, rent=monthly amount in price.
-- A separate monthly_rent now also records rental income on sale and lease listings.
create or replace function private.record_property_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_values jsonb; after_values jsonb; kind text;
begin
 after_values=jsonb_build_object('price',case when new.transaction_type='sale' then new.price else 0 end,
 'deposit',case when new.transaction_type='lease' then new.price else new.deposit end,
 'monthly_rent',coalesce(new.monthly_rent,case when new.transaction_type='rent' then new.price else 0 end),
 'transaction_type',new.transaction_type,'premium',new.premium,'status',new.status,'assigned_staff_id',new.assigned_staff_id,'deleted_at',new.deleted_at);
 if tg_op='INSERT' then kind='created';
 else
 before_values=jsonb_build_object('price',case when old.transaction_type='sale' then old.price else 0 end,
 'deposit',case when old.transaction_type='lease' then old.price else old.deposit end,
 'monthly_rent',coalesce(old.monthly_rent,case when old.transaction_type='rent' then old.price else 0 end),
 'transaction_type',old.transaction_type,'premium',old.premium,'status',old.status,'assigned_staff_id',old.assigned_staff_id,'deleted_at',old.deleted_at);
 if before_values=after_values then return new; end if;
 kind=case when old.deleted_at is null and new.deleted_at is not null then 'deleted' else 'updated' end;
 end if;
 insert into public.property_change_history(office_id,property_id,actor_staff_id,event,old_values,new_values)
 values(new.office_id,new.id,private.staff_id(),kind,before_values,after_values);
 return new;
end $$;
alter table public.properties drop column search_text;
alter table public.properties add column search_text text generated always as
(title||' '||building_name||' '||address||' '||complex_name||' '||store_name||' '||unit_number) stored;
create index properties_search_idx on public.properties using gin(search_text extensions.gin_trgm_ops) where deleted_at is null;
commit;
