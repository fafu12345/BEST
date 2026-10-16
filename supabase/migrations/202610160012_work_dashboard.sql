begin;
alter table public.properties add column next_confirmation_date date;
create index properties_confirmation_idx on public.properties(office_id,assigned_staff_id,next_confirmation_date,last_confirmed_at) where deleted_at is null;
create index contracts_month_idx on public.contracts(office_id,assigned_staff_id,(coalesce(contract_date,signed_at))) where deleted_at is null;
create index renewals_month_idx on public.contract_renewals(office_id,processed_at);
create index contract_end_events_idx on public.contract_events(office_id,event_date) where event_type='updated';
-- Both aggregates execute as the caller, including all nested tables and their RLS.
-- Counts are SQL aggregates, independent of PostgREST's result-row limit.
create function public.dashboard_core(p_assigned uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
with bounds as(select (now() at time zone 'Asia/Seoul')::date today,date_trunc('month',now() at time zone 'Asia/Seoul')::date m),
p as(select x.*,coalesce(x.next_confirmation_date,(x.last_confirmed_at at time zone 'Asia/Seoul')::date+30,(x.created_at at time zone 'Asia/Seoul')::date) check_date from public.properties x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
c as(select x.* from public.contracts x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
u as(select x.* from public.customers x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
jobs as(
 select 'property:'||id::text key,'property' kind,id,assigned_staff_id,title,check_date due_date,2 priority from p,bounds where status<>'closed' and check_date<=today
 union all select 'customer:'||id::text,'customer',id,assigned_staff_id,name,(next_contact_at at time zone 'Asia/Seoul')::date,case when (next_contact_at at time zone 'Asia/Seoul')::date<today then 1 else 2 end from u,bounds where (next_contact_at at time zone 'Asia/Seoul')::date<=today
 union all select 'task:'||t.id::text,case when t.property_id is not null then 'property' when t.customer_id is not null then 'customer' else 'general' end,coalesce(t.property_id,t.customer_id,t.id),t.assigned_staff_id,t.title,(t.due_at at time zone 'Asia/Seoul')::date,case when (t.due_at at time zone 'Asia/Seoul')::date<today then 1 when (t.due_at at time zone 'Asia/Seoul')::date=today then 2 else 3 end from public.tasks t,bounds where t.status in ('todo','doing') and (p_assigned is null or t.assigned_staff_id=p_assigned) and (t.due_at is null or (t.due_at at time zone 'Asia/Seoul')::date<=today+7)
)
select jsonb_build_object(
 'metrics',jsonb_build_object('properties_total',(select count(*) from p),'properties_available',(select count(*) from p where status='available'),'properties_recheck',(select count(*) from p,bounds where status<>'closed' and check_date<=today),'contracts_active',(select count(*) from c where status in ('signed','active')),'contracts_new_month',(select count(*) from c,bounds where status in ('signed','active','completed','terminated') and coalesce(contract_date,signed_at)>=m and coalesce(contract_date,signed_at)<(m+interval '1 month')::date),'contacts_today',(select count(*) from u,bounds where (next_contact_at at time zone 'Asia/Seoul')::date=today)),
 'contacts',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,name,company_name,next_contact_at,assigned_staff_id from u,bounds where (next_contact_at at time zone 'Asia/Seoul')::date=today order by next_contact_at,id limit 20)x),'[]'::jsonb),
 'new_contracts',coalesce((select jsonb_agg(to_jsonb(x)) from(select c.id,c.property_id,c.contract_type,c.status,c.assigned_staff_id,coalesce(c.contract_date,c.signed_at) contract_date,p.title,p.building_name,p.complex_name,p.building_dong,p.unit_number from c join public.properties p on p.id=c.property_id and p.office_id=c.office_id,bounds where c.status in ('signed','active','completed','terminated') and coalesce(c.contract_date,c.signed_at)>=m and coalesce(c.contract_date,c.signed_at)<(m+interval '1 month')::date order by coalesce(c.contract_date,c.signed_at) desc,c.id limit 20)x),'[]'::jsonb),
 'rechecks',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,title,assigned_staff_id,check_date,last_confirmed_at from p,bounds where status<>'closed' and check_date<=today order by check_date,id limit 20)x),'[]'::jsonb),
 'priority',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from jobs order by priority,due_date nulls last,key limit 20)x),'[]'::jsonb),
 'priority_count',(select count(*) from jobs),
 'workload',coalesce((select jsonb_agg(to_jsonb(x)) from(select assigned_staff_id,count(*) count from jobs group by assigned_staff_id)x),'[]'::jsonb)
)
$$;
revoke all on function public.dashboard_core(uuid) from public;
grant execute on function public.dashboard_core(uuid) to authenticated;

