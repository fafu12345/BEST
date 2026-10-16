import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {z} from 'zod';
import {actor,create,req,cleanup,propertyInput,customerInput} from './contract-test-helpers.mjs';
const fixtures={contracts:[],customers:[],properties:[]};let checks=0;const ok=(value,label)=>{assert.ok(value,label);console.log('PASS',++checks,label);};
const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/contracts/shared.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>({z}),Date,Intl});
for(const [start,months,end] of [['2026-11-01',12,'2027-10-31'],['2026-11-01',24,'2028-10-31'],['2024-02-29',12,'2025-02-28'],['2026-01-31',1,'2026-02-28'],['2026-12-31',2,'2027-02-28']])ok(exports.leaseEndForMonths(start,months)===end,'inclusive period arithmetic '+start+' / '+months);
ok(exports.leaseEndForMonths('',12)===''&&exports.leaseEndForMonths('2026-02-30',12)==='','invalid dates do not generate an end date');ok(exports.leasePeriodLabel('2026-11-01','2028-10-31')==='2년 (24개월)'&&exports.leasePeriodLabel('2026-11-01','2026-11-10')==='10일','period summary supports presets and manual dates');
const sql=statement=>execFileSync('docker',['exec','-i','estatematch-db','psql','-X','-U','postgres','-At','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8'}).trim();
const [a,b,other]=await Promise.all(['agent1','agent2','other-owner'].map(actor));const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const day=n=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const marker='SCHEDULE-'+Date.now();
try{
 const p=await create('/api/properties',propertyInput(marker),a);fixtures.properties.push(p.id);const landlord=await create('/api/customers',customerInput(marker+' 임대인'),a),tenant=await create('/api/customers',customerInput(marker+' 임차인'),a);fixtures.customers.push(landlord.id,tenant.id);
 const base={contract:{property_id:p.id,contract_number:'',contract_type:'monthly_rent',status:'active',contract_date:day(-5),closing_date:today,occupancy_start_date:today,lease_start_date:today,lease_end_date:day(365),sale_price_krw:0,deposit_krw:20000000,rent_krw:500000,maintenance_fee_krw:0,brokerage_fee_krw:0,notes:'',previous_contract_id:null,overlap_override_reason:''},parties:[{customer_id:landlord.id,role:'landlord'},{customer_id:tenant.id,role:'tenant'}],version:null,property_status:null,property_version:null};
 const row=async()=>{const r=await a.db.from('properties').select('*').eq('id',p.id).single();assert.ifError(r.error);return r.data;};
 const c=await create('/api/contracts',base,a);fixtures.contracts.push(c.id);ok((await row()).status==='reserved','closing day itself remains in progress');
 const boundary=await req('/api/contracts','POST',{...base,contract:{...base.contract,closing_date:day(365),lease_start_date:day(365),occupancy_start_date:day(365),lease_end_date:day(730)}},a);ok(boundary.status===400,'another lease starting on the inclusive final day requires overlap acknowledgement');
 const contract=async()=>{const r=await a.db.from('contracts').select('*').eq('id',c.id).single();assert.ifError(r.error);return r.data;};
 async function patch(changes){const current=await contract();const r=await req('/api/contracts/'+c.id,'PATCH',{...base,version:current.version,contract:{...base.contract,...changes}},a);assert.equal(r.status,200,await r.clone().text());return contract();}
 await patch({contract_date:day(1),closing_date:day(5),lease_start_date:day(5),occupancy_start_date:day(5)});ok((await row()).status==='available','future contract leaves property available before contract date');
 await patch({contract_date:today,closing_date:today});ok((await row()).status==='reserved','same-day signing and closing stays in progress');
 await patch({closing_date:day(-1),lease_start_date:day(-1),occupancy_start_date:day(-1)});ok((await row()).status==='closed','day after closing is completed');ok((await contract()).status==='active','property completion never auto-terminates a lease');
 await patch({status:'cancelled'});ok((await row()).status==='available','cancelled sole contract restores availability');await patch({status:'draft'});ok((await row()).status==='available','draft contract cannot block availability');
 const normalized=await patch({closing_date:day(10),lease_start_date:day(2),occupancy_start_date:day(3)});ok(normalized.lease_start_date===day(10)&&normalized.occupancy_start_date===day(10),'DB enforces lease start and occupancy equal closing even for old API clients');
 const direct=await a.db.from('contracts').update({occupancy_start_date:day(4),lease_start_date:day(4)}).eq('id',c.id).select('lease_start_date,occupancy_start_date').single();assert.ifError(direct.error);ok(direct.data.lease_start_date===day(10)&&direct.data.occupancy_start_date===day(10),'direct authenticated writes also normalize dates');
 for(const type of ['sale','jeonse']){
  const property=await create('/api/properties',propertyInput(marker+' '+type),a);fixtures.properties.push(property.id);
  const isSale=type==='sale';const made=await create('/api/contracts',{...base,contract:{...base.contract,property_id:property.id,contract_type:type,contract_date:day(-5),closing_date:day(-1),lease_start_date:isSale?null:day(-1),occupancy_start_date:isSale?null:day(-1),lease_end_date:isSale?null:day(365),sale_price_krw:isSale?300000000:0,deposit_krw:isSale?0:20000000,rent_krw:0},parties:[{customer_id:landlord.id,role:isSale?'seller':'landlord'},{customer_id:tenant.id,role:isSale?'buyer':'tenant'}]},a);fixtures.contracts.push(made.id);
  const state=await a.db.from('properties').select('status').eq('id',property.id).single();assert.ifError(state.error);ok(state.data.status==='closed',type+' contract also completes property after closing');
 }
 const before=await row();await patch({status:'active',closing_date:today});ok((await row()).status==='reserved','reactivated contract re-enables automatic status');
 const denied=await b.db.from('contracts').update({closing_date:day(-1)}).eq('id',c.id).select('id');assert.ifError(denied.error);ok(denied.data.length===0&&(await row()).status==='reserved','non-assignee cannot drive status by forging another contract dates');
 const foreign=await other.db.from('properties').select('id').eq('id',p.id);assert.ifError(foreign.error);ok(foreign.data.length===0,'scheduled properties remain invisible across offices');
 const grants=sql("select has_function_privilege('authenticated','private.sync_property_contract_status(uuid)','execute') or has_function_privilege('authenticated','private.run_property_contract_schedules()','execute') or has_table_privilege('authenticated','private.property_contract_schedules','select');");ok(grants==='f','app roles cannot invoke worker or read internal scheduler registry');
 const newer=await create('/api/contracts',{...base,contract:{...base.contract,contract_date:day(2),closing_date:day(3),lease_start_date:day(3),occupancy_start_date:day(3),overlap_override_reason:'가상 예외 중복 계약 확인'}},a);fixtures.contracts.push(newer.id);ok((await row()).status==='reserved','currently progressing contract takes precedence over a future exception contract');
 await patch({status:'cancelled'});ok((await row()).status==='available','remaining future contract determines status after cancellation');
 const nr=await a.db.from('contracts').select('version').eq('id',newer.id).single();assert.ifError(nr.error);const cancel=await req('/api/contracts/'+newer.id,'PATCH',{...base,version:nr.data.version,contract:{...base.contract,status:'cancelled'}},a);assert.equal(cancel.status,200);await patch({closing_date:day(-1),lease_start_date:day(-1),occupancy_start_date:day(-1)});
 const eventsBefore=await a.db.from('property_change_history').select('id',{count:'exact',head:true}).eq('property_id',p.id);assert.ifError(eventsBefore.error);sql('select private.run_property_contract_schedules();');const eventsAfter=await a.db.from('property_change_history').select('id',{count:'exact',head:true}).eq('property_id',p.id);assert.ifError(eventsAfter.error);ok(eventsBefore.count===eventsAfter.count,'repeated scheduler runs create no duplicate status history');
 assert.ifError((await a.db.from('properties').update({status:'available'}).eq('id',p.id)).error);
 console.log('Waiting for the independent Docker scheduler to reconcile the property (up to 75 seconds)...');const deadline=Date.now()+75000;while(Date.now()<deadline&&(await row()).status!=='closed')await new Promise(resolve=>setTimeout(resolve,750));ok((await row()).status==='closed','background worker catches up without browser requests after a missed transition');
 const version=(await row()).version;sql('select private.run_property_contract_schedules();');ok((await row()).version===version,'idempotent worker does not increment property versions on unchanged state');
 const history=await a.db.from('property_change_history').select('actor_staff_id,new_values').eq('property_id',p.id);assert.ifError(history.error);ok(history.data.some(e=>e.actor_staff_id===null&&e.new_values.status==='closed'),'background transition is preserved in property history as a system event');
 ok(before.office_id===(await row()).office_id,'automation never changes office identity');
 console.log(checks+' contract schedule checks passed');
}finally{await cleanup(fixtures);}
