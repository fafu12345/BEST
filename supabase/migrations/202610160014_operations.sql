begin;
create table public.notification_receipts(
 office_id uuid not null references public.offices(id),staff_id uuid not null,notice_key text not null check(length(notice_key) between 1 and 200),
 state text not null check(state in ('read','dismissed')),updated_at timestamptz not null default clock_timestamp(),
 primary key(office_id,staff_id,notice_key),foreign key(office_id,staff_id) references public.staff(office_id,id)
);
alter table public.notification_receipts enable row level security;
revoke all on public.notification_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.notification_receipts to authenticated;
grant all on public.notification_receipts to service_role;
create policy own_receipts on public.notification_receipts to authenticated using(office_id=private.office_id() and staff_id=private.staff_id()) with check(office_id=private.office_id() and staff_id=private.staff_id());
create trigger receipt_updated before update on public.notification_receipts for each row execute function private.touch_updated_at();

create table public.contract_payments(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),contract_id uuid not null,
 direction text not null check(direction in ('receipt','refund')),amount_krw numeric(16,0) not null check(amount_krw between 1 and 9000000000000000),paid_on date not null,
 note text not null default '' check(length(note)<=2000),actor_id uuid not null,idempotency_key uuid not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,actor_id) references public.staff(office_id,id),unique(office_id,idempotency_key)
);
create index contract_payment_period_idx on public.contract_payments(office_id,paid_on,contract_id);
create index contract_payment_contract_idx on public.contract_payments(office_id,contract_id);
alter table public.contract_payments enable row level security;
revoke all on public.contract_payments from public,anon,authenticated;
grant select,insert on public.contract_payments to authenticated;grant all on public.contract_payments to service_role;
create policy payment_read on public.contract_payments for select to authenticated using(office_id=private.office_id());
create policy payment_insert on public.contract_payments for insert to authenticated with check(office_id=private.office_id() and actor_id=private.staff_id() and exists(select 1 from public.contracts c where c.id=contract_id and c.office_id=contract_payments.office_id and c.deleted_at is null and (private.is_manager() or c.assigned_staff_id=private.staff_id())));
create function private.guard_payment() returns trigger language plpgsql set search_path='' as $$
declare c public.contracts;net numeric;
begin
 select * into c from public.contracts where id=new.contract_id and office_id=new.office_id for update;
 if c.id is null or c.deleted_at is not null or private.staff_id() is null or not(private.is_manager() or c.assigned_staff_id=private.staff_id()) then raise exception 'Payment denied' using errcode='42501';end if;
 new.actor_id=private.staff_id();new.created_at=clock_timestamp();
 if new.paid_on>(clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'Future payment is not received money' using errcode='23514';end if;
 select coalesce(sum(case direction when 'receipt' then amount_krw else -amount_krw end),0) into net from public.contract_payments where contract_id=c.id and office_id=c.office_id;
 if new.direction='refund' and new.amount_krw>net then raise exception 'Refund exceeds receipts' using errcode='23514';end if;
 return new;
end$$;
revoke all on function private.guard_payment() from public,anon,authenticated;
create trigger payment_guard before insert on public.contract_payments for each row execute function private.guard_payment();
create function public.record_contract_payment(p_contract uuid,p_version integer,p_direction text,p_amount numeric,p_paid_on date,p_note text,p_key uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.contracts;v public.contract_payments;pid uuid;
begin
 select * into c from public.contracts where id=p_contract and office_id=private.office_id() and deleted_at is null for update;
 if c.id is null or not(private.is_manager() or c.assigned_staff_id=private.staff_id()) then raise exception 'Payment denied' using errcode='42501';end if;
 select * into v from public.contract_payments where office_id=c.office_id and idempotency_key=p_key;
 if found then
  if row(v.contract_id,v.direction,v.amount_krw,v.paid_on,v.note,v.actor_id) is distinct from row(p_contract,p_direction,p_amount,p_paid_on,p_note,private.staff_id()) then raise exception 'Key reused with different payment' using errcode='23505';end if;
  return v.id;
 end if;
 if c.version<>p_version then raise exception 'Stale contract' using errcode='40001';end if;
 insert into public.contract_payments(office_id,contract_id,direction,amount_krw,paid_on,note,actor_id,idempotency_key) values(c.office_id,c.id,p_direction,p_amount,p_paid_on,p_note,private.staff_id(),p_key) returning id into pid;return pid;
end$$;
revoke all on function public.record_contract_payment(uuid,integer,text,numeric,date,text,uuid) from public,anon;
grant execute on function public.record_contract_payment(uuid,integer,text,numeric,date,text,uuid) to authenticated;

create table public.relocation_contract_links(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),relocation_case_id uuid not null,source_contract_id uuid not null,new_contract_id uuid not null,customer_id uuid not null,
 actor_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(office_id,source_contract_id,relocation_case_id) references public.relocation_cases(office_id,contract_id,id),
 foreign key(office_id,new_contract_id) references public.contracts(office_id,id),foreign key(office_id,customer_id) references public.customers(office_id,id),foreign key(office_id,actor_id) references public.staff(office_id,id),
 unique(office_id,relocation_case_id),unique(office_id,customer_id,new_contract_id),check(source_contract_id<>new_contract_id)
);
alter table public.relocation_contract_links enable row level security;
revoke all on public.relocation_contract_links from public,anon,authenticated;
grant select,insert on public.relocation_contract_links to authenticated;grant all on public.relocation_contract_links to service_role;
create policy relocation_link_read on public.relocation_contract_links for select to authenticated using(office_id=private.office_id());
create policy relocation_link_insert on public.relocation_contract_links for insert to authenticated with check(office_id=private.office_id() and actor_id=private.staff_id() and exists(select 1 from public.relocation_cases r where r.id=relocation_case_id and r.office_id=relocation_contract_links.office_id and (private.is_manager() or r.assigned_staff_id=private.staff_id())));
create function private.guard_relocation_link() returns trigger language plpgsql set search_path='' as $$
declare r public.relocation_cases;c public.contracts;old_property uuid;
begin
 select * into r from public.relocation_cases where id=new.relocation_case_id and office_id=new.office_id for update;
 select * into c from public.contracts where id=new.new_contract_id and office_id=new.office_id for update;
 select property_id into old_property from public.contracts where id=r.contract_id and office_id=r.office_id and deleted_at is null;
 if r.id is null or c.id is null or old_property is null or c.deleted_at is not null or c.status not in ('signed','active','completed') or r.status in ('closed','cancelled') or new.customer_id<>r.customer_id or new.source_contract_id<>r.contract_id or c.property_id=old_property or not(private.is_manager() or r.assigned_staff_id=private.staff_id()) or not(private.is_manager() or c.assigned_staff_id=private.staff_id()) then raise exception 'Relocation conversion denied' using errcode='42501';end if;
 if not exists(select 1 from public.contract_parties p where p.office_id=c.office_id and p.contract_id=c.id and p.customer_id=r.customer_id and p.role in ('tenant','buyer')) then raise exception 'New contract must include relocating customer' using errcode='23514';end if;
 new.actor_id=private.staff_id();new.created_at=clock_timestamp();return new;
end$$;
revoke all on function private.guard_relocation_link() from public,anon,authenticated;
create trigger relocation_link_guard before insert on public.relocation_contract_links for each row execute function private.guard_relocation_link();
create function private.audit_relocation_link() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.relocation_cases set status='contracted' where id=new.relocation_case_id and office_id=new.office_id;
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,new_values)
 select new.office_id,id,'relocation_linked','이전 상담과 신규 계약 연결',new.actor_id,jsonb_build_object('source_contract_id',new.source_contract_id,'new_contract_id',new.new_contract_id,'relocation_case_id',new.relocation_case_id,'customer_id',new.customer_id) from public.contracts where office_id=new.office_id and id in (new.source_contract_id,new.new_contract_id);
 return new;
