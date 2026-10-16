begin;
alter table public.property_buildings add column deleted_at timestamptz;
grant update(name,deleted_at) on public.property_buildings to authenticated;
create function private.guard_building_directory() returns trigger language plpgsql set search_path='' as $$begin
 if TG_OP='INSERT' then if new.deleted_at is not null then raise exception 'Cannot create archived choice' using errcode='23514';end if;return new;end if;
 if new.id<>old.id or new.office_id<>old.office_id or new.property_type<>old.property_type or new.created_by is distinct from old.created_by then raise exception 'Building identity immutable' using errcode='42501';end if;
 if old.deleted_at is not null then raise exception 'Archived building read only' using errcode='42501';end if;
 if new.deleted_at is not null then new.deleted_at=clock_timestamp();end if;return new;
end$$;
revoke all on function private.guard_building_directory() from public;
create trigger building_directory_guard before insert or update on public.property_buildings for each row execute function private.guard_building_directory();
create function private.rename_building_properties() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.name is distinct from old.name then update public.properties set building_name=new.name where building_id=new.id and office_id=new.office_id and deleted_at is null;end if;return new;
end$$;
revoke all on function private.rename_building_properties() from public;
create trigger building_directory_names after update of name on public.property_buildings for each row execute function private.rename_building_properties();
create or replace function private.bind_property_building() returns trigger language plpgsql set search_path='' as $$
declare building_name text;
begin
 if new.building_id is null then return new; end if;
 select b.name into building_name from public.property_buildings b
 where b.id=new.building_id and b.office_id=new.office_id and b.property_type=new.property_type and (b.deleted_at is null or (TG_OP='UPDATE' and new.building_id is not distinct from old.building_id and new.office_id=old.office_id));
 if not found then raise exception 'Building must match office and property type' using errcode='23503'; end if;
 new.building_name=building_name;
 new.complex_name=case when new.property_type in ('apartment','officetel') then building_name else '' end;
 new.title=left(concat_ws(' ',building_name,
  case when new.building_dong<>'' then new.building_dong||case when new.building_dong like '%동' then '' else '동' end end,
  case when new.unit_number<>'' then new.unit_number||case when new.unit_number like '%호' then '' else '호' end end,
  case when new.property_type='retail' then nullif(new.store_name,'') end),200);
 return new;
