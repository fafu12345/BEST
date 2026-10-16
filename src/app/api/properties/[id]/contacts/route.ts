import { z } from 'zod';
import { propertyContext, editableProperty } from '@/lib/properties/server';
const phone=z.string().trim().max(40).regex(/^[0-9+()\s-]*$/).refine(v=>v.replace(/\D/g,'').length>=7&&v.replace(/\D/g,'').length<=20,'전화번호1을 입력하세요.');
const input=z.object({name:z.string().trim().max(100),phone,phone2:z.string().trim().max(40).regex(/^[0-9+()\s-]*$/),access_code:z.string().max(100),id:z.guid().optional(),version:z.number().int().positive().optional(),customer_version:z.number().int().positive().optional()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;
 const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message??'입력값을 확인하세요.'},{status:400});const p=parsed.data;
 const {data,error}=await c.db.rpc('save_property_contact',{p_property:id,p_name:p.name,p_phone:p.phone,p_phone2:p.phone2,p_access_code:p.access_code,p_contact:p.id??null,p_version:p.version??null,p_customer_version:p.customer_version??null});
 if(error)return Response.json({error:error.code==='40001'?'고객 정보가 변경되었거나 수정 권한이 없습니다. 새로고침하세요.':'관련 고객 저장 실패: DB 015 업데이트와 입력값을 확인하세요.'},{status:error.code==='40001'?409:400});
 return Response.json({id:data},{status:p.id?200:201,headers:{'Cache-Control':'private, no-store'}});
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;
 const p=z.object({id:z.guid(),version:z.number().int().positive()}).strict().safeParse(await request.json().catch(()=>null));if(!p.success)return Response.json({error:'연결 정보를 확인하세요.'},{status:400});
 const r=await c.db.from('property_contacts').delete().eq('id',p.data.id).eq('property_id',id).eq('version',p.data.version).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'연결이 변경되었습니다. 새로고침하세요.'},{status:409});return new Response(null,{status:204});
}
