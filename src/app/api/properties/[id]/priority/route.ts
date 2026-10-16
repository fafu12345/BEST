import {z} from 'zod';
import {propertyContext,editableProperty,conflict} from '@/lib/properties/server';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const c=await propertyContext(request);if(c.error)return c.error;
 const {id}=await params;const target=await editableProperty(c,id);if(target.error)return target.error;
 const p=z.object({is_priority:z.boolean(),version:z.number().int().positive()}).strict().safeParse(await request.json().catch(()=>null));
 if(!p.success)return Response.json({error:'급한 매물 선택값을 확인하세요.'},{status:400});
 const r=await c.db.from('properties').update({is_priority:p.data.is_priority}).eq('id',id).eq('version',p.data.version).is('deleted_at',null).select('id,is_priority,version').maybeSingle();
 if(r.error||!r.data)return conflict();return Response.json(r.data);
}