end$$;
revoke all on function private.audit_relocation_link() from public,anon,authenticated;
create trigger relocation_link_audit after insert on public.relocation_contract_links for each row execute function private.audit_relocation_link();
create function public.link_relocation_contract(p_case uuid,p_version integer,p_new uuid,p_new_version integer,p_end_source boolean,p_source_version integer) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.relocation_cases;c public.contracts;source public.contracts;lid uuid;
begin
 select * into r from public.relocation_cases where id=p_case and office_id=private.office_id() for update;
 if r.id is null or not(private.is_manager() or r.assigned_staff_id=private.staff_id()) then raise exception 'Case edit denied' using errcode='42501';end if;
 if r.version<>p_version then raise exception 'Stale case' using errcode='40001';end if;
 select * into c from public.contracts where id=p_new and office_id=r.office_id and deleted_at is null for update;
 if c.id is null or not(private.is_manager() or c.assigned_staff_id=private.staff_id()) then raise exception 'New contract edit denied' using errcode='42501';end if;
 if c.version<>p_new_version then raise exception 'Stale new contract' using errcode='40001';end if;
 if p_end_source then
  select * into source from public.contracts where id=r.contract_id and office_id=r.office_id and deleted_at is null for update;
  if source.id is null or not(private.is_manager() or source.assigned_staff_id=private.staff_id()) then raise exception 'Source edit denied' using errcode='42501';end if;
  if source.version<>p_source_version then raise exception 'Stale source' using errcode='40001';end if;
  if source.status not in ('signed','active') then raise exception 'Source must be ongoing to end' using errcode='23514';end if;
  update public.contracts set status='completed' where id=source.id;
 end if;
 insert into public.relocation_contract_links(office_id,relocation_case_id,source_contract_id,new_contract_id,customer_id,actor_id) values(r.office_id,r.id,r.contract_id,c.id,r.customer_id,private.staff_id()) returning id into lid;return lid;