create function public.dashboard_workflow(p_assigned uuid default null,p_month date default null) returns jsonb language sql stable security invoker set search_path='' as $$
with b as(select (now() at time zone 'Asia/Seoul')::date today,date_trunc('month',now() at time zone 'Asia/Seoul')::date m,date_trunc('month',coalesce(p_month,(now() at time zone 'Asia/Seoul')::date))::date calendar_month),
c as(select x.* from public.contracts x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
f as(select x.*,c.property_id,c.lease_end_date,c.status contract_status,c.customer_id anchor_customer from public.contract_followups x join c on c.id=x.contract_id and c.office_id=x.office_id),
leases as(select * from f where contract_status in ('signed','active') and resolution_status='open'),
r as(select x.* from public.relocation_cases x join public.contracts c on c.id=x.contract_id and c.office_id=x.office_id where c.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
t as(select x.* from public.expiration_tasks x join public.contracts c on c.id=x.contract_id and c.office_id=x.office_id where c.deleted_at is null and x.status in ('pending','in_progress') and (p_assigned is null or x.assigned_staff_id=p_assigned)),
people as(select distinct f.contract_id,coalesce(f.contact_customer_id,cp.customer_id,f.anchor_customer) customer_id from leases f left join public.contract_parties cp on cp.office_id=f.office_id and cp.contract_id=f.contract_id and cp.role='tenant'),
intent as(
 select 'relocate' kind,p.customer_id,l.contract_id,null::uuid case_id,l.assigned_staff_id,null::text desired_region from leases l join people p on p.contract_id=l.contract_id where l.result='relocate'
 union all select 'relocate',r.customer_id,r.contract_id,r.id,r.assigned_staff_id,r.desired_region from r where status in ('open','searching','viewing')
 union all select 'renew',p.customer_id,l.contract_id,null::uuid,l.assigned_staff_id,null::text from leases l join people p on p.contract_id=l.contract_id where l.result='renew' and l.notice_status='negotiating'
),
calls as(
 select x.id customer_id,x.next_contact_at,null::uuid contract_id,null::uuid case_id,x.assigned_staff_id from public.customers x,b where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned) and (x.next_contact_at at time zone 'Asia/Seoul')::date=today
 union all select p.customer_id,l.next_contact_at,l.contract_id,null::uuid,l.assigned_staff_id from leases l join people p on p.contract_id=l.contract_id,b where (l.next_contact_at at time zone 'Asia/Seoul')::date=today
 union all select r.customer_id,r.next_contact_at,r.contract_id,r.id,r.assigned_staff_id from r,b where r.status in ('open','searching','viewing') and (r.next_contact_at at time zone 'Asia/Seoul')::date=today
),
call_people as(select distinct on(u.id) u.id,u.name,u.company_name,calls.next_contact_at,calls.contract_id,calls.case_id,calls.assigned_staff_id from calls join public.customers u on u.id=calls.customer_id and u.deleted_at is null order by u.id,calls.next_contact_at,calls.case_id nulls last),
jobs as(
 select 'expired:'||l.contract_id::text key,'expired' kind,l.contract_id id,l.assigned_staff_id,p.title,l.lease_end_date due_date,0 priority from leases l join public.properties p on p.id=l.property_id,b where l.lease_end_date<today
 union all select 'expiration:'||t.id::text,'expiration',t.contract_id,t.assigned_staff_id,case when t.task_key in ('180','90','60','30') then '만기 확인' when t.task_key like 'vacancy_review:%' then '퇴거·재임대 검토' when t.relocation_case_id is not null then '이전 고객 연락' else '계약 고객 연락' end,t.scheduled_date,case when t.scheduled_date<today then 1 when t.scheduled_date=today then 2 else 3 end from t,b where t.scheduled_date<=today+7
)
select jsonb_build_object(
 'metrics',jsonb_build_object('expiry_30',(select count(*) from leases,b where lease_end_date between today and today+30),'expiry_90',(select count(*) from leases,b where lease_end_date between today and today+90),'expiry_180',(select count(*) from leases,b where lease_end_date between today and today+180),'expiry_overdue',(select count(*) from leases,b where lease_end_date<today),'contacts_today',(select count(*) from call_people),'relocation_customers',(select count(distinct i.customer_id) from intent i join public.customers u on u.id=i.customer_id and u.deleted_at is null where i.kind='relocate'),'renewal_customers',(select count(distinct i.customer_id) from intent i join public.customers u on u.id=i.customer_id and u.deleted_at is null where i.kind='renew')),
 'contacts',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from call_people order by next_contact_at,id limit 20)x),'[]'::jsonb),
 'intentions',coalesce((select jsonb_agg(to_jsonb(x)) from(select distinct i.*,u.name,u.company_name from intent i join public.customers u on u.id=i.customer_id and u.deleted_at is null order by i.kind,u.name,i.customer_id,i.contract_id limit 20)x),'[]'::jsonb),
 'expiring',coalesce((select jsonb_agg(to_jsonb(x)) from(select l.contract_id id,l.property_id,l.lease_end_date,l.assigned_staff_id,p.title,p.building_name,p.complex_name,p.building_dong,p.unit_number,coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'deleted_at',u.deleted_at)) from public.customers u where u.id in(select cp.customer_id from public.contract_parties cp where cp.contract_id=l.contract_id union select l.anchor_customer)),'[]'::jsonb) customers from leases l join public.properties p on p.id=l.property_id,b where l.lease_end_date<=today+180 order by l.lease_end_date,l.contract_id limit 20)x),'[]'::jsonb),
 'calendar',coalesce((select jsonb_agg(to_jsonb(x)) from(select c.id,c.lease_end_date,c.assigned_staff_id,p.title,p.building_name,p.complex_name,p.building_dong,p.unit_number,f.resolution_status from c join public.properties p on p.id=c.property_id left join public.contract_followups f on f.contract_id=c.id and f.office_id=c.office_id,b where c.contract_type in ('jeonse','monthly_rent') and c.status in ('signed','active') and c.lease_end_date>=calendar_month and c.lease_end_date<(calendar_month+interval '1 month')::date order by c.lease_end_date,c.id)x),'[]'::jsonb),
 'statistics',jsonb_build_object('renewed',(select count(*) from public.contract_renewals x join public.contracts c on c.id=x.renewed_contract_id,b where (p_assigned is null or c.assigned_staff_id=p_assigned) and c.deleted_at is null and x.processed_at>=m and x.processed_at<(m+interval '1 month')::date),'completed',(select count(distinct e.contract_id) from public.contract_events e join c on c.id=e.contract_id,b where e.event_type='updated' and e.new_values->>'status'='completed' and e.old_values->>'status' is distinct from 'completed' and (e.event_date at time zone 'Asia/Seoul')::date>=m and (e.event_date at time zone 'Asia/Seoul')::date<(m+interval '1 month')::date),'terminated',(select count(distinct e.contract_id) from public.contract_events e join c on c.id=e.contract_id,b where e.event_type='updated' and e.new_values->>'status'='terminated' and e.old_values->>'status' is distinct from 'terminated' and (e.event_date at time zone 'Asia/Seoul')::date>=m and (e.event_date at time zone 'Asia/Seoul')::date<(m+interval '1 month')::date)),
 'priority',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from jobs order by priority,due_date nulls last,key limit 20)x),'[]'::jsonb),
 'priority_count',(select count(*) from jobs),'workload',coalesce((select jsonb_agg(to_jsonb(x)) from(select assigned_staff_id,count(*) count from jobs group by assigned_staff_id)x),'[]'::jsonb)
)
$$;
revoke all on function public.dashboard_workflow(uuid,date) from public;
grant execute on function public.dashboard_workflow(uuid,date) to authenticated;
create function public.property_related_customers(p_property uuid) returns jsonb language sql stable security invoker set search_path='' as $$
with ids as(
 select cp.customer_id from public.contract_parties cp join public.contracts c on c.id=cp.contract_id and c.office_id=cp.office_id where c.property_id=p_property and c.deleted_at is null
 union select c.customer_id from public.contracts c where c.property_id=p_property and c.deleted_at is null
 union select customer_id from public.consultations where property_id=p_property
),people as(select u.id,u.name,u.company_name,u.deleted_at from public.customers u join ids on ids.customer_id=u.id where exists(select 1 from public.properties p where p.id=p_property and p.office_id=u.office_id))
select jsonb_build_object('count',(select count(*) from people),'people',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from people order by name,id limit 20)x),'[]'::jsonb))
$$;
revoke all on function public.property_related_customers(uuid) from public;
grant execute on function public.property_related_customers(uuid) to authenticated;
create function public.customer_followup_links(p_customer uuid) returns jsonb language sql stable security invoker set search_path='' as $$
with records as(
 select r.id,r.contract_id,r.status,r.desired_region,r.next_contact_at,'case'::text kind from public.relocation_cases r where r.customer_id=p_customer
 union all select f.id,f.contract_id,f.result,null::text,f.next_contact_at,'intention' from public.contract_followups f join public.contracts c on c.id=f.contract_id and c.office_id=f.office_id where f.result='relocate' and f.resolution_status='open' and c.deleted_at is null and (f.contact_customer_id=p_customer or (f.contact_customer_id is null and exists(select 1 from public.contract_parties cp where cp.contract_id=c.id and cp.customer_id=p_customer and cp.role='tenant'))) and not exists(select 1 from public.relocation_cases r where r.contract_id=f.contract_id and r.customer_id=p_customer and r.status in ('open','searching','viewing'))
)
select jsonb_build_object('count',(select count(*) from records),'records',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from records order by next_contact_at nulls last,id limit 20)x),'[]'::jsonb))
$$;
revoke all on function public.customer_followup_links(uuid) from public;
grant execute on function public.customer_followup_links(uuid) to authenticated;
commit;
