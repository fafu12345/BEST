// Local-only upgrade rehearsal in a disposable DB. Never resets the app database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container=process.env.ESTATEMATCH_DB_CONTAINER||'estatematch-db';
const nonce=Date.now().toString(),database='estatematch_schedule_upgrade_'+nonce,archive='/tmp/estatematch-schedule-upgrade-'+nonce+'.dump',list='/tmp/estatematch-schedule-upgrade-'+nonce+'.list';
const docker=(args,input)=>execFileSync('docker',['exec',...(input===undefined?[]:['-i']),container,...args],{encoding:'utf8',input,maxBuffer:32*1024*1024});
let created=false;
try {
 docker(['pg_dump','-U','postgres','--schema=auth','--schema=storage','--schema=extensions','--schema-only','--format=c','-f',archive]);
 const entries=docker(['pg_restore','-l',archive]).split('\n').filter(x=>!x.includes(' POLICY ')).join('\n');
 docker(['sh','-c','cat > '+list],entries);
 docker(['createdb','-U','postgres',database]);created=true;
 docker(['pg_restore','-U','postgres','--no-owner','--no-privileges','-L',list,'-d',database,archive]);
 const sql=statement=>docker(['psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],statement);
 sql('grant usage on schema auth,public,extensions to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;');
 sql(readFileSync('local/storage-grants.sql','utf8'));
 const migrations=readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort();
 for(const name of migrations.filter(x=>x<'202610160013'))sql(readFileSync('supabase/migrations/'+name,'utf8'));
 sql(readFileSync('supabase/seed.sql','utf8'));
 sql(`begin;
 insert into public.contracts(id,office_id,assigned_staff_id,property_id,customer_id,contract_number,amount,contract_type,status,contract_date,closing_date,occupancy_start_date,lease_start_date,lease_end_date,sale_price_krw,deposit_krw,rent_krw,maintenance_fee_krw,brokerage_fee_krw)
 values('b0000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','SCHEDULE-UPGRADE',20000000,'monthly_rent','active',current_date-400,current_date-300,current_date-310,current_date-310,current_date+60,0,20000000,500000,0,0);
 insert into public.contract_parties(office_id,contract_id,customer_id,role) values
 ('10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000091','50000000-0000-0000-0000-000000000001','landlord'),
 ('10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000091','50000000-0000-0000-0000-000000000002','tenant');
 commit;
 update public.staff set active=false where id='30000000-0000-0000-0000-000000000003';
 create schema upgrade_test;
 create table upgrade_test.contracts as select id,to_jsonb(c) value from public.contracts c;
 create table upgrade_test.properties as select id,to_jsonb(p)-array['status','version','updated_at'] value from public.properties p;
 create table upgrade_test.customers as select id,to_jsonb(c) value from public.customers c;`);
 sql(readFileSync('supabase/migrations/202610160013_contract_property_schedule.sql','utf8'));
 sql(`do $$begin
 if exists(select 1 from upgrade_test.contracts b left join public.contracts c using(id) where to_jsonb(c) is distinct from b.value) then raise exception 'Existing contract dates or values changed';end if;
 if exists(select 1 from upgrade_test.customers b left join public.customers c using(id) where to_jsonb(c) is distinct from b.value) then raise exception 'Customer values changed';end if;
 if exists(select 1 from upgrade_test.properties b left join public.properties p using(id) where to_jsonb(p)-array['status','version','updated_at'] is distinct from b.value) then raise exception 'Unrelated property fields changed';end if;
 if (select status from public.properties where id='40000000-0000-0000-0000-000000000001')<>'closed' then raise exception 'Inactive assignee prevented status backfill';end if;
 if (select count(*) from private.property_contract_schedules)<>1 then raise exception 'Legacy incomplete contracts opted in incorrectly';end if;
 if exists(select 1 from pg_tables where schemaname='public' and not rowsecurity) then raise exception 'RLS disabled';end if;
 if has_function_privilege('authenticated','private.run_property_contract_schedules()','execute') or has_function_privilege('anon','private.sync_property_contract_status(uuid)','execute') then raise exception 'Internal scheduler exposed';end if;
 end $$;
 update public.contracts set notes='Historical dates preserved on notes-only edit' where id='b0000000-0000-0000-0000-000000000091';
 do $$begin
 if (select lease_start_date=closing_date from public.contracts where id='b0000000-0000-0000-0000-000000000091') then raise exception 'Notes-only edit rewrote old dates';end if;
 end $$;`);
 console.log('PASS: 012 to 013 preserves historical dates/customers/unrelated fields, backfills status with inactive assignee, skips incomplete legacy contracts and preserves RLS/internal-only worker');
}finally{
 if(created)docker(['dropdb','-U','postgres',database]);
 docker(['rm','-f',archive,list]);
}
