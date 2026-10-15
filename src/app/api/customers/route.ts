import { customerInput } from '@/lib/customers/shared';
import { customerContext,customerList } from '@/lib/customers/server';
export async function GET(request:Request){const c=await customerContext();if(c.error)return c.error;return Response.json(await customerList(c.db,Object.fromEntries(new URL(request.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(request:Request){
 const c=await customerContext(request);if(c.error)return c.error;
 const parsed=customerInput.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
 const {assigned_staff_id,...values}=parsed.data;
 if(assigned_staff_id&&assigned_staff_id!==c.staff.id&&!['owner','manager'].includes(c.staff.role))return Response.json({error:'담당자 지정은 대표·관리자만 가능합니다.'},{status:403});
 const {data,error}=await c.db.from('customers').insert({...values,office_id:c.staff.office_id,assigned_staff_id:assigned_staff_id??c.staff.id}).select('id,version').single();
 if(error)return Response.json({error:'고객을 등록하지 못했습니다. 담당자와 입력값을 확인하세요.'},{status:400});
 return Response.json(data,{status:201});
}