end$$;
revoke all on function public.link_relocation_contract(uuid,integer,uuid,integer,boolean,integer) from public,anon;
grant execute on function public.link_relocation_contract(uuid,integer,uuid,integer,boolean,integer) to authenticated;

create table public.access_audit_events(
 id bigint generated always as identity primary key,office_id uuid not null references public.offices(id),actor_id uuid,action text not null,entity_id uuid,created_at timestamptz not null default clock_timestamp(),
 foreign key(office_id,actor_id) references public.staff(office_id,id)
);
create index access_audit_office_time_idx on public.access_audit_events(office_id,created_at desc);
alter table public.access_audit_events enable row level security;
revoke all on public.access_audit_events from public,anon,authenticated;
grant select on public.access_audit_events to authenticated;grant all on public.access_audit_events to service_role;grant usage,select on sequence public.access_audit_events_id_seq to service_role;
create policy audit_manager_read on public.access_audit_events for select to authenticated using(office_id=private.office_id() and private.is_manager());
create function public.record_customer_access(p_customer uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare oid uuid=private.office_id();sid uuid=private.staff_id();
begin
 if oid is null or sid is null then raise exception 'Membership required' using errcode='42501';end if;
 if p_customer is not null and not exists(select 1 from public.customers where id=p_customer and office_id=oid and deleted_at is null) then raise exception 'Customer unavailable' using errcode='42501';end if;
 insert into public.access_audit_events(office_id,actor_id,action,entity_id) values(oid,sid,case when p_customer is null then 'customer_list' else 'customer_detail' end,p_customer);
end$$;
revoke all on function public.record_customer_access(uuid) from public,anon;grant execute on function public.record_customer_access(uuid) to authenticated;
create function private.audit_payment() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,new_values) values(new.office_id,new.contract_id,'brokerage_'||new.direction,'중개보수 수납·환불 기록',new.actor_id,jsonb_build_object('payment_id',new.id,'amount_krw',new.amount_krw,'paid_on',new.paid_on));return new;
end$$;
revoke all on function private.audit_payment() from public,anon,authenticated;
create trigger payment_audit after insert on public.contract_payments for each row execute function private.audit_payment();
-- Keep explicit property confirmation checks in the existing history, too.
create or replace function private.record_property_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_values jsonb; after_values jsonb; kind text;
begin
 after_values=jsonb_build_object('price',case when new.transaction_type='sale' then new.price else 0 end,
 'deposit',case when new.transaction_type='lease' then new.price else new.deposit end,
 'monthly_rent',coalesce(new.monthly_rent,case when new.transaction_type='rent' then new.price else 0 end),
 'transaction_type',new.transaction_type,'premium',new.premium,'status',new.status,'assigned_staff_id',new.assigned_staff_id,'deleted_at',new.deleted_at,'last_confirmed_at',new.last_confirmed_at,'next_confirmation_date',new.next_confirmation_date);
 if tg_op='INSERT' then kind='created';
 else
 before_values=jsonb_build_object('price',case when old.transaction_type='sale' then old.price else 0 end,
 'deposit',case when old.transaction_type='lease' then old.price else old.deposit end,
 'monthly_rent',coalesce(old.monthly_rent,case when old.transaction_type='rent' then old.price else 0 end),
 'transaction_type',old.transaction_type,'premium',old.premium,'status',old.status,'assigned_staff_id',old.assigned_staff_id,'deleted_at',old.deleted_at,'last_confirmed_at',old.last_confirmed_at,'next_confirmation_date',old.next_confirmation_date);
 if before_values=after_values then return new; end if;
 kind=case when old.deleted_at is null and new.deleted_at is not null then 'deleted' else 'updated' end;
 end if;
 insert into public.property_change_history(office_id,property_id,actor_staff_id,event,old_values,new_values)
 values(new.office_id,new.id,private.staff_id(),kind,before_values,after_values);
 return new;
