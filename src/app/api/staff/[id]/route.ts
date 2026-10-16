import { z } from 'zod';
import { propertyContext,validId } from '@/lib/properties/server';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;if(!['owner','manager'].includes(c.staff.role))return Response.json({error:'대표·관리자만 직원 이름을 변경할 수 있습니다.'},{status:403});
 const {id}=await params;const p=z.object({display_name:z.string().trim().min(1).max(80),updated_at:z.iso.datetime({offset:true})}).strict().safeParse(await request.json().catch(()=>null));if(!validId(id)||!p.success)return Response.json({error:'이름과 수정 정보를 확인하세요.'},{status:400});
 const r=await c.db.from('staff').update({display_name:p.data.display_name}).eq('id',id).eq('office_id',c.staff.office_id).eq('updated_at',p.data.updated_at).is('deleted_at',null).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'직원 정보가 변경되었거나 권한이 없습니다. 새로고침하세요.'},{status:409});return Response.json(r.data);
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;if(!['owner','manager'].includes(c.staff.role))return Response.json({error:'직원 삭제 권한이 없습니다.'},{status:403});const {id}=await params;
 const p=z.object({updated_at:z.iso.datetime({offset:true})}).strict().safeParse(await request.json().catch(()=>null));if(!validId(id)||!p.success)return Response.json({error:'직원 정보를 확인하세요.'},{status:400});
 const target=await c.db.from('staff').select('id,role').eq('id',id).eq('office_id',c.staff.office_id).is('deleted_at',null).maybeSingle();if(target.error||!target.data)return Response.json({error:'직원을 찾을 수 없습니다. DB 016 업데이트를 확인하세요.'},{status:404});if(id===c.staff.id||target.data.role==='owner'||c.staff.role==='manager'&&target.data.role!=='agent')return Response.json({error:'본인과 대표 계정은 삭제할 수 없으며, 관리자 삭제는 대표만 가능합니다.'},{status:403});
 const r=await c.db.from('staff').update({active:false,deleted_at:new Date().toISOString()}).eq('id',id).eq('office_id',c.staff.office_id).eq('updated_at',p.data.updated_at).is('deleted_at',null).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'삭제 권한이 없거나 직원 정보가 변경되었습니다. 새로고침하세요.'},{status:409});return new Response(null,{status:204});
}
