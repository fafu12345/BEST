import 'server-only';
import {z} from 'zod';
import type {supabaseServer} from '@/lib/supabase/server';
export async function listContracts(db:Awaited<ReturnType<typeof supabaseServer>>,raw:Record<string,unknown>){
 const parsed=z.object({q:z.string().trim().max(200).default(''),status:z.enum(['','draft','signed','active','completed','terminated','cancelled']).default(''),type:z.enum(['','sale','jeonse','monthly_rent']).default(''),property:z.union([z.literal(''),z.guid()]).default(''),customer:z.union([z.literal(''),z.guid()]).default(''),assigned:z.union([z.literal(''),z.guid()]).default(''),from:z.union([z.literal(''),z.iso.date()]).default(''),to:z.union([z.literal(''),z.iso.date()]).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).safeParse(raw);
 const f=parsed.success?parsed.data:{q:'',status:'',type:'',property:'',customer:'',assigned:'',from:'',to:'',page:1};
 if(!parsed.success||f.from&&f.to&&f.from>f.to)return {data:[],count:0,filters:f,error:'검색 조건을 확인하세요.'};
 let query=db.from('contract_directory').select('*',{count:'exact'}).is('deleted_at',null).order('created_at',{ascending:false}).order('id');
 if(f.q)query=query.ilike('search_text',`%${f.q.replace(/[\\%_]/g,'\\$&')}%`);
 if(f.status)query=query.eq('status',f.status);if(f.type)query=query.eq('contract_type',f.type);if(f.property)query=query.eq('property_id',f.property);if(f.assigned)query=query.eq('assigned_staff_id',f.assigned);
 if(f.from)query=query.gte('effective_contract_date',f.from);if(f.to)query=query.lte('effective_contract_date',f.to);
 if(f.customer)query=query.contains('customer_ids',[f.customer]);
 const r=await query.range((f.page-1)*20,f.page*20-1);if(r.error){console.error('[listContracts] contract_directory query failed',{code:r.error.code});throw new Error('계약 목록 조회 실패');}return {data:r.data??[],count:r.count??0,filters:f,error:''};
}
