import { z } from 'zod';
import { propertyContext } from '@/lib/properties/server';
const type = z.enum(['retail','office','apartment','officetel']);
const input = z.object({ property_type: type, name: z.string().trim().min(1).max(200),address:z.string().trim().max(500).optional(),total_floors:z.number().int().min(1).max(300).nullable().optional() }).strict();
export async function GET(request: Request) {
  const c = await propertyContext(); if (c.error) return c.error;
  const value = new URL(request.url).searchParams.get('type');
  if (value && !type.safeParse(value).success) return Response.json({error:'매물 유형을 확인하세요.'},{status:400});
  let query = c.db.from('property_buildings').select('id,property_type,name,address,total_floors,updated_at').is('deleted_at',null).order('name');
  if (value) query = query.eq('property_type',value);
  const { data,error } = await query;
  if (error) return Response.json({error:'건물·단지 보기를 불러오지 못했습니다.'},{status:500});
  return Response.json({ buildings:data },{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request: Request) {
  const c = await propertyContext(request); if (c.error) return c.error;
  const parsed = input.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({error:'유형과 건물·단지명(1~200자)을 확인하세요.'},{status:400});
  const name = parsed.data.name.replace(/\s+/g,' ');
  const { data,error } = await c.db.from('property_buildings').insert({office_id:c.staff.office_id,property_type:parsed.data.property_type,name,address:parsed.data.address??'',total_floors:parsed.data.total_floors??null}).select('id,property_type,name,address,total_floors,updated_at').single();
  if (!error) return Response.json(data,{status:201});
  if (error.code === '23505') {
    const existing = await c.db.from('property_buildings').select('id,property_type,name,address,total_floors,updated_at').eq('property_type',parsed.data.property_type).eq('normalized_name',name.toLowerCase()).is('deleted_at',null).maybeSingle();
    if (existing.data) return Response.json(existing.data);
  }
  return Response.json({error:error.code==='23505'?'삭제한 보기와 이름이 같습니다. 다른 이름을 사용하세요.':'보기를 추가하지 못했습니다. 다시 시도해 주세요.'},{status:error.code==='23505'?409:400});
}
