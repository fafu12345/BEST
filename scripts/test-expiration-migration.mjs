// Local-only upgrade rehearsal in a disposable DB. Never resets the app database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container=process.env.ESTATEMATCH_DB_CONTAINER||'estatematch-db';
const nonce=Date.now().toString(),database='estatematch_expiration_upgrade_'+nonce,archive='/tmp/estatematch-expiration-upgrade-'+nonce+'.dump',list='/tmp/estatematch-expiration-upgrade-'+nonce+'.list';
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
 for(const name of migrations.filter(x=>x<'202610150011'))sql(readFileSync('supabase/migrations/'+name,'utf8'));
 sql(readFileSync('supabase/seed.sql','utf8'));
 sql(`begin;
 insert into public.contracts(id,office_id,assigned_staff_id,property_id,customer_id,contract_number,amount,contract_type,status,contract_date,lease_start_date,lease_end_date,sale_price_krw,deposit_krw,rent_krw,maintenance_fee_krw,brokerage_fee_krw)
 select 'b0000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','UPGRADE-EXPIRY',0,'monthly_rent','active',current_date-400,current_date-300,current_date+60,0,20000000,500000,100000,200000;
 insert into public.contracts(id,office_id,assigned_staff_id,property_id,customer_id,contract_number,amount,contract_type,status,contract_date,lease_start_date,lease_end_date,sale_price_krw,deposit_krw,rent_krw,maintenance_fee_krw,brokerage_fee_krw)
 select 'b0000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','UPGRADE-ARCHIVE',0,'monthly_rent','draft',current_date-400,current_date-300,current_date+60,0,20000000,500000,100000,200000;
 insert into public.contract_parties(office_id,contract_id,customer_id,role) select '10000000-0000-0000-0000-000000000001',id,'50000000-0000-0000-0000-000000000001','landlord' from public.contracts where contract_number in ('UPGRADE-EXPIRY','UPGRADE-ARCHIVE');
 insert into public.contract_parties(office_id,contract_id,customer_id,role) select '10000000-0000-0000-0000-000000000001',id,'50000000-0000-0000-0000-000000000002','tenant' from public.contracts where contract_number in ('UPGRADE-EXPIRY','UPGRADE-ARCHIVE');
 update public.contracts set deleted_at=clock_timestamp() where contract_number='UPGRADE-ARCHIVE';
 commit;
 update public.staff set active=false where id='30000000-0000-0000-0000-000000000003';
 create schema upgrade_test;
 create table upgrade_test.before_contracts as select id,to_jsonb(c) value from public.contracts c;
 create table upgrade_test.before_customers as select id,to_jsonb(c) value from public.customers c;
 create table upgrade_test.before_properties as select id,to_jsonb(c) value from public.properties c;`);
 for(const name of migrations.filter(x=>x>='202610150011'))sql(readFileSync('supabase/migrations/'+name,'utf8'));
 sql(`do $$begin
 if exists(select 1 from upgrade_test.before_contracts b left join public.contracts c using(id) where c.id is null or to_jsonb(c) is distinct from b.value) then raise exception 'Contract data changed during expiration backfill';end if;
 if exists(select 1 from upgrade_test.before_customers b left join public.customers c using(id) where c.id is null or to_jsonb(c) is distinct from b.value) then raise exception 'Customer data changed';end if;
 if exists(select 1 from upgrade_test.before_properties b left join public.properties c using(id) where c.id is null or to_jsonb(c) is distinct from b.value) then raise exception 'Property data changed';end if;
 if (select count(*) from public.expiration_tasks where contract_id='b0000000-0000-0000-0000-000000000081')<>4 then raise exception 'Existing lease tasks missing for inactive assignee';end if;
 if exists(select 1 from public.expiration_tasks where scheduled_date<>base_end_date-reminder_days) then raise exception 'Backfill schedules wrong';end if;
 if exists(select 1 from public.contract_followups where contract_id<>'b0000000-0000-0000-0000-000000000081') then raise exception 'Backfill included archived/untyped contracts';end if;
 if exists(select 1 from pg_tables where schemaname='public' and not rowsecurity) then raise exception 'RLS missing';end if;
 if not exists(select 1 from pg_class where oid='public.expiration_directory'::regclass and 'security_invoker=true'=any(reloptions)) then raise exception 'Directory must enforce caller RLS';end if;
 end$$;`);
 console.log('PASS: 010 to 011 backfill preserves all contracts, customers and properties; generates four tasks for inactive assignee; skips archived/untyped contracts; preserves RLS');
} finally {
 if(created)docker(['dropdb','-U','postgres',database]);
 docker(['rm','-f',archive,list]);
}
