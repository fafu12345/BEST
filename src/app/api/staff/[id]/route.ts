import { z } from 'zod';
import { propertyContext,validId } from '@/lib/properties/server';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;if(!['owner','manager'].includes(c.staff.role))return Response.json({error:'대표·관리자만 직원 이름을 변경할 수 있습니다.'},{status:403});
 const {id}=await params;const p=z.object({display_name:z.string().trim().min(1).max(80),updated_at:z.iso.datetime({offset:true})}).strict().safeParse(await request.json().catch(()=>null));if(!validId(id)||!p.success)return Response.json({error:'이름과 수정 정보를 확인하세요.'},{status:400});
 const r=await c.db.from('staff').update({display_name:p.data.display_name}).eq('id',id).eq('office_id',c.staff.office_id).eq('updated_at',p.data.updated_at).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'직원 정보가 변경되었거나 권한이 없습니다. 새로고침하세요.'},{status:409});return Response.json(r.data);
}
