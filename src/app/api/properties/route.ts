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
