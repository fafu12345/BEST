import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
assert.match(config.NEXT_PUBLIC_SUPABASE_URL,/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
const admin=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const app='http://127.0.0.1:3000',marker='CHOICE-'+Date.now(),ids=[],buildingIds=[];
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS:',label);};
async function actor(email){const jar=new Map();const db=createServerClient(config.NEXT_PUBLIC_SUPABASE_URL,config.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});const login=await db.auth.signInWithPassword({email:email+'@estatematch.test',password:'EstateMatch-Test-2026!'});assert.ifError(login.error);const staff=await db.from('staff').select('id,office_id').eq('user_id',login.data.user.id).single();assert.ifError(staff.error);return {db,staff:staff.data,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')};}
async function req(path,method='GET',body,who,origin=app){return fetch(app+path,{method,headers:{Origin:origin,...(who?{Cookie:who.cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});}
const [a,b,other]=await Promise.all(['agent1','agent2','other-owner'].map(actor));
async function add(type,name,who=a){const r=await req('/api/property-buildings','POST',{property_type:type,name},who);ok(r.status===201,'add '+type+' choice');const item=await r.json();buildingIds.push(item.id);return item;}
const base={title:'client title ignored',building_name:'client name ignored',address:marker+' 가상로 123',property_type:'officetel',transaction_type:'sale',price:300000000,deposit:20000000,monthly_rent:500000,area_m2:33.06,floor:2,total_floors:10,status:'available',description:'가상 자료',premium:0,business_type:'',facilities:'',complex_name:'',building_dong:'',unit_number:'201',room_count:1,store_name:'',confirm:false};
async function create(input,who=a){const r=await req('/api/properties','POST',input,who);ok(r.status===201,'create selected-building property');const item=await r.json();ids.push(item.id);return item.id;}
async function read(id){const r=await req('/api/properties/'+id,'GET',undefined,a);assert.equal(r.status,200);return r.json();}
try {
 ok((await req('/api/property-buildings','POST',{property_type:'officetel',name:marker})).status===401,'anonymous cannot add choices');
 ok((await req('/api/property-buildings','POST',{property_type:'officetel',name:marker,office_id:other.staff.office_id},a)).status===400,'forged choice office rejected');
 ok((await req('/api/property-buildings','POST',{property_type:'officetel',name:marker},a,'https://foreign.test')).status===403,'choice CSRF blocked');
 const h2=await add('officetel',marker+' 한솔2차 오피스텔'),h3=await add('officetel',marker+' 한솔3차 오피스텔'),retail=await add('retail',marker+' 한솔상가'),foreign=await add('officetel',h2.name,other);
 const duplicate=await req('/api/property-buildings','POST',{property_type:'officetel',name:'  '+h2.name.replace(' ','  ')+'  '},a);ok(duplicate.status===200&&(await duplicate.json()).id===h2.id,'duplicate option reuses normalized existing choice');
 const shared=await (await req('/api/property-buildings?type=officetel','GET',undefined,b)).json();ok(shared.buildings.some(x=>x.id===h2.id)&&!shared.buildings.some(x=>x.id===retail.id||x.id===foreign.id),'type filtering, office sharing and tenant isolation');
 const deniedRename=await a.db.from('property_buildings').update({name:'forged'}).eq('id',h2.id).select('id');ok(!deniedRename.data?.length&&(await admin.from('property_buildings').select('name').eq('id',h2.id).single()).data.name===h2.name,'ordinary choice rename blocked');
 ok(!!(await a.db.from('property_buildings').insert({office_id:other.staff.office_id,property_type:'office',name:marker,created_by:a.staff.id})).error,'direct cross-office choice insert blocked');
 ok((await other.db.from('property_buildings').select('id').eq('id',h2.id)).data.length===0,'direct cross-office choice read hidden');
 ok((await req('/api/properties','POST',{...base,building_id:foreign.id},a)).status===400,'property cannot reference foreign office choice');
 ok((await req('/api/properties','POST',{...base,building_id:retail.id},a)).status===400,'property cannot reference wrong type choice');
 const id=await create({...base,building_id:h2.id});let p=await read(id);
 ok(p.building_name===h2.name&&p.complex_name===h2.name&&p.title===h2.name+' 201호','database binds canonical building and room title');
 ok(p.unit_number==='201','officetel room retained');
 ok(p.price===300000000&&p.deposit===20000000&&p.monthly_rent===500000,'sale price and occupied tenant amounts coexist');
 const detail=await (await req('/dashboard/properties/'+id,'GET',undefined,a)).text();ok(detail.includes('매매 3억 원')&&detail.includes('보증금 2,000만 원 / 월 50만 원'),'sale details show all three amounts');
 const second=await create({...base,building_id:h3.id,unit_number:'301'});
 const shop=await create({...base,property_type:'retail',building_id:retail.id,store_name:'가상 한솔카페'});const shopData=await read(shop);ok(shopData.store_name==='가상 한솔카페'&&shopData.title.includes('가상 한솔카페')&&shopData.unit_number==='201','retail store and unit independently stored');
 const oldSale={...base,property_type:'retail',deposit:0,unit_number:'202'};delete oldSale.store_name;delete oldSale.monthly_rent;
 ok((await req('/api/properties/'+shop,'PATCH',{property:oldSale,version:shopData.version},a)).status===200,'legacy sale payload accepted');
 const preservedShop=await read(shop);ok(preservedShop.building_id===retail.id&&preservedShop.store_name==='가상 한솔카페'&&preservedShop.deposit===20000000&&preservedShop.monthly_rent===500000,'omitted new fields do not clear building/store/tenant income');
 const list=await (await req('/dashboard/properties?'+new URLSearchParams({type:'officetel',building:h2.id,area:'33.06'}),'GET',undefined,a)).text();ok(list.includes(id)&&!list.includes(second)&&!list.includes(shop),'selected building and exclusive area filter');
 ok(!list.includes('name="minArea"')&&!list.includes('name="maxArea"')&&!list.includes('name="minFloor"')&&!list.includes('name="maxFloor"'),'area and floor range inputs removed');
 const mismatch=await (await req('/dashboard/properties?'+new URLSearchParams({building:h2.id,area:'34'}),'GET',undefined,a)).text();ok(!mismatch.includes(id),'exclusive area uses single exact value');
 const lease={...base,building_id:h2.id,transaction_type:'lease',deposit:100000000,monthly_rent:15000,price:999};
 ok((await req('/api/properties/'+id,'PATCH',{property:lease,version:p.version},a)).status===200,'switch to lease with deposit and monthly rent');p=await read(id);
 ok(p.price===100000000&&p.deposit===100000000&&p.monthly_rent===15000,'lease canonical deposit and monthly rent persisted');
 const oldLease={...lease,price:100000000,deposit:0};delete oldLease.monthly_rent;delete oldLease.building_id;
 ok((await req('/api/properties/'+id,'PATCH',{property:oldLease,version:p.version},a)).status===200,'legacy lease payload accepted');p=await read(id);
 ok(p.building_id===h2.id&&p.price===100000000&&p.deposit===100000000&&p.monthly_rent===15000,'legacy lease update retains independent monthly rent');
 const rent={...lease,transaction_type:'rent',deposit:10000000,monthly_rent:1000000,price:999};
 ok((await req('/api/properties/'+id,'PATCH',{property:rent,version:p.version},a)).status===200,'switch to rent');p=await read(id);ok(p.price===1000000&&p.deposit===10000000&&p.monthly_rent===1000000,'rent amounts persisted');
 const history=await a.db.from('property_change_history').select('old_values,new_values').eq('property_id',id).order('created_at');assert.ifError(history.error);
 ok(history.data.length===3&&history.data[1].old_values.price===300000000&&history.data[1].new_values.price===0&&history.data[1].new_values.deposit===100000000&&history.data[1].new_values.monthly_rent===15000,'sale/deposit/rent history uses explicit independent amounts');
 // Old stored records remain usable: no financial rewrite is required by the migration.
 for(const tx of ['lease','rent']){
   const legacy=await a.db.from('properties').insert({office_id:a.staff.office_id,assigned_staff_id:a.staff.id,title:marker+' legacy '+tx,property_type:'officetel',transaction_type:tx,price:tx==='lease'?100000000:1000000,deposit:tx==='rent'?5000000:0}).select('id').single();assert.ifError(legacy.error);ids.push(legacy.data.id);
   const html=await (await req('/dashboard/properties/'+legacy.data.id,'GET',undefined,a)).text();ok(html.includes(tx==='lease'?'보증금 1억 원 / 월 0 원':'보증금 500만 원 / 월 100만 원'),'legacy '+tx+' amounts displayed without loss');
 }
 console.log(`${checks} building/transaction checks passed`);
} finally {
 if(ids.length){assert.ifError((await admin.from('property_change_history').delete().in('property_id',ids)).error);assert.ifError((await admin.from('properties').delete().in('id',ids)).error);}
 if(buildingIds.length)assert.ifError((await admin.from('property_buildings').delete().in('id',buildingIds)).error);
}