end $$;
create or replace function public.dashboard_core(p_assigned uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
with bounds as(select (now() at time zone 'Asia/Seoul')::date today,date_trunc('month',now() at time zone 'Asia/Seoul')::date m),
p as(select x.*,coalesce(x.next_confirmation_date,(x.last_confirmed_at at time zone 'Asia/Seoul')::date+30,(x.created_at at time zone 'Asia/Seoul')::date) check_date from public.properties x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
c as(select x.* from public.contracts x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
u as(select x.* from public.customers x where x.deleted_at is null and (p_assigned is null or x.assigned_staff_id=p_assigned)),
raw_jobs as(
 select 'property:'||id::text key,'property' kind,id,assigned_staff_id,title,check_date due_date,2 priority from p,bounds where status<>'closed' and check_date<=today
 union all select 'customer:'||id::text,'customer',id,assigned_staff_id,name,(next_contact_at at time zone 'Asia/Seoul')::date,case when (next_contact_at at time zone 'Asia/Seoul')::date<today then 1 else 2 end from u,bounds where (next_contact_at at time zone 'Asia/Seoul')::date<=today
 union all select 'task:'||t.id::text,case when t.property_id is not null then 'property' when t.customer_id is not null then 'customer' else 'general' end,coalesce(t.property_id,t.customer_id,t.id),t.assigned_staff_id,t.title,(t.due_at at time zone 'Asia/Seoul')::date,case when (t.due_at at time zone 'Asia/Seoul')::date<today then 1 when (t.due_at at time zone 'Asia/Seoul')::date=today then 2 else 3 end from public.tasks t,bounds where t.status in ('todo','doing') and (p_assigned is null or t.assigned_staff_id=p_assigned) and (t.due_at is null or (t.due_at at time zone 'Asia/Seoul')::date<=today+7)
),jobs as(select j.* from raw_jobs j join public.staff s on s.id=j.assigned_staff_id where p_assigned is not null or (s.active and s.deleted_at is null))
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

create or replace function public.dashboard_workflow(p_assigned uuid default null,p_month date default null) returns jsonb language sql stable security invoker set search_path='' as $$
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
raw_jobs as(
 select 'expired:'||l.contract_id::text key,'expired' kind,l.contract_id id,l.assigned_staff_id,p.title,l.lease_end_date due_date,0 priority from leases l join public.properties p on p.id=l.property_id,b where l.lease_end_date<today
 union all select 'expiration:'||t.id::text,'expiration',t.contract_id,t.assigned_staff_id,case when t.task_key in ('180','90','60','30') then '만기 확인' when t.task_key like 'vacancy_review:%' then '퇴거·재임대 검토' when t.relocation_case_id is not null then '이전 고객 연락' else '계약 고객 연락' end,t.scheduled_date,case when t.scheduled_date<today then 1 when t.scheduled_date=today then 2 else 3 end from t,b where t.scheduled_date<=today+7
),jobs as(select j.* from raw_jobs j join public.staff s on s.id=j.assigned_staff_id where p_assigned is not null or (s.active and s.deleted_at is null))
select jsonb_build_object(
 'metrics',jsonb_build_object('expiry_30',(select count(*) from leases,b where lease_end_date between today and today+30),'expiry_90',(select count(*) from leases,b where lease_end_date between today and today+90),'expiry_180',(select count(*) from leases,b where lease_end_date between today and today+180),'expiry_overdue',(select count(*) from leases,b where lease_end_date<today),'contacts_today',(select count(*) from call_people),'relocation_customers',(select count(distinct i.customer_id) from intent i join public.customers u on u.id=i.customer_id and u.deleted_at is null where i.kind='relocate'),'renewal_customers',(select count(distinct i.customer_id) from intent i join public.customers u on u.id=i.customer_id and u.deleted_at is null where i.kind='renew')),
 'contacts',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from call_people order by next_contact_at,id limit 20)x),'[]'::jsonb),
 'intentions',coalesce((select jsonb_agg(to_jsonb(x)) from(select distinct i.*,u.name,u.company_name from intent i join public.customers u on u.id=i.customer_id and u.deleted_at is null order by i.kind,u.name,i.customer_id,i.contract_id limit 20)x),'[]'::jsonb),
 'expiring',coalesce((select jsonb_agg(to_jsonb(x)) from(select l.contract_id id,l.property_id,l.lease_end_date,l.assigned_staff_id,p.title,p.building_name,p.complex_name,p.building_dong,p.unit_number,coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'deleted_at',u.deleted_at)) from public.customers u where u.id in(select cp.customer_id from public.contract_parties cp where cp.contract_id=l.contract_id union select l.anchor_customer)),'[]'::jsonb) customers from leases l join public.properties p on p.id=l.property_id,b where l.lease_end_date<=today+180 order by l.lease_end_date,l.contract_id limit 20)x),'[]'::jsonb),
 'calendar',coalesce((select jsonb_agg(to_jsonb(x)) from(select c.id,c.lease_end_date,c.assigned_staff_id,p.title,p.building_name,p.complex_name,p.building_dong,p.unit_number,f.resolution_status from c join public.properties p on p.id=c.property_id left join public.contract_followups f on f.contract_id=c.id and f.office_id=c.office_id,b where c.contract_type in ('jeonse','monthly_rent') and c.status in ('signed','active') and c.lease_end_date>=calendar_month and c.lease_end_date<(calendar_month+interval '1 month')::date order by c.lease_end_date,c.id)x),'[]'::jsonb),
 'closing_calendar',coalesce((select jsonb_agg(to_jsonb(x) order by closing_date,id) from(select c.id,c.closing_date,c.assigned_staff_id,p.title,p.building_name,p.complex_name,p.building_dong,p.unit_number from c join public.properties p on p.id=c.property_id and p.office_id=c.office_id,b where c.status in ('signed','active','completed') and c.closing_date>=b.calendar_month and c.closing_date<(b.calendar_month+interval '1 month')::date)x),'[]'::jsonb),
 'statistics',jsonb_build_object('renewed',(select count(*) from public.contract_renewals x join public.contracts c on c.id=x.renewed_contract_id,b where (p_assigned is null or c.assigned_staff_id=p_assigned) and c.deleted_at is null and x.processed_at>=m and x.processed_at<(m+interval '1 month')::date),'completed',(select count(distinct e.contract_id) from public.contract_events e join c on c.id=e.contract_id,b where e.event_type='updated' and e.new_values->>'status'='completed' and e.old_values->>'status' is distinct from 'completed' and (e.event_date at time zone 'Asia/Seoul')::date>=m and (e.event_date at time zone 'Asia/Seoul')::date<(m+interval '1 month')::date),'terminated',(select count(distinct e.contract_id) from public.contract_events e join c on c.id=e.contract_id,b where e.event_type='updated' and e.new_values->>'status'='terminated' and e.old_values->>'status' is distinct from 'terminated' and (e.event_date at time zone 'Asia/Seoul')::date>=m and (e.event_date at time zone 'Asia/Seoul')::date<(m+interval '1 month')::date)),
 'priority',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from jobs order by priority,due_date nulls last,key limit 20)x),'[]'::jsonb),
 'priority_count',(select count(*) from jobs),'workload',coalesce((select jsonb_agg(to_jsonb(x)) from(select assigned_staff_id,count(*) count from jobs group by assigned_staff_id)x),'[]'::jsonb)
)
$$;
revoke all on function public.dashboard_workflow(uuid,date) from public;
grant execute on function public.dashboard_workflow(uuid,date) to authenticated;
alter table public.contract_followups add column work_checks jsonb not null default '{}'::jsonb
 check(jsonb_typeof(work_checks)='object' and (work_checks-array['landlord_contact','tenant_contact','renewal_decision','moveout_settlement','relet_plan'])='{}'::jsonb and not jsonb_path_exists(work_checks,'$.* ? (@.type() != "boolean")')),
 add column work_note text not null default '' check(length(work_note)<=2000);
grant update(work_checks,work_note) on public.contract_followups to authenticated;
commit;
