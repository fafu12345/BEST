import {z} from 'zod';
import { propertyInput } from '@/lib/properties/shared';
import { propertyContext, mutationValues } from '@/lib/properties/server';
export async function POST(request: Request) {
  const context = await propertyContext(request);
  if (context.error) return context.error;
  const parsed = propertyInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' }, { status: 400 });
  const { values, confirm, assigned_staff_id } = mutationValues(parsed.data);
  // Registration always assigns the authenticated staff member. Managers can reassign after creation.
  if (assigned_staff_id && assigned_staff_id !== context.staff.id) return Response.json({ error: '등록 시 담당자는 자동 지정됩니다.' }, { status: 400 });
  const { data, error } = await context.db.from('properties').insert({ ...values, office_id: context.staff.office_id, assigned_staff_id: context.staff.id, ...(confirm ? { last_confirmed_at: new Date().toISOString() } : {}) }).select('id,version').single();
  if (error) return Response.json({ error: '매물을 등록하지 못했습니다. 입력값과 담당자 상태를 확인하세요.' }, { status: 400 });
  return Response.json(data, { status: 201 });
}

export async function GET(request:Request){
 const c=await propertyContext();if(c.error)return c.error;
 const p=z.object({q:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!p.success)return Response.json({error:'검색 조건을 확인하세요.'},{status:400});
 let q=c.db.from('properties').select('id,title,building_name,complex_name,building_dong,unit_number,property_type,transaction_type,status',{count:'exact'}).is('deleted_at',null).order('created_at',{ascending:false}).order('id');
 if(p.data.q)q=q.ilike('search_text',`%${p.data.q.replace(/[\\%_]/g,'\\$&')}%`);
 const r=await q.range((p.data.page-1)*20,p.data.page*20-1);if(r.error)return Response.json({error:'매물 검색 실패'},{status:500});return Response.json({data:r.data,count:r.count},{headers:{'Cache-Control':'private, no-store'}});
}
