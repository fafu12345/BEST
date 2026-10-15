begin;
create table public.contract_followups(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),contract_id uuid not null,assigned_staff_id uuid not null,
 result text not null default 'unconfirmed' check(result in ('unconfirmed','renew','relocate','move_out','negotiating','ended')),
 notice_status text not null default 'unchecked' check(notice_status in ('unchecked','notified','negotiating','agreed')),
 resolution_status text not null default 'open' check(resolution_status in ('open','resolved')),resolution_note text not null default '' check(length(resolution_note)<=2000),
 next_contact_at timestamptz,expected_move_out_date date,actual_move_out_date date,
 deposit_settlement text not null default 'unchecked' check(deposit_settlement in ('unchecked','pending','confirmed')),recruiting boolean not null default false,
 vacancy_reviewed_at timestamptz,vacancy_review_note text not null default '' check(length(vacancy_review_note)<=2000),
 latest_contact_id uuid,contact_customer_id uuid,contact_at timestamptz,contact_method text check(contact_method in ('phone','visit','email','message','other')),contact_summary text not null default '' check(length(contact_summary)<=10000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(office_id,contract_id),unique(office_id,id),foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,assigned_staff_id) references public.staff(office_id,id),foreign key(office_id,contact_customer_id) references public.customers(office_id,id),
 check(latest_contact_id is null or (contact_customer_id is not null and contact_at is not null and contact_method is not null and length(trim(contact_summary))>0)),
 check(resolution_status='open' or length(trim(resolution_note))>0)
);
create table public.relocation_cases(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),contract_id uuid not null,customer_id uuid not null,assigned_staff_id uuid not null,
 reason text not null default '' check(length(reason)<=2000),desired_region text not null default '' check(length(desired_region)<=500),desired_area_m2 numeric(12,2) check(desired_area_m2>0),
 deposit_budget_krw numeric(16,0) check(deposit_budget_krw between 0 and 9000000000000000),rent_budget_krw numeric(16,0) check(rent_budget_krw between 0 and 9000000000000000),
 available_from date,status text not null default 'open' check(status in ('open','searching','viewing','contracted','closed','cancelled')),selected_property_id uuid,next_contact_at timestamptz,notes text not null default '' check(length(notes)<=10000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(office_id,id),unique(office_id,contract_id,id),
 foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,customer_id) references public.customers(office_id,id),foreign key(office_id,assigned_staff_id) references public.staff(office_id,id),foreign key(office_id,selected_property_id) references public.properties(office_id,id)
);
create unique index relocation_open_unique on public.relocation_cases(office_id,contract_id,customer_id) where status not in ('closed','cancelled','contracted');
create table public.expiration_tasks(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),contract_id uuid not null,assigned_staff_id uuid not null,
 task_key text not null,relocation_case_id uuid,reminder_days integer check(reminder_days between -3650 and 3650),base_end_date date,scheduled_date date not null,
 status text not null default 'pending' check(status in ('pending','in_progress','completed','cancelled')),completed_at timestamptz,completion_note text not null default '' check(length(completion_note)<=2000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(office_id,contract_id,task_key),unique(office_id,id),foreign key(office_id,contract_id) references public.contracts(office_id,id),foreign key(office_id,assigned_staff_id) references public.staff(office_id,id),
 foreign key(office_id,contract_id,relocation_case_id) references public.relocation_cases(office_id,contract_id,id),
 check(task_key in ('180','90','60','30') or task_key~'^(followup|vacancy_review):[0-9]+$' or (relocation_case_id is not null and task_key~('^relocation:'||relocation_case_id::text||':[0-9]+$'))),
 check((status='completed')=(completed_at is not null)),check((task_key in ('180','90','60','30'))=(reminder_days is not null))
);
create table public.contract_renewals(
 id uuid primary key default gen_random_uuid(),office_id uuid not null references public.offices(id),source_contract_id uuid not null,renewed_contract_id uuid not null,
 renewal_type text not null check(renewal_type in ('same_terms','written')),processed_at date not null,renewal_number integer not null check(renewal_number>0),old_terms jsonb not null,new_terms jsonb not null,created_at timestamptz not null default now(),
 unique(office_id,source_contract_id),unique(office_id,renewed_contract_id),foreign key(office_id,source_contract_id) references public.contracts(office_id,id),foreign key(office_id,renewed_contract_id) references public.contracts(office_id,id),check(source_contract_id<>renewed_contract_id)
);
create index expiration_due_idx on public.expiration_tasks(office_id,status,scheduled_date,assigned_staff_id);
create index expiration_contract_idx on public.expiration_tasks(office_id,contract_id);
create index followups_next_idx on public.contract_followups(office_id,resolution_status,next_contact_at);
create index relocation_staff_idx on public.relocation_cases(office_id,assigned_staff_id,status,next_contact_at);
create index relocation_customer_idx on public.relocation_cases(office_id,customer_id,contract_id);
-- Public reads are caller-scoped; no business data is exposed to anon.
alter table public.contract_followups enable row level security;
alter table public.expiration_tasks enable row level security;
alter table public.relocation_cases enable row level security;
alter table public.contract_renewals enable row level security;
revoke all on public.contract_followups,public.expiration_tasks,public.relocation_cases,public.contract_renewals from public,anon,authenticated;
grant all on public.contract_followups,public.expiration_tasks,public.relocation_cases,public.contract_renewals to service_role;
grant select on public.contract_followups,public.expiration_tasks,public.relocation_cases,public.contract_renewals to authenticated;
grant update(result,notice_status,resolution_status,resolution_note,next_contact_at,expected_move_out_date,actual_move_out_date,deposit_settlement,recruiting,vacancy_reviewed_at,vacancy_review_note,latest_contact_id,contact_customer_id,contact_at,contact_method,contact_summary) on public.contract_followups to authenticated;
grant update(reminder_days,scheduled_date,status,completion_note) on public.expiration_tasks to authenticated;
grant insert on public.relocation_cases to authenticated;
grant update(reason,desired_region,desired_area_m2,deposit_budget_krw,rent_budget_krw,available_from,status,selected_property_id,next_contact_at,notes,assigned_staff_id) on public.relocation_cases to authenticated;
grant insert(office_id,source_contract_id,renewed_contract_id,renewal_type,processed_at) on public.contract_renewals to authenticated;
do $$declare t text;begin
 foreach t in array array['contract_followups','expiration_tasks','relocation_cases'] loop
  execute format('create policy office_read on public.%I for select to authenticated using(office_id=(select private.office_id()))',t);
  execute format('create policy staff_update on public.%I for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())))',t);
 end loop;
