import 'server-only';
import {z} from 'zod';
import type {supabaseServer} from '@/lib/supabase/server';
import {koreaToday} from './shared';
const filters=z.object({assigned:z.union([z.literal(''),z.guid()]).default(''),scope:z.enum(['upcoming','overdue','all','resolved']).default('upcoming'),days:z.coerce.number().refine(x=>[30,60,90,180,365].includes(x)).default(180),page:z.coerce.number().int().min(1).max(100000).default(1),taskPage:z.coerce.number().int().min(1).max(100000).default(1),taskStatus:z.enum(['open','all','completed']).default('open')});
export async function expirationList(db:Awaited<ReturnType<typeof supabaseServer>>,raw:Record<string,unknown>){
 const p=filters.safeParse(raw);const f=p.success?p.data:filters.parse({});const today=koreaToday();const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+f.days);const until=d.toISOString().slice(0,10);
 let q=db.from('expiration_directory').select('*',{count:'exact'}).order('lease_end_date',{ascending:true,nullsFirst:false}).order('id');
 if(f.assigned)q=q.eq('assigned_staff_id',f.assigned);
 if(f.scope==='resolved')q=q.eq('resolution_status','resolved');else{q=q.eq('resolution_status','open').in('status',['signed','active']);if(f.scope==='upcoming')q=q.gte('lease_end_date',today).lte('lease_end_date',until);if(f.scope==='overdue')q=q.lt('lease_end_date',today);}
 let tq=db.from('expiration_tasks').select('*',{count:'exact'}).order('scheduled_date').order('id');
 if(f.assigned)tq=tq.eq('assigned_staff_id',f.assigned);if(f.taskStatus==='open')tq=tq.in('status',['pending','in_progress']);if(f.taskStatus==='completed')tq=tq.eq('status','completed');if(f.scope==='overdue')tq=tq.lt('scheduled_date',today);else if(f.scope==='upcoming')tq=tq.lte('scheduled_date',until);
 const [contracts,tasks]=await Promise.all([q.range((f.page-1)*20,f.page*20-1),tq.range((f.taskPage-1)*20,f.taskPage*20-1)]);
 if(contracts.error||tasks.error){console.error('[expirationList]',{code:contracts.error?.code??tasks.error?.code});throw new Error('만기 DB 조회 실패: 최신 DB 업데이트를 확인하세요.');}
 const ids=[...new Set(tasks.data.map(t=>t.contract_id as string))];const related=ids.length?await db.from('expiration_directory').select('id,properties').in('id',ids):{data:[],error:null};if(related.error)throw new Error('업무 계약 조회 실패');
 return {contracts:contracts.data,contractCount:contracts.count??0,tasks:tasks.data,taskCount:tasks.count??0,related:related.data??[],filters:f,error:p.success?'':'검색 조건을 확인하세요.',today};
}
