import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
assert.match(config.NEXT_PUBLIC_SUPABASE_URL,/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
const admin=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const app='http://127.0.0.1:3000',marker='SCHEDULE-'+Date.now(),ids=[],buildingIds=[];
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS:',label);};
async function actor(email){const jar=new Map();const db=createServerClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});const login=await db.auth.signInWithPassword({email:email+'@estatematch.test',password:'EstateMatch-Test-2026!'});assert.ifError(login.error);const staff=await db.from('staff').select('id,office_id').eq('user_id',login.data.user.id).single();assert.ifError(staff.error);return {db,staff:staff.data,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')};}
async function req(path,method='GET',body,who,origin=app){return fetch(app+path,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
const [a,b,other]=await Promise.all(['agent1','agent2','other-owner'].map(actor));
async function add(type,name,who=a){const r=await req('/api/property-buildings','POST',{property_type:type,name},who);ok(r.status===201,'add '+type+' choice');const item=await r.json();buildingIds.push(item.id);return item;}
const base={title:'client title ignored',building_name:'client name ignored',address:marker+' 가상로 123',property_type:'officetel',transaction_type:'sale',price:300000000,deposit:20000000,monthly_rent:500000,area_m2:33.06,floor:2,total_floors:10,status:'available',description:'가상 자료',premium:0,business_type:'',facilities:'',complex_name:'',building_dong:'',unit_number:'201',room_count:1,store_name:'',confirm:false};
async function create(input,who=a){const r=await req('/api/properties','POST',input,who);ok(r.status===201,'create selected-building property');const item=await r.json();ids.push(item.id);return item.id;}
async function read(id){const r=await req('/api/properties/'+id,'GET',undefined,a);assert.equal(r.status,200);return r.json();}
try {
 const building=await add('officetel',marker+' 일정 테스트');
 const input={...base,building_id:building.id,address:'',bathroom_count:2,desired_transaction_date:'2027-03-01',desired_transaction_note:'퇴거 후 협의'};
 const id=await create(input);let p=await read(id);
 ok(p.address===''&&p.bathroom_count===2&&p.desired_transaction_date==='2027-03-01'&&p.desired_transaction_note==='퇴거 후 협의','address-free officetel saves bathrooms and schedule');
 for(const invalid of [{bathroom_count:-1},{bathroom_count:101},{bathroom_count:1.5},{desired_transaction_date:'2027-02-30'},{desired_transaction_note:'가'.repeat(501)}]) ok((await req('/api/properties','POST',{...input,...invalid},a)).status===400,'invalid field rejected: '+Object.keys(invalid)[0]);
 ok((await req('/api/properties','POST',{...base,property_type:'retail',address:''},a)).status===400,'retail still requires address');
 ok((await req('/api/properties/'+id,'PATCH',{property:{...input,bathroom_count:3},version:p.version},b)).status===403,'other staff cannot edit schedule or bathrooms');
 ok((await req('/api/properties/'+id,'GET',undefined,other)).status===404,'other office cannot read new fields');
 const denied=await b.db.from('properties').update({bathroom_count:3}).eq('id',id).select('id');assert.ifError(denied.error);ok(denied.data.length===0,'RLS prevents direct non-assignee bathroom update');
 ok(!!(await a.db.from('properties').update({bathroom_count:-1}).eq('id',id)).error,'DB bathroom CHECK rejects bypassed API validation');
 ok(!!(await a.db.from('properties').update({desired_transaction_note:'가'.repeat(501)}).eq('id',id)).error,'DB schedule length CHECK enforced');
 const dup=await (await req('/api/properties/duplicates?'+new URLSearchParams({building_id:building.id,unit_number:'201'}),'GET',undefined,a)).json();ok(dup.candidates.some(x=>x.id===id),'building and unit detect duplicates without address');
 const foreignDup=await (await req('/api/properties/duplicates?'+new URLSearchParams({building_id:building.id,unit_number:'201'}),'GET',undefined,other)).json();ok(foreignDup.candidates.length===0,'duplicate endpoint respects office isolation');
 const otherDong=await (await req('/api/properties/duplicates?'+new URLSearchParams({building_id:building.id,unit_number:'201',building_dong:'102'}),'GET',undefined,a)).json();ok(otherDong.candidates.length===0,'different building dong is not a duplicate');
 const legacy={...input,address:'기존 보존 주소 123'};delete legacy.bathroom_count;delete legacy.desired_transaction_date;delete legacy.desired_transaction_note;
 ok((await req('/api/properties/'+id,'PATCH',{property:legacy,version:p.version},a)).status===200,'old API payload still accepted');p=await read(id);
 ok(p.bathroom_count===2&&p.desired_transaction_date==='2027-03-01'&&p.desired_transaction_note==='퇴거 후 협의','omitted optional fields preserve existing data');
 for(const tx of ['sale','lease','rent']) {
  ok((await req('/api/properties/'+id,'PATCH',{property:{...input,address:p.address,transaction_type:tx},version:p.version},a)).status===200,tx+' schedule can be saved');p=await read(id);
  ok(p.desired_transaction_date==='2027-03-01'&&p.address==='기존 보존 주소 123',tx+' preserves schedule and legacy address');
 }
 ok((await req('/api/properties/'+id,'PATCH',{property:{...input,desired_transaction_date:null,desired_transaction_note:'날짜 협의',bathroom_count:null},version:p.version},a)).status===200,'unknown date and bathroom can be cleared explicitly');p=await read(id);ok(p.desired_transaction_date===null&&p.bathroom_count===null&&p.desired_transaction_note==='날짜 협의','negotiable timing persists without invented date');
 console.log(`${checks} schedule/bathroom checks passed`);
} finally {
 if(ids.length){assert.ifError((await admin.from('property_change_history').delete().in('property_id',ids)).error);assert.ifError((await admin.from('properties').delete().in('id',ids)).error);}
 if(buildingIds.length)assert.ifError((await admin.from('property_buildings').delete().in('id',buildingIds)).error);
}