end$$;
create policy relocation_insert on public.relocation_cases for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())) and exists(select 1 from public.contracts c where c.id=contract_id and c.office_id=relocation_cases.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));
create policy renewal_read on public.contract_renewals for select to authenticated using(office_id=(select private.office_id()));
create policy renewal_insert on public.contract_renewals for insert to authenticated with check(office_id=(select private.office_id()) and exists(select 1 from public.contracts c where c.id=source_contract_id and c.office_id=contract_renewals.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))) and exists(select 1 from public.contracts c where c.id=renewed_contract_id and c.office_id=contract_renewals.office_id and c.deleted_at is null and ((select private.is_manager()) or c.assigned_staff_id=(select private.staff_id()))));

create function private.guard_expiration_row() returns trigger language plpgsql set search_path='' as $$
declare contract_row public.contracts;
begin
 if pg_trigger_depth()=1 and not exists(select 1 from public.contracts where id=new.contract_id and office_id=new.office_id and deleted_at is null) then raise exception 'Contract unavailable' using errcode='42501';end if;
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.office_id<>old.office_id or new.contract_id<>old.contract_id then raise exception 'Workflow identity immutable' using errcode='42501';end if;
  if TG_TABLE_NAME='expiration_tasks' then
   if old.status='completed' then raise exception 'Completed task immutable' using errcode='42501';end if;
   if new.task_key<>old.task_key or new.relocation_case_id is distinct from old.relocation_case_id then raise exception 'Task identity immutable' using errcode='42501';end if;
   if new.reminder_days is not null then
    select * into contract_row from public.contracts where id=new.contract_id and office_id=new.office_id;
    if contract_row.lease_end_date is not null then
    if new.scheduled_date is distinct from old.scheduled_date and new.reminder_days=old.reminder_days and pg_trigger_depth()=1 then new.reminder_days=contract_row.lease_end_date-new.scheduled_date;end if;
    new.base_end_date=contract_row.lease_end_date;new.scheduled_date=contract_row.lease_end_date-new.reminder_days;
    else new.base_end_date=old.base_end_date;new.scheduled_date=old.scheduled_date;new.reminder_days=old.reminder_days;end if;
   end if;
   new.completed_at=case when new.status='completed' then clock_timestamp() else null end;
  elsif TG_TABLE_NAME='relocation_cases' then
   if new.customer_id<>old.customer_id then raise exception 'Relocation customer immutable' using errcode='42501';end if;
   if new.assigned_staff_id<>old.assigned_staff_id and not private.is_manager() then raise exception 'Only manager may reassign' using errcode='42501';end if;
  elsif TG_TABLE_NAME='contract_followups' then
   if (new.latest_contact_id is not distinct from old.latest_contact_id) and (new.contact_customer_id is distinct from old.contact_customer_id or new.contact_at is distinct from old.contact_at or new.contact_method is distinct from old.contact_method or new.contact_summary is distinct from old.contact_summary) then raise exception 'Use a new contact record' using errcode='23514';end if;
   if new.actual_move_out_date>(clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'Actual move-out cannot be in the future' using errcode='23514';end if;
   if new.vacancy_reviewed_at is not null and new.vacancy_reviewed_at is distinct from old.vacancy_reviewed_at then
    if new.actual_move_out_date is null or length(trim(new.vacancy_review_note))=0 or not exists(select 1 from public.properties p join public.contracts c on c.property_id=p.id and c.office_id=p.office_id where c.id=new.contract_id and c.office_id=new.office_id and p.deleted_at is null and (private.is_manager() or p.assigned_staff_id=private.staff_id())) then raise exception 'Vacancy/property review denied' using errcode='42501';end if;new.vacancy_reviewed_at=clock_timestamp();
   end if;
   if new.actual_move_out_date is distinct from old.actual_move_out_date or new.expected_move_out_date is distinct from old.expected_move_out_date then new.vacancy_reviewed_at=null;end if;
  end if;
  new.version=old.version+1;new.updated_at=clock_timestamp();new.created_at=old.created_at;
 else new.version=1;new.updated_at=clock_timestamp();new.created_at=clock_timestamp();end if;
 if TG_TABLE_NAME='contract_followups' then
  if new.contact_customer_id is not null and not exists(select 1 from public.contract_parties cp where cp.contract_id=new.contract_id and cp.office_id=new.office_id and cp.customer_id=new.contact_customer_id) then raise exception 'Contact must be a contract party' using errcode='23503';end if;
 elsif TG_TABLE_NAME='relocation_cases' then
  if not exists(select 1 from public.contract_parties cp where cp.contract_id=new.contract_id and cp.office_id=new.office_id and cp.customer_id=new.customer_id) then raise exception 'Relocation customer must be a contract party' using errcode='23503';end if;
  if new.selected_property_id is not null and (TG_OP='INSERT' or new.selected_property_id is distinct from old.selected_property_id) and not exists(select 1 from public.properties p where p.id=new.selected_property_id and p.office_id=new.office_id and p.deleted_at is null) then raise exception 'Active office property required' using errcode='23503';end if;
 end if;
 if not exists(select 1 from public.staff where id=new.assigned_staff_id and office_id=new.office_id and active) then
  if (TG_TABLE_NAME='relocation_cases' and (TG_OP='INSERT' or new.assigned_staff_id is distinct from old.assigned_staff_id)) or (TG_TABLE_NAME<>'relocation_cases' and not exists(select 1 from public.contracts c where c.id=new.contract_id and c.office_id=new.office_id and c.assigned_staff_id=new.assigned_staff_id)) then raise exception 'Active office staff required' using errcode='23503';end if;
 end if;
 return new;
end$$;
revoke all on function private.guard_expiration_row() from public;
create trigger workflow_guard before insert or update on public.contract_followups for each row execute function private.guard_expiration_row();
create trigger workflow_guard before insert or update on public.expiration_tasks for each row execute function private.guard_expiration_row();
create trigger workflow_guard before insert or update on public.relocation_cases for each row execute function private.guard_expiration_row();
-- Narrow audit writers; callers cannot alter or delete the resulting events.
create function private.expiration_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare typ text;payload jsonb;begin
 typ=case TG_TABLE_NAME when 'expiration_tasks' then 'expiration_task' when 'relocation_cases' then 'relocation_updated' else 'followup_updated' end;
 if TG_TABLE_NAME='contract_followups' and TG_OP='UPDATE' then
  if new.latest_contact_id is distinct from old.latest_contact_id then typ='expiration_contact';end if;
 end if;
 payload=to_jsonb(new);if typ='expiration_contact' then payload=payload||jsonb_build_object('contact_name_snapshot',(select cp.name_snapshot from public.contract_parties cp where cp.contract_id=new.contract_id and cp.office_id=new.office_id and cp.customer_id=new.contact_customer_id limit 1));end if;
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,old_values,new_values)
 values(new.office_id,new.contract_id,typ,case typ when 'expiration_contact' then '만기 고객 연락 기록' when 'expiration_task' then '만기·후속 업무 변경' when 'relocation_updated' then '이전 희망조건 변경' else '만기·퇴거 현황 변경' end,private.staff_id(),case when TG_OP='UPDATE' then to_jsonb(old) else null end,payload);
 return new;
