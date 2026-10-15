// Local-only integration: real Supabase Auth, PostgREST, Storage and Next server.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>x && !x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
const url=config.NEXT_PUBLIC_SUPABASE_URL;
assert.match(url,/^http:\/\/(127\.0\.0\.1|localhost):54321$/,'local environment only');
const key=config.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin=createClient(url,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const app='http://127.0.0.1:3000';
let checks=0;
const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS:',label);};
async function actor(email) {
 const jar=new Map();
 const db=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(x=>jar.set(x.name,x.value))}});
 const {error}=await db.auth.signInWithPassword({email:email+'@estatematch.test',password:'EstateMatch-Test-2026!'});
 ok(!error,`${email}: real Auth login`);
 return {db,jar};
}
async function post(path,body,who,origin=app){return fetch(app+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(who?{Cookie:[...who.jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{})},body:JSON.stringify(body)});}
const loginHtml=await (await fetch(app+'/login')).text();
const action=loginHtml.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
ok(!!action,'login form exposes server action');
async function formLogin(password) {
 const form=new FormData();form.set(action,'');form.set('email','agent1@estatematch.test');form.set('password',password);
 return fetch(app+'/login',{method:'POST',headers:{Origin:app},body:form,redirect:'manual'});
}
const validLogin=await formLogin('EstateMatch-Test-2026!');
ok(validLogin.status===303&&validLogin.headers.get('location')==='/dashboard'&&!!validLogin.headers.get('set-cookie'),'login form creates session and redirects');
const invalidLogin=await formLogin('incorrect-password');
ok(invalidLogin.status===303&&invalidLogin.headers.get('location')==='/login?error=credentials','login form rejects invalid password');
const owner=await actor('owner'),manager=await actor('manager'),agent1=await actor('agent1'),agent2=await actor('agent2'),other=await actor('other-owner');
for(const [name,a,n] of [['owner',owner,2],['manager',manager,2],['agent1',agent1,2],['agent2',agent2,2],['other',other,1]]){
 const {data,error}=await a.db.from('properties').select('id');ok(!error&&data.length===n,`${name}: office-isolated REST`);
 const response=await fetch(app+'/dashboard',{headers:{Cookie:[...a.jar].map(([k,v])=>`${k}=${v}`).join('; ')}});ok(response.status===200&&(await response.text()).includes('사무소 매물'),`${name}: authenticated dashboard`);
}
const signup=await createClient(url,key).auth.signUp({email:'forbidden@estatematch.test',password:'EstateMatch-Test-2026!'});ok(!!signup.error,'public signup disabled');
ok((await post('/api/staff/invitations',{email:'bad@estatematch.test',role:'agent'},agent1)).status===403,'agent cannot invite');
ok((await post('/api/staff/invitations',{email:'bad@estatematch.test',role:'agent'},manager,'https://other.test')).status===403,'foreign origin rejected');
ok((await post('/api/staff/invitations',{email:'bad@estatematch.test',role:'owner',office_id:'forged'},manager)).status===400,'role/office payload forgery rejected');
const email=`joined-${Date.now()}@estatematch.test`;let invitationId,joinedId;
try {
 const r=await post('/api/staff/invitations',{email,role:'agent'},manager);ok(r.status===200,'manager creates invitation');
 const invitation=await r.json();invitationId=invitation.id;
 const body={email,password:'EstateMatch-Test-2026!',displayName:'가상 신규 직원',token:invitation.token};
 ok((await post('/api/staff/join',body)).status===403,'join before approval denied');
 ok((await post('/api/staff/approve',{invitationId},other)).status===404,'other office cannot approve');
 ok((await post('/api/staff/approve',{invitationId},manager)).status===200,'manager server approval');
 ok((await post('/api/staff/join',{...body,role:'owner',office_id:'forged'})).status===400,'join rejects forged membership fields');
 ok((await post('/api/staff/join',body)).status===201,'approved join succeeds');
 const joined=createClient(url,key,{auth:{persistSession:false}});
 const login=await joined.auth.signInWithPassword({email,password:body.password});joinedId=login.data.user?.id;ok(!login.error,'new staff Auth login');
 const row=await joined.from('staff').select('role,office_id').eq('user_id',joinedId).single();
 ok(!row.error&&row.data.role==='agent'&&row.data.office_id==='10000000-0000-0000-0000-000000000001','membership derives from protected invitation');
 ok((await post('/api/staff/join',body)).status===403,'invitation reuse rejected');
} finally {
 if(joinedId){await admin.from('staff').delete().eq('user_id',joinedId);await admin.auth.admin.deleteUser(joinedId);}
 if(invitationId)await admin.from('staff_invitations').delete().eq('id',invitationId);
}
const own='10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001/integration.png';
const colleague='10000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000002/integration.png';
const otherPath='10000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000003/integration.png';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
try {
 const upload=await agent1.db.storage.from('property-images').upload(own,png,{contentType:'image/png',upsert:true});
 if(upload.error) console.error('Storage:',upload.error.message);
 ok(!upload.error,'own Storage upload');
 ok(!!(await agent1.db.storage.from('property-images').upload(colleague,png,{contentType:'image/png'})).error,'colleague Storage upload blocked');
 ok(!!(await agent1.db.storage.from('property-images').upload(otherPath,png,{contentType:'image/png'})).error,'cross-office Storage upload blocked');
 ok(!(await agent2.db.storage.from('property-images').download(own)).error,'same-office Storage read');
 ok(!!(await other.db.storage.from('property-images').download(own)).error,'cross-office Storage download blocked');
} finally {await admin.storage.from('property-images').remove([own,colleague,otherPath]);}
console.log(`${checks} integration checks passed`);
