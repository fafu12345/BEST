import 'server-only';
import { z } from 'zod';
import { propertyContext, validId } from '@/lib/properties/server';
import { canEdit } from '@/lib/properties/shared';
import { supabaseServer } from '@/lib/supabase/server';
export { propertyContext as customerContext };
export async function customerTarget(c:Awaited<ReturnType<typeof propertyContext>>,id:string,edit=false){
 if(c.error)return {error:c.error};
 if(!validId(id))return {error:Response.json({error:'고객을 찾을 수 없습니다.'},{status:404})};
 const {data,error}=await c.db.from('customers').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
 if(error)return {error:Response.json({error:'고객을 조회하지 못했습니다.'},{status:500})};
 if(!data)return {error:Response.json({error:'고객을 찾을 수 없습니다.'},{status:404})};
 if(edit&&!canEdit(c.staff,data))return {error:Response.json({error:'담당자 또는 대표·관리자만 변경할 수 있습니다.'},{status:403})};
 return {customer:data};
}
const filters=z.object({q:z.string().trim().max(200).default(''),kind:z.enum(['','individual','company']).default(''),assigned:z.union([z.literal(''),z.guid()]).default(''),sort:z.enum(['name','newest','updated','next_contact','retention']).default('updated'),contact:z.enum(['','overdue','upcoming','unscheduled']).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)});
export async function customerList(db:Awaited<ReturnType<typeof supabaseServer>>,raw:Record<string,unknown>){
 const parsed=filters.safeParse(raw);const f=parsed.success?parsed.data:filters.parse({});
 if(!parsed.success)return {data:[],count:0,filters:f,error:'검색 조건을 확인하세요.'};
 const sort={name:'name',newest:'created_at',updated:'updated_at',next_contact:'next_contact_at',retention:'updated_at'}[f.sort];
 let q=db.from('customers').select('id,name,company_name,customer_kind,phone,email,status,assigned_staff_id,next_contact_at,updated_at',{count:'exact'}).is('deleted_at',null).order(sort,{ascending:['name','next_contact'].includes(f.sort),nullsFirst:false}).order('id');
 if(f.q)q=q.ilike('search_text',`%${f.q.replace(/[\\%_]/g,'\\$&')}%`);
 if(f.kind)q=q.eq('customer_kind',f.kind);if(f.assigned)q=q.eq('assigned_staff_id',f.assigned);
 const now=new Date().toISOString();
 if(f.contact==='overdue')q=q.lt('next_contact_at',now);
 if(f.contact==='upcoming')q=q.gte('next_contact_at',now).lte('next_contact_at',new Date(Date.now()+7*86400000).toISOString());
 if(f.contact==='unscheduled')q=q.is('next_contact_at',null);
 const result=await q.range((f.page-1)*20,f.page*20-1);if(result.error)throw new Error('고객 목록을 조회하지 못했습니다.');
 return {data:result.data??[],count:result.count??0,filters:f,error:''};
}
