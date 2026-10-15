import { z } from 'zod';
import { propertyContext } from '@/lib/properties/server';
import { normalizeAddress } from '@/lib/properties/shared';
export async function GET(request: Request) {
  const c = await propertyContext(); if (c.error) return c.error;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = z.object({ address: z.string().trim().min(4).max(500), floor: z.coerce.number().int().min(-20).max(300).optional(), exclude: z.guid().optional() }).strict().safeParse(params);
  if (!parsed.success) return Response.json({ error: '주소를 확인하세요.' }, { status: 400 });
  let query = c.db.from('properties').select('id,title,building_name,floor,area_m2,property_type,status').eq('normalized_address', normalizeAddress(parsed.data.address)).is('deleted_at', null).limit(10);
  if (parsed.data.floor !== undefined) query = query.eq('floor', parsed.data.floor);
  if (parsed.data.exclude) query = query.neq('id', parsed.data.exclude);
  const { data, error } = await query;
  if (error) return Response.json({ error: '중복 가능성을 확인하지 못했습니다.' }, { status: 500 });
  return Response.json({ candidates: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
