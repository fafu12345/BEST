import { z } from 'zod';
import { propertyContext } from '@/lib/properties/server';
import { normalizeAddress } from '@/lib/properties/shared';
export async function GET(request: Request) {
  const c = await propertyContext(); if (c.error) return c.error;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = z.object({
    address: z.string().trim().min(4).max(500).optional(),
    building_id: z.guid().optional(), unit_number: z.string().trim().min(1).max(40).optional(),
    building_dong: z.string().trim().max(40).optional(),
    floor: z.coerce.number().int().min(-20).max(300).optional(), exclude: z.guid().optional(),
  }).strict().refine(p => Boolean(p.address) !== Boolean(p.building_id && p.unit_number)).safeParse(params);
  if (!parsed.success) return Response.json({ error: '주소 또는 건물·호실을 확인하세요.' }, { status: 400 });
  const p=parsed.data;
  let query = c.db.from('properties').select('id,title,building_name,floor,area_m2,property_type,status').is('deleted_at', null).limit(10);
  if (p.building_id && p.unit_number) {
    query=query.eq('building_id',p.building_id).eq('unit_number',p.unit_number).eq('building_dong',p.building_dong??'');
  } else {
    query=query.eq('normalized_address',normalizeAddress(p.address!));
    if (p.floor !== undefined) query=query.eq('floor',p.floor);
  }
  if (p.exclude) query = query.neq('id', p.exclude);
  const { data, error } = await query;
  if (error) return Response.json({ error: '중복 가능성을 확인하지 못했습니다.' }, { status: 500 });
  return Response.json({ candidates: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
