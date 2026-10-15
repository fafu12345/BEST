import { z } from 'zod';
import { customerContext,customerTarget } from '@/lib/customers/server';
import { updateCustomerInput } from '@/lib/customers/shared';
type Context={params:Promise<{id:string}>};
export async function GET(_r:Request,{params}:Context){const c=await customerContext();const target=await customerTarget(c,(await params).id);if(target.error)return target.error;return Response.json(target.customer,{headers:{'Cache-Control':'private, no-store'}});}
export async function PATCH(request:Request,{params}:Context){
 const c=await customerContext(request);if(c.error)return c.error;const {id}=await params;const target=await customerTarget(c,id,true);if(target.error)return target.error;
 const parsed=updateCustomerInput.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
 const {assigned_staff_id,...values}=parsed.data.customer;
 if(assigned_staff_id&&assigned_staff_id!==target.customer.assigned_staff_id&&!['owner','manager'].includes(c.staff.role))return Response.json({error:'담당자 변경은 대표·관리자만 가능합니다.'},{status:403});
 const {data,error}=await c.db.from('customers').update({...values,...(assigned_staff_id?{assigned_staff_id}:{})}).eq('id',id).eq('version',parsed.data.version).is('deleted_at',null).select('id,version').maybeSingle();
 if(error||!data)return Response.json({error:'다른 사용자가 변경했거나 권한이 없습니다. 새로고침하세요.'},{status:409});
 return Response.json(data);
}
export async function DELETE(request:Request,{params}:Context){
 const c=await customerContext(request);if(c.error)return c.error;const {id}=await params;const target=await customerTarget(c,id,true);if(target.error)return target.error;
 const parsed=z.object({version:z.number().int().positive()}).strict().safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'버전 정보가 필요합니다.'},{status:400});
 const {data,error}=await c.db.from('customers').update({deleted_at:new Date().toISOString()}).eq('id',id).eq('version',parsed.data.version).is('deleted_at',null).select('id').maybeSingle();
 if(error||!data)return Response.json({error:'삭제하지 못했습니다. 새로고침 후 다시 시도하세요.'},{status:409});return new Response(null,{status:204});
}
