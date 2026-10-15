import {z} from 'zod';
import {propertyContext,editableProperty} from '@/lib/properties/server';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;
 const parsed=z.union([z.object({history_id:z.guid()}).strict(),z.object({all:z.literal(true)}).strict()]).safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'삭제할 이력을 선택하세요.'},{status:400});
 let query=c.db.from('property_change_history').delete().eq('property_id',id).eq('office_id',c.staff.office_id);
 if('history_id' in parsed.data)query=query.eq('id',parsed.data.history_id);
 const {data,error}=await query.select('id');if(error)return Response.json({error:'이력을 삭제하지 못했습니다.'},{status:409});if('history_id' in parsed.data&&!data?.length)return Response.json({error:'이력을 찾을 수 없습니다.'},{status:404});return Response.json({deleted:data?.length??0});
}
