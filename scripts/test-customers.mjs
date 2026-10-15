import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
assert.match(config.NEXT_PUBLIC_SUPABASE_URL,/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
const anon=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const admin=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const app='http://127.0.0.1:3000',marker='CUSTOMER-'+Date.now(),ids=[];let checks=0;
function ok(v,label){assert.ok(v,label);checks++;console.log('PASS:',label);}
async function actor(email){const jar=new Map();const db=createServerClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});const login=await db.auth.signInWithPassword({email:email+'@estatematch.test',password:'EstateMatch-Test-2026!'});assert.ifError(login.error);const staff=await db.from('staff').select('id,office_id').eq('user_id',login.data.user.id).single();assert.ifError(staff.error);return {db,staff:staff.data,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')};}
async function req(path,method='GET',body,who,origin=app){return fetch(app+path,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
const [a,b,manager,owner,other]=await Promise.all(['agent1','agent2','manager','owner','other-owner'].map(actor));
const base={customer_kind:'individual',name:marker,company_name:'',phone:'000-0000-1234',email:marker.toLowerCase()+'@example.test',notes:'가상 내부 메모',status:'active',contact_consent:null,next_contact_at:'2027-03-01T00:00:00Z',privacy_basis:'consent',privacy_basis_note:'가상 테스트 동의 기록',processing_purpose:'가상 중개 상담',retention_until:'2028-12-31'};
async function create(input=base,who=a){const r=await req('/api/customers','POST',input,who);assert.equal(r.status,201,await r.clone().text());const item=await r.json();ids.push(item.id);return item.id;}
async function read(id,who=a){const r=await req('/api/customers/'+id,'GET',undefined,who);assert.equal(r.status,200);return r.json();}
async function patch(id,input,version,who=a){return req('/api/customers/'+id,'PATCH',{customer:input,version},who);}
try{
 ok(!!(await anon.from('customers').select('phone,email')).error,'anonymous direct REST customer access denied');
 ok(!!(await anon.from('customer_property_links').select('*')).error,'anonymous related view access denied');
 for(const path of ['/api/customers','/api/customers/duplicates?name=test','/api/customers/50000000-0000-0000-0000-000000000001','/api/customers/50000000-0000-0000-0000-000000000001/consultations'])ok((await req(path)).status===401,'anonymous blocked '+path);
 ok((await req('/api/customers','POST',base,a,'https://foreign.test')).status===403,'CSRF rejected');
 for(const fields of [{office_id:other.staff.office_id},{role:'owner'},{customer_type:'landlord'},{business_registration_number:'123'},{name:''},{customer_kind:'company',company_name:''},{privacy_basis:'unrecorded'},{retention_until:null},{retention_until:'2027-02-30'},{phone:'not a phone'},{email:'bad email'}])ok((await req('/api/customers','POST',{...base,...fields},a)).status===400,'invalid or forbidden fields rejected '+Object.keys(fields)[0]);
 ok((await req('/api/customers','POST',{...base,assigned_staff_id:b.staff.id},a)).status===403,'agent cannot assign colleague');
 const id=await create();let p=await read(id);ok(p.assigned_staff_id===a.staff.id&&p.office_id===a.staff.office_id&&p.contact_consent===null&&p.consent_recorded_at===null,'auto assignment and unknown consent preserved');
 const company=await create({...base,name:marker+' 법인담당자',customer_kind:'company',company_name:marker+' 가상법인',phone:null,email:null,contact_consent:false},manager);const cp=await read(company,manager);ok(cp.customer_kind==='company'&&cp.company_name===marker+' 가상법인'&&cp.contact_consent===false&&!!cp.consent_recorded_at,'company and refusal recorded');
 ok((await req('/api/customers/'+id,'GET',undefined,b)).status===200,'same office colleague can read');
 ok((await req('/api/customers/'+id,'GET',undefined,other)).status===404,'foreign office read hidden');
 ok((await patch(id,{...base,notes:'forged'},p.version,b)).status===403,'colleague edit rejected');
 ok((await patch(id,base,p.version,other)).status===404,'foreign office edit hidden');
 const direct=await b.db.from('customers').update({notes:'forged'}).eq('id',id).select('id');assert.ifError(direct.error);ok(direct.data.length===0,'direct RLS blocks colleague updates');
 ok(!!(await a.db.from('customers').update({office_id:other.staff.office_id}).eq('id',id)).error,'office immutable in DB');
 ok(!!(await a.db.from('customers').update({assigned_staff_id:b.staff.id}).eq('id',id)).error,'DB prevents agent reassignment');
 ok(!!(await manager.db.from('customers').update({assigned_staff_id:other.staff.id}).eq('id',id)).error,'DB active same-office staff FK guard');
 ok((await patch(id,{...base,contact_consent:true,notes:'수정 메모'},p.version)).status===200,'assignee update');p=await read(id);ok(p.version===2&&p.contact_consent&&!!p.consent_recorded_at&&p.notes==='수정 메모','version and consent timestamp generated');
 ok((await patch(id,base,1)).status===409,'stale edit rejected');
 const duplicate=await (await req('/api/customers/duplicates?'+new URLSearchParams({name:'다른 이름',phone:'00000001234'}),'GET',undefined,a)).json();ok(duplicate.candidates.some(x=>x.id===id),'normalized phone duplicate warning');
 const emailDup=await (await req('/api/customers/duplicates?'+new URLSearchParams({name:'다른 이름',email:base.email.toUpperCase()}),'GET',undefined,a)).json();ok(emailDup.candidates.some(x=>x.id===id),'case insensitive email duplicate warning');
 const companyDup=await (await req('/api/customers/duplicates?'+new URLSearchParams({name:'다른 담당자',company_name:marker+'  가상법인'}),'GET',undefined,a)).json();ok(companyDup.candidates.some(x=>x.id===company),'normalized company name duplicate warning');
 const hiddenDup=await (await req('/api/customers/duplicates?'+new URLSearchParams({name:base.name,phone:base.phone}),'GET',undefined,other)).json();ok(hiddenDup.candidates.length===0,'duplicate results office isolated');
 const excluded=await (await req('/api/customers/duplicates?'+new URLSearchParams({name:base.name,exclude:id}),'GET',undefined,a)).json();ok(!excluded.candidates.some(x=>x.id===id),'duplicate excludes current customer');
 for(const q of [marker,'00000001234',base.email]){const list=await (await req('/api/customers?'+new URLSearchParams({q}),'GET',undefined,a)).json();ok(list.data.some(x=>x.id===id),'search finds '+(q===marker?'name':q===base.email?'email':'normalized phone'));}
 const filtered=await (await req('/api/customers?'+new URLSearchParams({q:marker,kind:'company',sort:'name'}),'GET',undefined,a)).json();ok(filtered.data.length===1&&filtered.data[0].id===company,'kind and sort filter');
 const assigned=await (await req('/api/customers?'+new URLSearchParams({q:marker,assigned:manager.staff.id}),'GET',undefined,a)).json();ok(assigned.data.length===1&&assigned.data[0].id===company,'assignee filter');
 const injection=await (await req('/api/customers?'+new URLSearchParams({q:'%,office_id.not.is.null'}),'GET',undefined,a)).json();ok(injection.data.length===0,'search cannot inject PostgREST filters');
 const contact={summary:'가상 통화 내역',contact_method:'phone',consulted_at:'2026-10-15T00:00:00Z',property_id:'40000000-0000-0000-0000-000000000001'};
 ok((await req('/api/customers/'+id+'/consultations','POST',contact,a)).status===201,'consultation links existing property');
 ok((await req('/api/customers/'+id+'/consultations','POST',contact,b)).status===403,'colleague consultation denied');
 ok((await req('/api/customers/'+id+'/consultations','POST',{...contact,property_id:'40000000-0000-0000-0000-000000000003'},a)).status===400,'foreign property link denied');
 ok(!!(await b.db.from('consultations').insert({...contact,office_id:a.staff.office_id,assigned_staff_id:b.staff.id,customer_id:id})).error,'direct RLS blocks writing colleagues customer history');
 ok(!!(await manager.db.from('consultations').insert({...contact,office_id:other.staff.office_id,assigned_staff_id:other.staff.id,customer_id:id})).error,'cross-office customer FK blocked');
 const links=await b.db.from('customer_property_links').select('*').eq('customer_id',id);assert.ifError(links.error);ok(links.data.length===1,'invoker view exposes same-office related property');
 const foreignLinks=await other.db.from('customer_property_links').select('*').eq('customer_id',id);assert.ifError(foreignLinks.error);ok(foreignLinks.data.length===0,'invoker view preserves cross-office RLS');
 const history=await (await req('/api/customers/'+id+'/consultations','GET',undefined,b)).json();ok(history.consultations.length===1&&history.consultations[0].summary===contact.summary,'shared consultation history');
 const html=await (await req('/dashboard/customers/'+id,'GET',undefined,a)).text();ok(html.includes('가상 통화 내역')&&html.includes('/dashboard/properties/'+contact.property_id),'detail includes history and related property');
 ok(html.includes('다음 단계에서 제공')&&!html.includes('customer_type'),'contract placeholder without fixed roles');
 const many=await a.db.from('consultations').insert(Array.from({length:20},(_,i)=>({...contact,office_id:a.staff.office_id,assigned_staff_id:a.staff.id,customer_id:id,summary:'가상 과거 상담 '+i,consulted_at:'2020-01-01T00:00:00Z'})));assert.ifError(many.error);
 const historyPage=await (await req('/dashboard/customers/'+id+'?historyPage=2','GET',undefined,a)).text();ok(historyPage.includes('가상 과거 상담')&&historyPage.replace(/<!--[\s\S]*?-->/g,'').includes('총 21건'),'history pagination retains older consultations');
 ok((await patch(id,{...base,assigned_staff_id:b.staff.id},p.version,manager)).status===200,'manager can reassign');p=await read(id,b);ok(p.assigned_staff_id===b.staff.id,'new assignee stored');
 ok((await patch(id,base,p.version,a)).status===403,'old assignee loses edit permission');
 ok((await req('/api/customers/'+id+'/consultations','POST',{...contact,summary:'새 담당자 상담'},b)).status===201,'new assignee can record consultation');
 ok((await patch(id,{...base,next_contact_at:'2000-01-01T00:00:00Z',retention_until:'2000-01-01'},p.version,owner)).status===200,'owner can edit all office customers');p=await read(id,b);
 const overdue=await (await req('/api/customers?'+new URLSearchParams({q:marker,contact:'overdue',sort:'next_contact'}),'GET',undefined,b)).json();ok(overdue.data.length===1&&overdue.data[0].id===id,'overdue contact list');
 const expired=await (await req('/dashboard/customers/'+id,'GET',undefined,b)).text();ok(expired.includes('보유기한이 지났습니다.'),'expired retention flagged');
 ok(!!(await b.db.from('customers').delete().eq('id',id)).error,'hard customer deletion revoked');
 ok(!!(await b.db.from('consultations').delete().eq('customer_id',id)).error,'hard consultation deletion revoked');
 ok((await req('/api/customers/'+id,'DELETE',{version:p.version},a)).status===403,'non-assignee archive rejected');
 ok((await req('/api/customers/'+id,'DELETE',{version:p.version},b)).status===204,'assignee soft archive');
 ok((await req('/api/customers/'+id,'GET',undefined,b)).status===404,'archived customer hidden in API');
 ok((await req('/api/customers/'+id+'/consultations','GET',undefined,b)).status===404,'archived consultation API hidden');
 const preserved=await admin.from('consultations').select('id').eq('customer_id',id);assert.ifError(preserved.error);ok(preserved.data.length===22,'archive preserves all consultation history');
 const restored=await manager.db.from('customers').update({deleted_at:null}).eq('id',id).select('id');ok(!!restored.error||restored.data.length===0,'manager cannot silently restore archives');
 const legacy=await read('50000000-0000-0000-0000-000000000001');ok(legacy.privacy_basis==='unrecorded'&&legacy.contact_consent===null&&legacy.retention_until===null,'legacy rows do not invent consent or retention');
 console.log(`${checks} customer API/RLS checks passed`);
}finally{if(ids.length){assert.ifError((await admin.from('consultations').delete().in('customer_id',ids)).error);assert.ifError((await admin.from('customers').delete().in('id',ids)).error);}}
