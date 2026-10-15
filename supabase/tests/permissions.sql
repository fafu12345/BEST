-- Run after local seed; every write is rolled back.
begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.denied(command text,expected_state text,label text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute command; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 perform pg_temp.assert(actual=expected_state,label||' SQLSTATE='||coalesce(actual,'success'));
end $$;
select pg_temp.assert((select count(*)=14 from pg_tables where schemaname='public' and rowsecurity),'All 14 public tables enable RLS');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=1 from public.offices),'agent sees one office');
select pg_temp.assert((select count(*)=4 from public.staff),'agent sees own office staff');
select pg_temp.denied($q$update public.staff set role='owner'$q$,'42501','role escalation blocked');
select pg_temp.denied($q$update public.staff set office_id='10000000-0000-0000-0000-000000000002'$q$,'42501','membership change blocked');
select pg_temp.denied($q$insert into public.staff(office_id,user_id,display_name,role) values('10000000-0000-0000-0000-000000000001',gen_random_uuid(),'intruder','owner')$q$,'42501','self enrollment blocked');
select pg_temp.denied($q$select token_hash from public.staff_invitations$q$,'42501','invitation hashes hidden');
select pg_temp.denied($q$select public.accept_staff_invitation(repeat('a',64),gen_random_uuid(),'intruder')$q$,'42501','client cannot accept invitation RPC');
do $$
declare t text; n int;
begin
 foreach t in array array['properties','customers','property_images','customer_requirements','matches','appointments','consultations','contracts','tasks'] loop
 execute format('select count(*) from public.%I',t) into n;
 perform pg_temp.assert(n=2,t||': same office read');
 execute format('update public.%I set updated_at=now() where assigned_staff_id=%L',t,'30000000-0000-0000-0000-000000000003');
 get diagnostics n=row_count; perform pg_temp.assert(n=1,t||': own update');
 execute format('update public.%I set updated_at=now() where assigned_staff_id=%L',t,'30000000-0000-0000-0000-000000000004');
 get diagnostics n=row_count; perform pg_temp.assert(n=0,t||': colleague update denied');
 execute format('update public.%I set updated_at=now() where office_id=%L',t,'10000000-0000-0000-0000-000000000002');
 get diagnostics n=row_count; perform pg_temp.assert(n=0,t||': other office update denied');
 end loop;
end $$;
select pg_temp.denied($q$update public.properties set assigned_staff_id='30000000-0000-0000-0000-000000000004' where id='40000000-0000-0000-0000-000000000001'$q$,'42501','agent cannot reassign own record');
select pg_temp.denied($q$update public.properties set office_id='10000000-0000-0000-0000-000000000002' where id='40000000-0000-0000-0000-000000000001'$q$,'42501','tenant immutable');
select pg_temp.denied($q$insert into public.properties(office_id,assigned_staff_id,title,property_type,transaction_type,price) values('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005','bad','house','sale',1)$q$,'42501','cross-office insert blocked');
select pg_temp.denied($q$insert into public.properties(office_id,assigned_staff_id,title,property_type,transaction_type,price) values('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','bad','house','sale',-1)$q$,'23514','negative price CHECK');
select pg_temp.assert(private.can_write_image('10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/test.png'),'own storage path allowed');
select pg_temp.assert(not private.can_write_image('10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000002/test.png'),'colleague storage path blocked');
select pg_temp.assert(not private.can_write_image('10000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000003/test.png'),'other office storage path blocked');
-- Positive and negative CRUD operations with real affected-row assertions.
insert into public.properties(id,office_id,assigned_staff_id,title,property_type,transaction_type,price)
values('40000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','temporary','house','sale',10);
update public.properties set updated_at='2000-01-01' where id='40000000-0000-0000-0000-000000000099';
select pg_temp.assert((select updated_at>'2000-01-02' from public.properties where id='40000000-0000-0000-0000-000000000099'),'updated_at cannot be forged');
select pg_temp.denied($q$insert into public.properties(id,office_id,assigned_staff_id,title,property_type,transaction_type,price) values('40000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','duplicate','house','sale',10)$q$,'23505','duplicate primary key rejected');
select pg_temp.denied($q$delete from public.properties where id='40000000-0000-0000-0000-000000000099'$q$,'42501','hard property deletion blocked');
select public.soft_delete_property('40000000-0000-0000-0000-000000000099',2);
select pg_temp.assert((select count(*)=0 from public.properties where id='40000000-0000-0000-0000-000000000099' and deleted_at is null),'soft-deleted property excluded from active queries');
with removed as (delete from public.tasks where assigned_staff_id='30000000-0000-0000-0000-000000000004' returning id)
select pg_temp.assert((select count(*)=0 from removed),'colleague deletion blocked');
with removed as (delete from public.tasks where office_id='10000000-0000-0000-0000-000000000002' returning id)
select pg_temp.assert((select count(*)=0 from removed),'cross-office deletion blocked');
-- Repeat for owner, manager, and second agent.
do $$
declare actor int; t text; n int; expected int;
begin
 foreach actor in array array[1,2,4] loop
 perform set_config('request.jwt.claim.sub','20000000-0000-0000-0000-'||lpad(actor::text,12,'0'),true);
 expected := case when actor=4 then 1 else 2 end;
 foreach t in array array['properties','customers','property_images','customer_requirements','matches','appointments','consultations','contracts','tasks'] loop
 execute format('update public.%I set updated_at=now()',t);
 get diagnostics n=row_count; perform pg_temp.assert(n=expected,t||': actor '||actor||' update scope');
 end loop;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select pg_temp.denied($q$insert into public.matches(office_id,assigned_staff_id,property_id,customer_id) values('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001')$q$,'23503','cross-office FK blocked for manager');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',true);
select pg_temp.assert((select count(*)=1 from public.properties),'office B sees only B');
reset role;
update public.staff set active=false where user_id='20000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from public.properties),'inactive staff sees nothing');
reset role;
set local role anon;
select pg_temp.denied('select * from public.properties','42501','anonymous read blocked');
reset role;
-- Service-only invitation consumption and replay prevention.
insert into auth.users(id,email) values('20000000-0000-0000-0000-000000000006','new@estatematch.test');
insert into public.staff_invitations(office_id,email,role,token_hash,invited_by)
values('10000000-0000-0000-0000-000000000001','new@estatematch.test','agent',repeat('a',64),'30000000-0000-0000-0000-000000000002');
set local role service_role;
select pg_temp.denied($q$select public.accept_staff_invitation(repeat('a',64),'20000000-0000-0000-0000-000000000006','new')$q$,'P0001','unapproved invitation denied');
update public.staff_invitations set approved_by='30000000-0000-0000-0000-000000000002',approved_at=now() where token_hash=repeat('a',64);
select pg_temp.assert(public.accept_staff_invitation(repeat('a',64),'20000000-0000-0000-0000-000000000006','new') is not null,'approved invitation consumed');
select pg_temp.denied($q$select public.accept_staff_invitation(repeat('a',64),'20000000-0000-0000-0000-000000000006','new')$q$,'P0001','invitation replay denied');
reset role;
select pg_temp.assert((select role='agent' and office_id='10000000-0000-0000-0000-000000000001' from public.staff where user_id='20000000-0000-0000-0000-000000000006'),'membership derived from invitation');
rollback;