end$$;
revoke all on function private.expiration_audit() from public;
create trigger workflow_audit after insert or update on public.contract_followups for each row execute function private.expiration_audit();
create trigger workflow_audit after insert or update on public.expiration_tasks for each row execute function private.expiration_audit();
create trigger workflow_audit after insert or update on public.relocation_cases for each row execute function private.expiration_audit();

create function private.sync_expiration(p_contract uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.contracts;days integer;eligible boolean;
begin
 select * into c from public.contracts where id=p_contract;
 if not found then return;end if;
 if c.contract_type in ('jeonse','monthly_rent') and c.deleted_at is null then
  insert into public.contract_followups(office_id,contract_id,assigned_staff_id) values(c.office_id,c.id,c.assigned_staff_id) on conflict(office_id,contract_id) do update set assigned_staff_id=excluded.assigned_staff_id where contract_followups.assigned_staff_id<>excluded.assigned_staff_id;
 end if;
 eligible=c.contract_type in ('jeonse','monthly_rent') and c.status in ('signed','active') and c.deleted_at is null and c.lease_end_date is not null and exists(select 1 from public.contract_followups f where f.contract_id=c.id and f.resolution_status='open');
 if eligible then
  foreach days in array array[180,90,60,30] loop
   insert into public.expiration_tasks(office_id,contract_id,assigned_staff_id,task_key,reminder_days,base_end_date,scheduled_date)
   values(c.office_id,c.id,c.assigned_staff_id,days::text,days,c.lease_end_date,c.lease_end_date-days)
   on conflict(office_id,contract_id,task_key) do update set assigned_staff_id=excluded.assigned_staff_id,base_end_date=c.lease_end_date,scheduled_date=c.lease_end_date-expiration_tasks.reminder_days,status=case when expiration_tasks.status='cancelled' then 'pending' else expiration_tasks.status end
   where expiration_tasks.status<>'completed' and (expiration_tasks.assigned_staff_id<>excluded.assigned_staff_id or expiration_tasks.base_end_date is distinct from c.lease_end_date or expiration_tasks.scheduled_date is distinct from c.lease_end_date-expiration_tasks.reminder_days or expiration_tasks.status='cancelled');
  end loop;
 else
  update public.expiration_tasks set status='cancelled' where contract_id=c.id and status in ('pending','in_progress') and task_key in ('180','90','60','30');
 end if;
 update public.expiration_tasks set assigned_staff_id=c.assigned_staff_id where contract_id=c.id and relocation_case_id is null and status<>'completed' and assigned_staff_id<>c.assigned_staff_id;
end$$;
revoke all on function private.sync_expiration(uuid) from public;
create function private.contract_expiration_changed() returns trigger language plpgsql security definer set search_path='' as $$begin if TG_OP='UPDATE' then if old.contract_type is not null and new.contract_type is null then raise exception 'Confirmed contract type cannot become unknown' using errcode='23514';end if;end if;perform private.sync_expiration(new.id);return new;end$$;
revoke all on function private.contract_expiration_changed() from public;
create trigger contract_expiration_changed after insert or update on public.contracts for each row execute function private.contract_expiration_changed();

create function private.followup_tasks_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.resolution_status is distinct from old.resolution_status then perform private.sync_expiration(new.contract_id);end if;
  if new.resolution_status='resolved' then update public.expiration_tasks set status='cancelled' where contract_id=new.contract_id and relocation_case_id is null and status in ('pending','in_progress');end if;
  if new.next_contact_at is distinct from old.next_contact_at or new.latest_contact_id is distinct from old.latest_contact_id or new.resolution_status is distinct from old.resolution_status then
   update public.expiration_tasks set status='cancelled' where contract_id=new.contract_id and task_key like 'followup:%' and status in ('pending','in_progress');
   if new.next_contact_at is not null and new.resolution_status='open' then
    insert into public.expiration_tasks(office_id,contract_id,assigned_staff_id,task_key,scheduled_date) values(new.office_id,new.contract_id,new.assigned_staff_id,'followup:'||new.version::text,(new.next_contact_at at time zone 'Asia/Seoul')::date) on conflict do nothing;
   end if;
  end if;
  if new.vacancy_reviewed_at is not null then update public.expiration_tasks set status='completed',completion_note=new.vacancy_review_note where contract_id=new.contract_id and task_key like 'vacancy_review:%' and status in ('pending','in_progress');
  elsif new.expected_move_out_date is distinct from old.expected_move_out_date or new.actual_move_out_date is distinct from old.actual_move_out_date then
   update public.expiration_tasks set status='cancelled' where contract_id=new.contract_id and task_key like 'vacancy_review:%' and status in ('pending','in_progress');
   if coalesce(new.actual_move_out_date,new.expected_move_out_date) is not null then insert into public.expiration_tasks(office_id,contract_id,assigned_staff_id,task_key,scheduled_date) values(new.office_id,new.contract_id,new.assigned_staff_id,'vacancy_review:'||new.version::text,coalesce(new.actual_move_out_date,new.expected_move_out_date)) on conflict do nothing;end if;
  end if;
 end if;
 return new;
end$$;
revoke all on function private.followup_tasks_changed() from public;
create trigger followup_tasks_changed after insert or update on public.contract_followups for each row execute function private.followup_tasks_changed();
create function private.relocation_tasks_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  update public.expiration_tasks set assigned_staff_id=new.assigned_staff_id where relocation_case_id=new.id and status<>'completed' and assigned_staff_id<>new.assigned_staff_id;
  if new.next_contact_at is not distinct from old.next_contact_at and new.status is not distinct from old.status then return new;end if;
 end if;
 update public.expiration_tasks set status='cancelled' where relocation_case_id=new.id and status in ('pending','in_progress');
 if new.next_contact_at is not null and new.status in ('open','searching','viewing') then
  insert into public.expiration_tasks(office_id,contract_id,assigned_staff_id,task_key,relocation_case_id,scheduled_date) values(new.office_id,new.contract_id,new.assigned_staff_id,'relocation:'||new.id::text||':'||new.version::text,new.id,(new.next_contact_at at time zone 'Asia/Seoul')::date) on conflict do nothing;
 end if;
 return new;
end$$;
revoke all on function private.relocation_tasks_changed() from public;
create trigger relocation_tasks_changed after insert or update on public.relocation_cases for each row execute function private.relocation_tasks_changed();
create function private.guard_renewal() returns trigger language plpgsql set search_path='' as $$
declare a public.contracts;b public.contracts;n integer;
begin
 select * into a from public.contracts where id=new.source_contract_id and office_id=new.office_id for update;
 select * into b from public.contracts where id=new.renewed_contract_id and office_id=new.office_id;
 if a.id is null or b.id is null or a.property_id<>b.property_id or b.previous_contract_id is distinct from a.id or (a.contract_type is null or a.contract_type not in ('jeonse','monthly_rent')) or a.lease_end_date is null or b.lease_end_date is null or a.status not in ('signed','active','completed','terminated') or b.contract_type not in ('jeonse','monthly_rent') or b.status not in ('signed','active') or b.lease_end_date<=a.lease_end_date or a.deleted_at is not null or b.deleted_at is not null then raise exception 'Invalid renewal relationship/period' using errcode='23514';end if;
 if new.renewal_type='same_terms' and (a.contract_type<>b.contract_type or a.deposit_krw<>b.deposit_krw or a.rent_krw<>b.rent_krw or a.maintenance_fee_krw<>b.maintenance_fee_krw or exists((select customer_id,role from public.contract_parties where contract_id=a.id except select customer_id,role from public.contract_parties where contract_id=b.id) union all (select customer_id,role from public.contract_parties where contract_id=b.id except select customer_id,role from public.contract_parties where contract_id=a.id))) then raise exception 'Same terms renewal must retain terms and parties' using errcode='23514';end if;
 with recursive chain as(select id,previous_contract_id,1 as depth,array[id] as seen from public.contracts where id=a.id union all select c.id,c.previous_contract_id,ch.depth+1,ch.seen||c.id from public.contracts c join chain ch on c.id=ch.previous_contract_id where not c.id=any(ch.seen)) select max(depth) into n from chain;
 new.renewal_number=n;
 new.old_terms=jsonb_build_object('contract_type',a.contract_type,'deposit_krw',a.deposit_krw,'rent_krw',a.rent_krw,'maintenance_fee_krw',a.maintenance_fee_krw,'brokerage_fee_krw',a.brokerage_fee_krw,'lease_start_date',a.lease_start_date,'lease_end_date',a.lease_end_date);
 new.new_terms=jsonb_build_object('contract_type',b.contract_type,'deposit_krw',b.deposit_krw,'rent_krw',b.rent_krw,'maintenance_fee_krw',b.maintenance_fee_krw,'brokerage_fee_krw',b.brokerage_fee_krw,'lease_start_date',b.lease_start_date,'lease_end_date',b.lease_end_date);
 new.created_at=clock_timestamp();return new;
end$$;
revoke all on function private.guard_renewal() from public;
create trigger renewal_guard before insert on public.contract_renewals for each row execute function private.guard_renewal();
create function private.renewal_completed() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.contract_followups set result='renew',resolution_status='resolved',resolution_note='갱신 계약 연결 완료' where contract_id=new.source_contract_id and office_id=new.office_id;
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,old_values,new_values) values(new.office_id,new.source_contract_id,'renewal_created','갱신·재계약 연결',private.staff_id(),new.old_terms,to_jsonb(new));
 insert into public.contract_events(office_id,contract_id,event_type,description,actor_id,new_values) values(new.office_id,new.renewed_contract_id,'renewal_origin','갱신 원본 연결',private.staff_id(),to_jsonb(new));return new;
