import { z } from 'zod';
import { updateInput } from '@/lib/properties/shared';
import { propertyContext, editableProperty, mutationValues, conflict, validId } from '@/lib/properties/server';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const c = await propertyContext(); if (c.error) return c.error;
  const { id } = await params;
  if (!validId(id)) return Response.json({ error: '매물을 찾을 수 없습니다.' }, { status: 404 });
  const { data, error } = await c.db.from('properties').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) return Response.json({ error: '조회하지 못했습니다.' }, { status: 500 });
  if (!data) return Response.json({ error: '매물을 찾을 수 없습니다.' }, { status: 404 });
  return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PATCH(request: Request, { params }: Context) {
  const c = await propertyContext(request); if (c.error) return c.error;
  const { id } = await params; const target = await editableProperty(c, id); if (target.error) return target.error;
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? '입력값을 확인하세요.' }, { status: 400 });
  const { values, confirm, assigned_staff_id } = mutationValues(parsed.data.property,target.property);
  if (assigned_staff_id && assigned_staff_id !== target.property.assigned_staff_id && !['owner', 'manager'].includes(c.staff.role)) return Response.json({ error: '담당자 변경은 대표·관리자만 가능합니다.' }, { status: 403 });
  const { data, error } = await c.db.from('properties').update({ ...values, ...(assigned_staff_id ? { assigned_staff_id } : {}), ...(confirm ? { last_confirmed_at: new Date().toISOString() } : {}) }).eq('id', id).eq('version', parsed.data.version).is('deleted_at', null).select('id,version').maybeSingle();
  if (error || !data) return conflict();
  return Response.json(data);
}
export async function DELETE(request: Request, { params }: Context) {
  const c = await propertyContext(request); if (c.error) return c.error;
  const { id } = await params; const target = await editableProperty(c, id); if (target.error) return target.error;
  const parsed = z.object({ version: z.number().int().positive() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: '버전 정보가 필요합니다.' }, { status: 400 });
  const { error } = await c.db.rpc('soft_delete_property', { p_id: id, p_version: parsed.data.version });
  if (error) return conflict();
  return new Response(null, { status: 204 });
}
