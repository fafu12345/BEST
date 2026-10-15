import { customerContext,customerTarget } from '@/lib/customers/server';
import { consultationInput } from '@/lib/customers/shared';
type Context={params:Promise<{id:string}>};
export async function GET(_r:Request,{params}:Context){const c=await customerContext();if(c.error)return c.error;const {id}=await params;const target=await customerTarget(c,id);if(target.error)return target.error;
 const {data,error}=await c.db.from('consultations').select('*').eq('customer_id',id).order('consulted_at',{ascending:false}).limit(100);if(error)return Response.json({error:'상담 기록 조회 실패'},{status:500});return Response.json({consultations:data},{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(request:Request,{params}:Context){
 const c=await customerContext(request);if(c.error)return c.error;const {id}=await params;const target=await customerTarget(c,id,true);if(target.error)return target.error;
 const parsed=consultationInput.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
 if(parsed.data.property_id){const p=await c.db.from('properties').select('id').eq('id',parsed.data.property_id).is('deleted_at',null).maybeSingle();if(p.error||!p.data)return Response.json({error:'연결할 매물을 확인하세요.'},{status:400});}
 const {data,error}=await c.db.from('consultations').insert({...parsed.data,office_id:c.staff.office_id,assigned_staff_id:c.staff.id,customer_id:id}).select('id').single();if(error)return Response.json({error:'상담을 기록하지 못했습니다.'},{status:400});return Response.json(data,{status:201});
}
