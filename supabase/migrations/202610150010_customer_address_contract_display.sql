begin;
-- Optional address; existing customer data and permissions remain intact.
alter table public.customers add column address text not null default '' check (char_length(address)<=500);
create or replace view public.contract_directory with (security_invoker=true) as
 select c.*,jsonb_build_object('title',p.title,'deleted_at',p.deleted_at,'building_name',p.building_name,'complex_name',p.complex_name,'building_dong',p.building_dong,'unit_number',p.unit_number) as properties,
 coalesce(c.contract_date,c.signed_at) as effective_contract_date,
 coalesce(p.building_name,'')||' '||coalesce(p.complex_name,'')||' '||coalesce(p.building_dong,'')||' '||coalesce(p.unit_number,'')||' '||p.title||' '||coalesce(customer.name,'')||' '||coalesce(customer.company_name,'')||' '||coalesce((select string_agg(cp.name_snapshot||' '||cp.company_name_snapshot||' '||coalesce(pc.name,'')||' '||coalesce(pc.company_name,''),' ') from public.contract_parties cp left join public.customers pc on pc.id=cp.customer_id and pc.office_id=cp.office_id where cp.contract_id=c.id and cp.office_id=c.office_id),'') as search_text,
 array(select cp.customer_id from public.contract_parties cp where cp.contract_id=c.id and cp.office_id=c.office_id union select c.customer_id) as customer_ids
 from public.contracts c join public.properties p on p.id=c.property_id and p.office_id=c.office_id left join public.customers customer on customer.id=c.customer_id and customer.office_id=c.office_id;
commit;