end$$;
revoke all on function private.renewal_completed() from public;
create trigger renewal_completed after insert on public.contract_renewals for each row execute function private.renewal_completed();
create function public.renew_contract(p_source uuid,p_version integer,p_data jsonb,p_parties jsonb,p_type text,p_processed_at date) returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.contracts;cid uuid;
begin
 select * into a from public.contracts where id=p_source and office_id=private.office_id() and deleted_at is null for update;
 if not found or not(private.is_manager() or a.assigned_staff_id=private.staff_id()) then raise exception 'Renewal denied' using errcode='42501';end if;
 if a.version<>p_version then raise exception 'Stale contract' using errcode='40001';end if;
 if exists(select 1 from public.contract_renewals where source_contract_id=a.id and office_id=a.office_id) then raise exception 'Already renewed' using errcode='23505';end if;
 cid=public.save_contract(null,null,p_data||jsonb_build_object('property_id',a.property_id,'previous_contract_id',a.id,'contract_number',''),p_parties,null,null);
 insert into public.contract_renewals(office_id,source_contract_id,renewed_contract_id,renewal_type,processed_at) values(a.office_id,a.id,cid,p_type,p_processed_at);
 return cid;
end$$;
revoke all on function public.renew_contract(uuid,integer,jsonb,jsonb,text,date) from public;
grant execute on function public.renew_contract(uuid,integer,jsonb,jsonb,text,date) to authenticated;
create function public.review_reletting(p_contract uuid,p_version integer,p_property_version integer,p_status text,p_note text) returns void language plpgsql security invoker set search_path='' as $$
declare f public.contract_followups;pid uuid;
begin
 select * into f from public.contract_followups where contract_id=p_contract and office_id=private.office_id() for update;
 if not found or not(private.is_manager() or f.assigned_staff_id=private.staff_id()) then raise exception 'Review denied' using errcode='42501';end if;
 if f.version<>p_version then raise exception 'Stale workflow' using errcode='40001';end if;
 select property_id into pid from public.contracts where id=p_contract and deleted_at is null;
 update public.properties set status=p_status where id=pid and office_id=f.office_id and version=p_property_version and deleted_at is null;
 if not found then raise exception 'Property review permission/stale version' using errcode='40001';end if;
 update public.contract_followups set vacancy_reviewed_at=clock_timestamp(),vacancy_review_note=p_note where id=f.id;