end $$;
create function private.audit_history_delete() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.access_audit_events(office_id,actor_id,action,entity_id) values(old.office_id,private.staff_id(),'property_history_deleted',old.property_id);return old;
end$$;
revoke all on function private.audit_history_delete() from public,anon,authenticated;
create trigger property_history_delete_audit after delete on public.property_change_history for each row execute function private.audit_history_delete();

create view public.notification_directory with(security_invoker=true) as
 select 'task:'||t.id||':'||t.version as notice_key,t.office_id,t.assigned_staff_id,
 case when t.task_key in ('180','90','60','30') then 'expiration' when t.task_key like 'relocation:%' then 'relocation_contact' when t.task_key like 'vacancy_review:%' then 'property_recheck' else 'customer_contact' end as kind,
 case when t.task_key in ('180','90','60','30') then '만기 사전 확인 · '||p.title when t.task_key like 'relocation:%' then '이전 고객 후속 상담 · '||p.title when t.task_key like 'vacancy_review:%' then '퇴거·재임대 확인 · '||p.title else '계약 고객 재연락 · '||p.title end as title,
 t.scheduled_date as due_date,case when t.relocation_case_id is not null then '/dashboard/relocations/'||t.relocation_case_id else '/dashboard/expiration/'||c.id end as href
 from public.expiration_tasks t join public.contracts c on c.id=t.contract_id and c.office_id=t.office_id join public.properties p on p.id=c.property_id and p.office_id=c.office_id
 where t.status in ('pending','in_progress') and c.deleted_at is null
 union all
 select 'closing:'||c.id||':'||c.closing_date,c.office_id,c.assigned_staff_id,'closing','잔금 예정 · '||p.title,c.closing_date,'/dashboard/contracts/'||c.id
 from public.contracts c join public.properties p on p.id=c.property_id and p.office_id=c.office_id where c.deleted_at is null and c.status in ('signed','active') and c.closing_date>=(clock_timestamp() at time zone 'Asia/Seoul')::date
 union all
 select 'customer:'||c.id||':'||c.next_contact_at,c.office_id,c.assigned_staff_id,'customer_contact','고객 재연락 · '||c.name,(c.next_contact_at at time zone 'Asia/Seoul')::date,'/dashboard/customers/'||c.id from public.customers c where c.deleted_at is null and c.status='active' and c.next_contact_at is not null
 union all
 select 'property:'||p.id||':'||coalesce(p.next_confirmation_date,(p.last_confirmed_at at time zone 'Asia/Seoul')::date+30,(p.created_at at time zone 'Asia/Seoul')::date),p.office_id,p.assigned_staff_id,'property_recheck','매물 재확인 · '||p.title,coalesce(p.next_confirmation_date,(p.last_confirmed_at at time zone 'Asia/Seoul')::date+30,(p.created_at at time zone 'Asia/Seoul')::date),'/dashboard/properties/'||p.id from public.properties p where p.deleted_at is null and p.status<>'closed'
 union all
 select 'renewal:'||c.id||':'||f.version,c.office_id,c.assigned_staff_id,'renewal_pending','계약 갱신 확인 · '||p.title,coalesce((f.next_contact_at at time zone 'Asia/Seoul')::date,c.lease_end_date),'/dashboard/expiration/'||c.id from public.contract_followups f join public.contracts c on c.id=f.contract_id and c.office_id=f.office_id join public.properties p on p.id=c.property_id and p.office_id=c.office_id where f.result='renew' and f.resolution_status='open' and c.deleted_at is null and c.status in ('signed','active') and not exists(select 1 from public.contract_renewals r where r.source_contract_id=c.id and r.office_id=c.office_id);
