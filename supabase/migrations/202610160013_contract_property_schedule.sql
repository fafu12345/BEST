begin;
-- Internal scheduler registry; never exposed through REST or granted to app roles.
create table private.property_contract_schedules(
 property_id uuid primary key references public.properties(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp()
);
revoke all on private.property_contract_schedules from public,anon,authenticated,service_role;
create index contracts_property_schedule_idx on public.contracts(property_id,contract_date desc,created_at desc)
 where deleted_at is null and contract_type is not null and status in ('signed','active','completed') and closing_date is not null;

-- Retain historical dates as-is. Normalize only newly created contracts or explicit schedule edits.
create function private.normalize_contract_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if new.contract_type in ('jeonse','monthly_rent') then
  if TG_OP='INSERT' or row(new.closing_date,new.occupancy_start_date,new.lease_start_date,new.contract_type) is distinct from row(old.closing_date,old.occupancy_start_date,old.lease_start_date,old.contract_type) then
   new.occupancy_start_date=new.closing_date;new.lease_start_date=new.closing_date;
  end if;
 end if;
 if new.contract_type is not null and new.status in ('signed','active') and new.closing_date is null then
  if TG_OP='INSERT' or row(new.status,new.closing_date,new.contract_type) is distinct from row(old.status,old.closing_date,old.contract_type) then
   raise exception 'Closing date required for scheduled contracts' using errcode='23514';
  end if;
 end if;
 -- Lease end dates include that day; sharing the final day also needs an exception.
 if new.contract_type is not null and new.status in ('signed','active') and new.deleted_at is null then
  perform pg_advisory_xact_lock(hashtextextended(new.office_id::text||':'||new.property_id::text,0));
  if length(trim(new.overlap_override_reason))<5 and exists(
   select 1 from public.contracts c where c.office_id=new.office_id and c.property_id=new.property_id and c.id<>new.id and c.deleted_at is null and c.status in ('signed','active')
   and coalesce(c.lease_start_date,c.occupancy_start_date,c.contract_date,c.signed_at,'-infinity'::date)<coalesce(new.lease_end_date+1,new.closing_date+1,'infinity'::date)
   and coalesce(new.lease_start_date,new.occupancy_start_date,new.contract_date,'-infinity'::date)<coalesce(c.lease_end_date+1,c.closing_date+1,'infinity'::date)
  ) then raise exception 'OVERLAP: inclusive lease dates overlap' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function private.normalize_contract_schedule() from public,anon,authenticated,service_role;
create trigger a_contract_schedule_dates before insert or update on public.contracts for each row execute function private.normalize_contract_schedule();

-- System-derived update only. No caller-supplied status, office, or clock is accepted.
-- The contract mutation that invokes this trigger still uses the caller's existing RLS.
create function private.sync_property_contract_status(p_property uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.properties;c public.contracts;target text;today date=(clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
 select * into p from public.properties where id=p_property;
 if not found or p.deleted_at is not null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(p.office_id::text||':'||p.id::text,0));
 select * into p from public.properties where id=p_property for update;
 if p.deleted_at is not null then return;end if;
 select x.* into c from public.contracts x where x.property_id=p.id and x.office_id=p.office_id and x.deleted_at is null
  and x.contract_type is not null and x.status in ('signed','active','completed') and x.contract_date is not null and x.closing_date is not null
  and not exists(select 1 from public.contract_followups f where f.contract_id=x.id and f.office_id=x.office_id and f.vacancy_reviewed_at is not null)
  order by (x.contract_date<=today and x.closing_date>=today) desc,x.contract_date desc,x.created_at desc,x.id desc limit 1;
 if found then
  target=case when today<c.contract_date then 'available' when today<=c.closing_date then 'reserved' else 'closed' end;
 else
  -- An explicit vacancy/reletting review takes precedence over an old closing date.
  if exists(select 1 from public.contracts x join public.contract_followups f on f.contract_id=x.id and f.office_id=x.office_id where x.property_id=p.id and x.office_id=p.office_id and x.deleted_at is null and x.status in ('signed','active','completed') and f.vacancy_reviewed_at is not null) then
   delete from private.property_contract_schedules where property_id=p.id;return;
  end if;
  target='available';
 end if;
 if p.status is distinct from target then update public.properties set status=target where id=p.id and office_id=p.office_id and deleted_at is null;end if;
end $$;
revoke all on function private.sync_property_contract_status(uuid) from public,anon,authenticated,service_role;

create function private.contract_property_schedule_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 pid=case when TG_OP='DELETE' then old.property_id else new.property_id end;
 if TG_OP<>'DELETE' and new.contract_type is not null and new.status in ('signed','active','completed') and new.contract_date is not null and new.closing_date is not null then
  insert into private.property_contract_schedules(property_id) values(pid) on conflict do nothing;
 end if;
 if exists(select 1 from private.property_contract_schedules where property_id=pid) then perform private.sync_property_contract_status(pid);end if;
 return null;
end $$;
revoke all on function private.contract_property_schedule_changed() from public,anon,authenticated,service_role;
create trigger contract_property_schedule_changed after insert or delete or update of status,contract_date,closing_date,deleted_at,contract_type on public.contracts for each row execute function private.contract_property_schedule_changed();

-- A former employee's existing assignment must not block system date transitions.
-- New assignments still require an active employee; RLS and reassignment rules are unchanged.
create or replace function private.guard_property_change() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.office_id<>old.office_id then raise exception 'office_id is immutable' using errcode='42501';end if;
  if new.id<>old.id then raise exception 'Property id is immutable' using errcode='42501';end if;
  new.version=old.version+1;
  if new.deleted_at is distinct from old.deleted_at then new.deleted_at=clock_timestamp();end if;
 end if;
 if auth.uid() is not null and new.office_id is distinct from private.office_id() then raise exception 'Office mismatch' using errcode='42501';end if;
 if tg_op='INSERT' or new.assigned_staff_id is distinct from old.assigned_staff_id then
  if not exists(select 1 from public.staff s where s.id=new.assigned_staff_id and s.office_id=new.office_id and s.active) then raise exception 'Active office staff required' using errcode='23514';end if;
 end if;
 return new;
end $$;

-- Trusted DB worker only; idempotent, bounded per property, retries failed rows next minute.
create function private.run_property_contract_schedules() returns jsonb language plpgsql security definer set search_path='' as $$
declare item record;failed integer=0;processed integer=0;
begin
 if not pg_try_advisory_xact_lock(713013) then return jsonb_build_object('busy',true);end if;
 for item in select property_id from private.property_contract_schedules order by property_id loop
  begin
   perform private.sync_property_contract_status(item.property_id);processed=processed+1;
  exception when others then failed=failed+1;raise warning 'property schedule failed: property=% SQLSTATE=%',item.property_id,SQLSTATE;
  end;
 end loop;
 return jsonb_build_object('processed',processed,'failed',failed);
end $$;
revoke all on function private.run_property_contract_schedules() from public,anon,authenticated,service_role;

-- Existing data remains intact; complete typed contracts opt into status scheduling.
insert into private.property_contract_schedules(property_id)
 select distinct c.property_id from public.contracts c join public.properties p on p.id=c.property_id and p.office_id=c.office_id
 where p.deleted_at is null and c.deleted_at is null and c.contract_type is not null and c.status in ('signed','active','completed') and c.contract_date is not null and c.closing_date is not null;
select private.run_property_contract_schedules();
commit;
