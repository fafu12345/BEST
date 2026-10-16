// Local-only upgrade rehearsal in a disposable DB. Never resets the app database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container=process.env.ESTATEMATCH_DB_CONTAINER||'estatematch-db';
const nonce=Date.now().toString(),database='estatematch_seed_replay_'+nonce,archive='/tmp/estatematch-seed-replay-'+nonce+'.dump',list='/tmp/estatematch-seed-replay-'+nonce+'.list';
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
 for(const name of migrations)sql(readFileSync('supabase/migrations/'+name,'utf8'));
 const seed=readFileSync('supabase/seed.sql','utf8');sql(seed);
 sql(`do $$begin if (select count(*) from public.offices)<>2 or (select count(*) from public.staff)<>5 or (select count(*) from public.contracts)<>3 then raise exception 'Fresh bootstrap incomplete';end if;end$$;`);
 console.log('PASS: fresh database creates offices, synthetic accounts and contracts atomically');
 sql("update public.properties set deleted_at=clock_timestamp() where id='40000000-0000-0000-0000-000000000001';");
 // Reproduce the previously shipped seed's BEFORE INSERT failure, in an isolated transaction.
 const duplicateContract=seed.split('\n').find(line=>line.startsWith('insert into public.contracts'));
 let failed=false;try{sql('begin;'+duplicateContract+';rollback;');}catch(e){failed=String(e.stderr).includes('Active office property required');}
 if(!failed)throw new Error('Expected duplicate fixture failure not reproduced');
 console.log('PASS: duplicate fixture reproduces Active office property required after soft deletion');
 sql(`update public.properties set assigned_staff_id='30000000-0000-0000-0000-000000000001' where id='40000000-0000-0000-0000-000000000002';
 update public.customers set deleted_at=clock_timestamp() where id='50000000-0000-0000-0000-000000000001';
 update public.staff set active=false where id='30000000-0000-0000-0000-000000000003';
 create schema replay_test;
 create table replay_test.before_data as
 select schemaname,tablename,query_to_xml(format('select * from %I.%I order by 1',schemaname,tablename),false,true,'')::text as value from pg_tables where schemaname='public' or (schemaname='auth' and tablename in ('users','identities'));`);
 sql(seed);sql(seed);
 sql(`do $$declare item record;current_value text;begin
 for item in select * from replay_test.before_data loop
 select query_to_xml(format('select * from %I.%I order by 1',item.schemaname,item.tablename),false,true,'')::text into current_value;
 if current_value is distinct from item.value then raise exception 'Existing data changed: %.%',item.schemaname,item.tablename;end if;
 end loop;
 end$$;`);
 console.log('PASS: repeated startup seed preserves archived properties/customers, assignments, inactive staff, contracts and auth data');
 console.log('3 seed bootstrap/replay checks passed');
}finally{
 if(created)docker(['dropdb','-U','postgres',database]);
 docker(['rm','-f',archive,list]);
}