end$$;
revoke all on function public.review_reletting(uuid,integer,integer,text,text) from public;
grant execute on function public.review_reletting(uuid,integer,integer,text,text) to authenticated;
-- Existing typed leases receive the same idempotent tasks; no contracts are ended or overwritten.
do $$declare c record;begin for c in select id from public.contracts where contract_type in ('jeonse','monthly_rent') loop perform private.sync_expiration(c.id);end loop;end$$;

create view public.expiration_directory with (security_invoker=true) as
select c.id,c.office_id,c.assigned_staff_id,c.contract_type,c.status,c.lease_start_date,c.lease_end_date,c.property_id,c.version as contract_version,
f.id as workflow_id,f.version as workflow_version,f.result,f.notice_status,f.resolution_status,f.next_contact_at,f.expected_move_out_date,f.actual_move_out_date,f.deposit_settlement,f.recruiting,f.vacancy_reviewed_at,
jsonb_build_object('title',p.title,'building_name',p.building_name,'complex_name',p.complex_name,'building_dong',p.building_dong,'unit_number',p.unit_number) as properties
from public.contracts c join public.contract_followups f on f.contract_id=c.id and f.office_id=c.office_id join public.properties p on p.id=c.property_id and p.office_id=c.office_id
where c.deleted_at is null and c.contract_type in ('jeonse','monthly_rent');
revoke all on public.expiration_directory from public,anon;
grant select on public.expiration_directory to authenticated;
commit;
