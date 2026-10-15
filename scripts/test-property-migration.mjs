// Local-only upgrade rehearsal in a disposable DB. Never resets the app database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container=process.env.ESTATEMATCH_DB_CONTAINER||'estatematch-db';
const nonce=Date.now().toString(),database='estatematch_upgrade_'+nonce,archive='/tmp/estatematch-upgrade-'+nonce+'.dump',list='/tmp/estatematch-upgrade-'+nonce+'.list';
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
 for(const name of migrations.filter(x=>x<'202610150004'))sql(readFileSync('supabase/migrations/'+name,'utf8'));
 sql(readFileSync('supabase/seed.sql','utf8'));
 sql(`insert into public.properties(id,office_id,assigned_staff_id,title,property_type,transaction_type,price,deposit,building_name)
 values('40000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','legacy lease','officetel','lease',100000000,0,'한솔2차 오피스텔'),
 ('40000000-0000-0000-0000-000000000082','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','legacy rent','officetel','rent',1000000,5000000,'  한솔2차   오피스텔  '),
 ('40000000-0000-0000-0000-000000000083','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','blank building','officetel','sale',250000000,0,'   ');
 create schema upgrade_test;
 create table upgrade_test.before as select id,price,deposit,area_m2,version,created_at,last_confirmed_at from public.properties;
 create table upgrade_test.audit_count as select count(*) n from public.property_change_history;
 update public.staff set active=false where id='30000000-0000-0000-0000-000000000003';`);
 for(const name of migrations.filter(x=>x>='202610150004'))sql(readFileSync('supabase/migrations/'+name,'utf8'));
 sql(`do $$ begin
 if exists(select 1 from upgrade_test.before b join public.properties p using(id) where row(b.price,b.deposit,b.area_m2,b.version,b.created_at,b.last_confirmed_at) is distinct from row(p.price,p.deposit,p.area_m2,p.version,p.created_at,p.last_confirmed_at)) then raise exception 'Legacy values were modified'; end if;
 if (select count(distinct building_id) from public.properties where id in ('40000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000082'))<>1 then raise exception 'Building backfill did not deduplicate'; end if;
 if (select building_id is not null from public.properties where id='40000000-0000-0000-0000-000000000083') then raise exception 'Whitespace name must not become a choice'; end if;
 if (select count(*) from public.property_change_history)<>(select n from upgrade_test.audit_count) then raise exception 'Migration fabricated history'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.properties'::regclass and tgname in ('property_guard','property_audit') and tgenabled<>'O') then raise exception 'Business triggers not restored'; end if;
 if exists(select 1 from pg_tables where schemaname='public' and not rowsecurity) then raise exception 'RLS disabled'; end if;
 end $$;
 update public.staff set active=true where id='30000000-0000-0000-0000-000000000003';
 delete from public.property_change_history where property_id in ('40000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000083');
 delete from public.properties where id in ('40000000-0000-0000-0000-000000000081','40000000-0000-0000-0000-000000000082','40000000-0000-0000-0000-000000000083');`);
 console.log('PASS: migration preserves financial values, imports choices for inactive staff, skips blank names, preserves history and restores triggers/RLS');
 sql(readFileSync('supabase/tests/permissions.sql','utf8'));
 console.log('PASS: all migrations from empty business schema plus RLS regression suite');
} finally {
 if(created)docker(['dropdb','-U','postgres',database]);
 docker(['rm','-f',archive,list]);
}
