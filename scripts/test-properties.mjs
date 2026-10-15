import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>x && !x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
assert.match(config.NEXT_PUBLIC_SUPABASE_URL,/^http:\/\/(127\.0\.0\.1|localhost):54321$/,'local tests only');
const app='http://127.0.0.1:3000';
const admin=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);console.log('PASS:',label);checks++;};
async function actor(email){
 const jar=new Map();const db=createServerClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});
 const login=await db.auth.signInWithPassword({email:email+'@estatematch.test',password:'EstateMatch-Test-2026!'});assert.ifError(login.error);
 const staff=await db.from('staff').select('id,office_id').eq('user_id',login.data.user.id).single();assert.ifError(staff.error);
 return {db,staff:staff.data,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')};
}
async function request(path,method='GET',body,who,origin=app){
 return fetch(app+path,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie}:{}),...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual'});
}
const [owner,manager,a,b,other]=await Promise.all(['owner','manager','agent1','agent2','other-owner'].map(actor));
const marker=`CRUD-${Date.now()}`;
const base={title:marker,building_name:marker+'빌딩',address:'가상시 테스트로 123',property_type:'retail',transaction_type:'rent',price:1234567,deposit:30000000,area_m2:99.17,floor:1,total_floors:5,status:'available',description:'가상 매물',premium:15000000,business_type:'음식점',facilities:'가상 주방',complex_name:'',building_dong:'',unit_number:'',room_count:null,confirm:true};
const ids=[],paths=[];
const created=[];
async function read(id,who=a){const r=await request('/api/properties/'+id,'GET',undefined,who);ok(r.status===200,'read authorized property');return r.json();}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
function fileForm(kind='photo',bytes=png,type='image/png'){const f=new FormData();f.set('file_kind',kind);f.set('file',new File([bytes],kind==='photo'?'photo.png':'plan.pdf',{type}));return f;}
try {
 ok((await request('/api/properties','POST',base)).status===401,'anonymous create denied');
 ok((await request('/api/properties','POST',{...base,office_id:other.staff.office_id},a)).status===400,'forged office rejected');
 ok((await request('/api/properties','POST',{...base,price:0.1},a)).status===400,'fractional won rejected');
 ok((await request('/api/properties','POST',base,a,'https://foreign.test')).status===403,'foreign origin create denied');
 for(const [who,type] of [[a,'retail'],[b,'office'],[owner,'apartment'],[manager,'officetel'],[other,'retail']]){
   const input={...base,property_type:type,title:marker+'-'+type+'-'+who.staff.id,room_count:['apartment','officetel'].includes(type)?3:null,complex_name:type==='apartment'?'가상 단지':'',building_dong:type==='apartment'?'101':'',unit_number:type==='apartment'?'1001':''};
   const r=await request('/api/properties','POST',input,who);ok(r.status===201,type+': create');const item=await r.json();ids.push(item.id);created.push(item);
   const stored=await read(item.id,who);ok(stored.assigned_staff_id===who.staff.id&&stored.office_id===who.staff.office_id,'automatic assignee and office');
   ok(stored.price===1234567&&stored.area_m2===99.17,'won and square meter stored exactly');
   ok(!!stored.last_confirmed_at,'confirmation date recorded');
   ok(type==='retail' ? stored.premium===15000000&&stored.business_type==='음식점'&&stored.facilities==='가상 주방' : stored.premium===0&&stored.business_type===''&&stored.facilities==='',type+': type-specific retail fields normalized');
   if(type==='apartment')ok(stored.complex_name==='가상 단지'&&stored.building_dong==='101'&&stored.unit_number==='1001'&&stored.room_count===3,'apartment fields persisted');
   if(type==='officetel')ok(stored.room_count===3,'officetel room count persisted');
 }
 const id=ids[0];let p=await read(id);
 ok((await request('/api/properties/'+id,'GET',undefined,b)).status===200,'colleague read allowed');
 ok((await request('/api/properties/'+id,'GET',undefined,other)).status===404,'cross-office read hidden');
 for(const method of ['PATCH','DELETE']){
   ok((await request('/api/properties/'+id,method,{property:base,version:p.version},b)).status===403,`colleague ${method} denied`);
   ok((await request('/api/properties/'+id,method,{property:base,version:p.version},other)).status===404,`cross-office ${method} hidden`);
 }
 const duplicate=await (await request('/api/properties/duplicates?address='+encodeURIComponent(base.address)+'&floor=1','GET',undefined,a)).json();
 ok(duplicate.candidates.some(x=>x.id===id)&&!duplicate.candidates.some(x=>x.id===ids[4]),'duplicate warning remains office isolated');
 const list=await request('/dashboard/properties?'+new URLSearchParams({q:marker+'빌딩',type:'retail',transaction:'rent',status:'available',minPrice:'123',maxPrice:'124',area:'99.17'}),'GET',undefined,a);
 const html=await list.text();ok(list.status===200&&html.includes(id)&&!html.includes(ids[1])&&!html.includes(ids[4]),'combined building, exclusive area, price, type, transaction and status search');
 const invalid=await request('/dashboard/properties?minPrice=100&maxPrice=1','GET',undefined,a);ok((await invalid.text()).includes('가격 범위를'),'invalid filter warning');
 const patch={...base,price:1500000,status:'reserved',confirm:false};
 ok((await request('/api/properties/'+id,'PATCH',{property:patch,version:p.version},a)).status===200,'own update');
 ok((await request('/api/properties/'+id,'PATCH',{property:base,version:p.version},a)).status===409,'stale edit rejected');
 p=await read(id);
 const history=await a.db.from('property_change_history').select('*').eq('property_id',id).order('created_at');assert.ifError(history.error);
 ok(history.data.length===2&&history.data[1].old_values.monthly_rent===1234567&&history.data[1].new_values.monthly_rent===1500000&&history.data[1].new_values.status==='reserved'&&history.data[1].actor_staff_id===a.staff.id,'database records financial/status history and actor');
 ok(!!(await a.db.from('property_change_history').update({event:'deleted'}).eq('property_id',id)).error,'audit history cannot be forged');
 ok((await other.db.from('property_change_history').select('id').eq('property_id',id)).data.length===0,'history tenant isolation');
 ok((await request('/api/properties/'+id+'/files','POST',fileForm(),b)).status===403,'colleague upload denied');
 ok((await request('/api/properties/'+id+'/files','POST',fileForm(),other)).status===404,'cross-office upload hidden');
 ok((await request('/api/properties/'+id+'/files','POST',fileForm('photo',Buffer.from('<svg/>'),'image/png'),a)).status===400,'spoofed MIME blocked');
 ok((await request('/api/properties/'+id+'/files','POST',fileForm('photo',Buffer.from('%PDF-1.4\n%%EOF'),'application/pdf'),a)).status===400,'PDF rejected as photo');
 const upload=await request('/api/properties/'+id+'/files','POST',fileForm(),a);ok(upload.status===201,'photo upload');const photo=await upload.json();
 const plan=await request('/api/properties/'+id+'/files','POST',fileForm('floorplan',Buffer.from('%PDF-1.4\n%%EOF'),'application/pdf'),a);ok(plan.status===201,'PDF floorplan upload');const planData=await plan.json();
 const metadata=await a.db.from('property_images').select('storage_path').eq('property_id',id);paths.push(...metadata.data.map(x=>x.storage_path));
 const photoUrl=`/api/properties/${id}/files/${photo.id}`;
 const fileRead=await request(photoUrl,'GET',undefined,b);ok(fileRead.status===200&&fileRead.headers.get('content-type')==='image/png'&&fileRead.headers.get('cache-control')==='private, no-store','same-office protected file download');
 ok((await request(photoUrl)).status===401,'anonymous file denied');
 ok((await request(photoUrl,'GET',undefined,other)).status===404,'cross-office file denied');
 ok((await request(photoUrl,'DELETE',undefined,b)).status===403,'colleague file deletion denied');
 ok((await request('/api/properties/'+id,'PATCH',{property:{...patch,assigned_staff_id:b.staff.id},version:p.version},a)).status===403,'agent cannot reassign');
 ok((await request('/api/properties/'+id,'PATCH',{property:{...patch,assigned_staff_id:other.staff.id},version:p.version},manager)).status===409,'manager cannot assign cross-office staff');
 ok((await request('/api/properties/'+id,'PATCH',{property:{...patch,assigned_staff_id:b.staff.id},version:p.version},manager)).status===200,'manager reassigns');
 p=await read(id,b);
 const reassigned=await b.db.from('property_images').select('assigned_staff_id').eq('property_id',id);ok(reassigned.data.length===2&&reassigned.data.every(x=>x.assigned_staff_id===b.staff.id),'file metadata follows assignment');
 ok((await request('/api/properties/'+id,'PATCH',{property:patch,version:p.version},a)).status===403,'previous assignee loses edit rights');
 ok((await request('/api/properties/'+id,'PATCH',{property:patch,version:p.version},b)).status===200,'new assignee can edit');p=await read(id,b);
 ok((await request('/api/properties/'+id,'PATCH',{property:{...patch,price:1600000},version:p.version},owner)).status===200,'owner edits office property');p=await read(id,b);
 ok((await request(`/api/properties/${id}/files/${planData.id}`,'DELETE',undefined,b)).status===204,'assigned staff deletes file');
 ok((await request(`/api/properties/${id}/files/${planData.id}`,'GET',undefined,b)).status===404,'removed file no longer opens');
 ok(!!(await b.db.from('properties').delete().eq('id',id)).error,'direct hard delete denied by DB grant');
 ok((await request('/api/properties/'+id,'DELETE',{version:p.version-1},b)).status===409,'stale soft delete denied');
 ok((await request('/api/properties/'+id,'DELETE',{version:p.version},b)).status===204,'soft delete through invoker RLS');
 ok((await request('/api/properties/'+id,'GET',undefined,a)).status===404,'deleted detail hidden');
 ok((await request(photoUrl,'GET',undefined,a)).status===404,'deleted property file route blocked');
 ok(!!(await a.db.storage.from('property-images').download(paths[0])).error,'direct Storage download blocked after soft delete');
 ok((await a.db.from('property_images').select('id').eq('property_id',id)).data.length===0,'deleted parent metadata hidden by RLS');
 const archived=await a.db.from('properties').select('deleted_at').eq('id',id).single();ok(!!archived.data?.deleted_at,'tenant-scoped archive retained');
 for(const [role,who] of [['assigned staff',b],['manager',manager],['owner',owner]]) {
   const restored=await who.db.from('properties').update({deleted_at:null}).eq('id',id).select('id');ok(!restored.error&&restored.data.length===0,role+': cannot restore tombstone');
 }
 const audit=await a.db.from('property_change_history').select('event').eq('property_id',id).eq('event','deleted');ok(audit.data.length===1,'soft delete recorded once');
 ok((await a.db.from('properties').select('id').eq('id',id).is('deleted_at',null)).data.length===0,'active list excludes soft delete');
 console.log(`${checks} property CRUD/security checks passed`);
} finally {
 // Service role is restricted to teardown of this run's synthetic fixtures, never the feature requests above.
 if(paths.length) assert.ifError((await admin.storage.from('property-images').remove(paths)).error);
 if(ids.length){
  assert.ifError((await admin.from('property_change_history').delete().in('property_id',ids)).error);
  assert.ifError((await admin.from('property_images').delete().in('property_id',ids)).error);
  assert.ifError((await admin.from('properties').delete().in('id',ids)).error);
 }
}