revoke all on public.notification_directory from public,anon;grant select on public.notification_directory to authenticated;
create function public.operations_notifications(p_assigned uuid default null,p_page integer default 1,p_state text default 'unread',p_kind text default 'all') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;today date=(statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
 if p_page not between 1 and 100000 or p_state not in ('all','unread','read','dismissed') or p_kind not in ('all','expiration','closing','customer_contact','relocation_contact','property_recheck','renewal_pending') then raise exception 'Invalid filters' using errcode='22023';end if;
 if p_assigned is not null and not exists(select 1 from public.staff where id=p_assigned and office_id=private.office_id()) then raise exception 'Office staff required' using errcode='42501';end if;
 with notices as materialized(
  select n.*,coalesce(r.state,'unread') as state from public.notification_directory n left join public.notification_receipts r on r.office_id=n.office_id and r.staff_id=private.staff_id() and r.notice_key=n.notice_key where n.office_id=private.office_id() and (p_assigned is null or n.assigned_staff_id=p_assigned) and n.due_date<=today+7 and (p_kind='all' or n.kind=p_kind)
 ),filtered as(select * from notices where p_state='all' or state=p_state),paged as(select * from filtered order by (due_date<today) desc,due_date,notice_key offset (p_page-1)*20 limit 20)
 select jsonb_build_object('total',(select count(*) from filtered),'unread',(select count(*) from notices where state='unread'),'items',coalesce((select jsonb_agg(to_jsonb(p) order by (p.due_date<today) desc,p.due_date,p.notice_key) from paged p),'[]'::jsonb),'today',today) into result;return result;
end$$;
revoke all on function public.operations_notifications(uuid,integer,text,text) from public,anon;grant execute on function public.operations_notifications(uuid,integer,text,text) to authenticated;

create function public.operations_statistics(p_from date,p_to date,p_assigned uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>731 then raise exception 'Select up to 24 months' using errcode='22023';end if;
 if p_assigned is not null and not exists(select 1 from public.staff where id=p_assigned and office_id=private.office_id()) then raise exception 'Office staff required' using errcode='42501';end if;
 with contracts as materialized(select c.*,p.property_type from public.contracts c join public.properties p on p.id=c.property_id and p.office_id=c.office_id where c.office_id=private.office_id() and c.deleted_at is null and c.status in ('signed','active','completed','terminated') and (p_assigned is null or c.assigned_staff_id=p_assigned) and coalesce(c.contract_date,c.signed_at) between p_from and p_to),
 monthly as(select to_char(m,'YYYY-MM') as month,(select count(*) from contracts c where date_trunc('month',coalesce(c.contract_date,c.signed_at))=m) as count from generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),'1 month') m),
 types as(select contract_type as type,count(*) as count from contracts group by contract_type),property_types as(select property_type as type,count(*) as count from contracts group by property_type),staff_counts as(select s.id,s.display_name,count(c.id) as total,count(c.id) filter(where c.status in ('signed','active')) as ongoing from public.staff s left join contracts c on c.assigned_staff_id=s.id where s.office_id=private.office_id() and (p_assigned is null or s.id=p_assigned) group by s.id,s.display_name),
 payments as(select p.* from public.contract_payments p join public.contracts c on c.id=p.contract_id and c.office_id=p.office_id where p.office_id=private.office_id() and p.paid_on between p_from and p_to and (p_assigned is null or c.assigned_staff_id=p_assigned)),
 balance as(select c.id,c.brokerage_fee_krw,coalesce(sum(case p.direction when 'receipt' then p.amount_krw else -p.amount_krw end),0) net from contracts c left join public.contract_payments p on p.contract_id=c.id and p.office_id=c.office_id group by c.id,c.brokerage_fee_krw),
 tasks as(select t.* from public.expiration_tasks t where t.office_id=private.office_id() and t.scheduled_date between p_from and p_to and t.status<>'cancelled' and (p_assigned is null or t.assigned_staff_id=p_assigned)),
 endings as(select distinct e.contract_id,e.new_values->>'status' as status from public.contract_events e join public.contracts c on c.id=e.contract_id and c.office_id=e.office_id where e.office_id=private.office_id() and e.event_type='updated' and (e.event_date at time zone 'Asia/Seoul')::date between p_from and p_to and e.new_values->>'status' in ('completed','terminated') and e.old_values->>'status' is distinct from e.new_values->>'status' and (p_assigned is null or c.assigned_staff_id=p_assigned))
 select jsonb_build_object('from',p_from,'to',p_to,'total',(select count(*) from contracts),'monthly',(select jsonb_agg(to_jsonb(m) order by month) from monthly m),'types',coalesce((select jsonb_agg(to_jsonb(t)) from types t),'[]'::jsonb),'property_types',coalesce((select jsonb_agg(to_jsonb(t)) from property_types t),'[]'::jsonb),'staff',(select jsonb_agg(to_jsonb(s) order by display_name) from staff_counts s),
 'renewals',(select count(*) from public.contract_renewals r join public.contracts c on c.id=r.renewed_contract_id and c.office_id=r.office_id where r.office_id=private.office_id() and r.processed_at between p_from and p_to and (p_assigned is null or c.assigned_staff_id=p_assigned)),
 'completed',(select count(*) from endings where status='completed'),'terminated',(select count(*) from endings where status='terminated'),
 'relocation_conversions',(select count(distinct l.new_contract_id) from public.relocation_contract_links l join public.contracts c on c.id=l.new_contract_id and c.office_id=l.office_id join public.relocation_cases r on r.id=l.relocation_case_id and r.office_id=l.office_id where l.office_id=private.office_id() and (l.created_at at time zone 'Asia/Seoul')::date between p_from and p_to and c.deleted_at is null and c.status in ('signed','active','completed','terminated') and (p_assigned is null or r.assigned_staff_id=p_assigned)),
 'tasks',jsonb_build_object('total',(select count(*) from tasks),'completed',(select count(*) from tasks where status='completed')),
 'brokerage',jsonb_build_object('unconfirmed',(select count(*) from contracts where brokerage_fee_krw is null),'agreed',(select coalesce(sum(brokerage_fee_krw),0) from contracts),'received',(select coalesce(sum(amount_krw) filter(where direction='receipt'),0) from payments),'refunded',(select coalesce(sum(amount_krw) filter(where direction='refund'),0) from payments),'outstanding',(select coalesce(sum(greatest(coalesce(brokerage_fee_krw,0)-net,0)),0) from balance),'overpaid',(select coalesce(sum(greatest(net-coalesce(brokerage_fee_krw,0),0)),0) from balance))) into result;return result;
