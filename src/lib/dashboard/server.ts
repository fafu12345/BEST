import 'server-only';
import {z} from 'zod';
import type {supabaseServer} from '@/lib/supabase/server';
import {koreaToday} from '@/lib/expiration/shared';
import type {Core,Workflow} from './shared';
export async function loadDashboard(db:Awaited<ReturnType<typeof supabaseServer>>,staff:{id:string;role:string},raw:Record<string,unknown>){
 const today=koreaToday();const defaultAssigned=['owner','manager'].includes(staff.role)?'all':staff.id;
 const filter=z.object({assigned:z.union([z.literal('all'),z.guid()]).default(defaultAssigned),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v=>z.iso.date().safeParse(v+'-01').success).default(today.slice(0,7))}).safeParse(raw);
 const colleagues=await db.from('staff').select('id,display_name,role,active').order('display_name');
 const filters=filter.success?filter.data:{assigned:defaultAssigned,month:today.slice(0,7)};const people=colleagues.data??[];
 const filterError=!filter.success||filters.assigned!=='all'&&!people.some(p=>p.id===filters.assigned)?'담당자와 달력 월을 확인하세요.':'';
 if(filterError||colleagues.error)return {today,filters,staff:people,core:null as Core|null,workflow:null as Workflow|null,filterError:filterError||'직원 정보를 조회하지 못했습니다.',errors:[] as {section:string;code:string}[]};
 const assigned=filters.assigned==='all'?null:filters.assigned;
 async function read<T>(name:string,args:Record<string,unknown>,section:string){try{const r=await db.rpc(name,args);if(r.error){console.error('[dashboard]',{section,code:r.error.code});return {data:null as T|null,error:{section,code:r.error.code}};}return {data:r.data as T,error:null};}catch{console.error('[dashboard]',{section,code:'CONNECTION'});return {data:null as T|null,error:{section,code:'CONNECTION'}};}}
 const [core,workflow]=await Promise.all([read<Core>('dashboard_core',{p_assigned:assigned},'매물·계약·고객'),read<Workflow>('dashboard_workflow',{p_assigned:assigned,p_month:filters.month+'-01'},'만기·이전·갱신')]);
 return {today,filters,staff:people,core:core.data,workflow:workflow.data,filterError,errors:[core.error,workflow.error].filter((x):x is {section:string;code:string}=>!!x)};
}
