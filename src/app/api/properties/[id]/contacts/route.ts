import { z } from 'zod';
import { propertyContext, editableProperty } from '@/lib/properties/server';
const phone=z.string().trim().max(40).regex(/^[0-9+()\s-]*$/).refine(v=>v.replace(/\D/g,'').length>=7&&v.replace(/\D/g,'').length<=20,'전화번호1을 입력하세요.');
const relationship=z.enum(['landlord','tenant','seller','buyer','resident','other']).optional();
const input=z.object({relationship,name:z.string().trim().max(100),phone,phone2:z.string().trim().max(40).regex(/^[0-9+()\s-]*$/),access_code:z.string().max(100),id:z.guid().optional(),version:z.number().int().positive().optional(),customer_version:z.number().int().positive().optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;
 const body=await request.json().catch(()=>null);
 if(body&&typeof body==='object'&&'customer_id' in body){
  const existing=z.object({relationship,customer_id:z.guid(),access_code:z.string().trim().max(100)}).strict().safeParse(body);
  if(!existing.success)return Response.json({error:'연결할 고객과 출입 비밀번호를 확인하세요.'},{status:400});
  const customer=await c.db.from('customers').select('id').eq('id',existing.data.customer_id).is('deleted_at',null).maybeSingle();
  if(customer.error)return Response.json({error:'고객 조회에 실패했습니다.'},{status:500});
  if(!customer.data)return Response.json({error:'연결할 고객을 찾을 수 없습니다.'},{status:404});
  const linked=await c.db.from('property_contacts').insert({office_id:c.staff.office_id,property_id:id,customer_id:customer.data.id,access_code:existing.data.access_code,relationship:existing.data.relationship??'other'}).select('id').single();
  if(linked.error)return Response.json({error:linked.error.code==='23505'?'이미 이 매물에 연결된 고객입니다.':'고객을 연결하지 못했습니다. 고객과 매물 상태를 다시 확인하세요.'},{status:linked.error.code==='23505'?409:400});
  return Response.json(linked.data,{status:201,headers:{'Cache-Control':'private, no-store'}});
 }
 const parsed=input.safeParse(body);if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message??'입력값을 확인하세요.'},{status:400});const p=parsed.data;
 const {data,error}=await c.db.rpc('save_property_contact_v2',{p_relationship:p.relationship??null,p_property:id,p_name:p.name,p_phone:p.phone,p_phone2:p.phone2,p_access_code:p.access_code,p_contact:p.id??null,p_version:p.version??null,p_customer_version:p.customer_version??null});
 if(error)return Response.json({error:error.code==='40001'?'고객 정보가 변경되었거나 수정 권한이 없습니다. 새로고침하세요.':'관련 고객 저장 실패: DB 016 업데이트와 입력값을 확인하세요.'},{status:error.code==='40001'?409:400});
 return Response.json({id:data},{status:p.id?200:201,headers:{'Cache-Control':'private, no-store'}});
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;
 const p=z.object({id:z.guid(),version:z.number().int().positive()}).strict().safeParse(await request.json().catch(()=>null));if(!p.success)return Response.json({error:'연결 정보를 확인하세요.'},{status:400});
 const r=await c.db.from('property_contacts').delete().eq('id',p.data.id).eq('property_id',id).eq('version',p.data.version).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'연결이 변경되었습니다. 새로고침하세요.'},{status:409});return new Response(null,{status:204});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){const c=await propertyContext(request);if(c.error)return c.error;const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;const p=z.object({id:z.guid(),version:z.number().int().positive(),relationship:z.enum(['landlord','tenant','seller','buyer','resident','other']),access_code:z.string().trim().max(100)}).strict().safeParse(await request.json().catch(()=>null));if(!p.success)return Response.json({error:'연결 정보를 확인하세요.'},{status:400});const r=await c.db.from('property_contacts').update({relationship:p.data.relationship,access_code:p.data.access_code}).eq('id',p.data.id).eq('property_id',id).eq('version',p.data.version).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'연결 정보가 변경되었거나 권한이 없습니다. 새로고침하세요.'},{status:409});return Response.json(r.data);}