end$$;
revoke all on function public.operations_statistics(date,date,uuid) from public,anon;grant execute on function public.operations_statistics(date,date,uuid) to authenticated;
create function public.contract_financial_summary(p_contract uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('agreed',c.brokerage_fee_krw,'received',coalesce(sum(p.amount_krw) filter(where p.direction='receipt'),0),'refunded',coalesce(sum(p.amount_krw) filter(where p.direction='refund'),0),'net',coalesce(sum(case p.direction when 'receipt' then p.amount_krw else -p.amount_krw end),0),'count',count(p.id)) from public.contracts c left join public.contract_payments p on p.contract_id=c.id and p.office_id=c.office_id where c.id=p_contract and c.office_id=private.office_id() group by c.id,c.brokerage_fee_krw
$$;
revoke all on function public.contract_financial_summary(uuid) from public,anon;grant execute on function public.contract_financial_summary(uuid) to authenticated;
create function private.check_party_customer(p_office uuid,p_customer uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if p_office is distinct from private.office_id() or private.staff_id() is null then raise exception 'Office denied' using errcode='42501';end if;
 select c.version into v from public.customers c where c.id=p_customer and c.office_id=p_office and (c.deleted_at is null or exists(select 1 from public.contract_parties cp where cp.customer_id=c.id and cp.office_id=c.office_id)) for share of c;
 if v is null then raise exception 'Customer unavailable' using errcode='23503';end if;
 if p_version is not null and v<>p_version then raise exception 'Customer version changed' using errcode='40001';end if;
end$$;
revoke all on function private.check_party_customer(uuid,uuid,integer) from public,anon;grant execute on function private.check_party_customer(uuid,uuid,integer) to authenticated;
create or replace function public.save_contract(p_id uuid,p_version integer,p_data jsonb,p_parties jsonb,p_property_status text default null,p_property_version integer default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare cid uuid;v public.contracts;sid uuid;oid uuid;primary_customer uuid;party jsonb;
begin
 sid=private.staff_id();oid=private.office_id();if sid is null then raise exception 'Membership required' using errcode='42501';end if;
 if jsonb_typeof(p_parties)<>'array' or jsonb_array_length(p_parties)<1 or jsonb_array_length(p_parties)>30 then raise exception '1..30 parties required' using errcode='23514';end if;
 for party in select value from jsonb_array_elements(p_parties) order by value->>'customer_id' loop
  perform private.check_party_customer(oid,(party->>'customer_id')::uuid,(party->>'customer_version')::integer);
 end loop;
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
alter table public.contract_followups add column review_checks jsonb not null default '{}'::jsonb,
 add column review_note text not null default '' check(length(review_note)<=2000),
 add constraint review_checks_shape check(jsonb_typeof(review_checks)='object' and review_checks-array['applicable_law','notice_evidence','renewal_history','occupancy_settlement','special_terms']='{}'::jsonb and not jsonb_path_exists(review_checks,'$.* ? (@.type() != "boolean")'));
grant update(review_checks,review_note) on public.contract_followups to authenticated;
commit;
