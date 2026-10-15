import 'server-only';
import { z } from 'zod';
import { currentStaff, sameOrigin } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { canEdit, type PropertyInput } from './shared';

export async function propertyContext(request?: Request) {
  if (request && !sameOrigin(request)) return { error: Response.json({ error: '허용하지 않는 요청 출처입니다.' }, { status: 403 }) } as const;
  const staff = await currentStaff();
  if (!staff) return { error: Response.json({ error: '로그인과 활성 직원 소속이 필요합니다.' }, { status: 401 }) } as const;
  return { staff, db: await supabaseServer() } as const;
}
export const validId = (id: string) => z.guid().safeParse(id).success;
export function mutationValues(input: PropertyInput, existing?: {transaction_type: string; deposit: number; monthly_rent: number | null}) {
  const { confirm, assigned_staff_id, ...values } = input;
  // Clear fields from a previous type so hidden form values cannot linger.
  if (values.property_type !== 'retail') { values.premium = 0; values.business_type = ''; values.facilities = ''; }
  if (!['apartment','officetel'].includes(values.property_type)) { values.complex_name = ''; values.building_dong = ''; }
  if (values.property_type !== 'retail') values.store_name = '';
  if (!['apartment', 'officetel'].includes(values.property_type)) values.room_count = null;
  // Keep old API payloads and stored price semantics readable while adding rental income to every transaction type.
  if (values.transaction_type === 'lease') {
    if (values.monthly_rent === undefined) values.deposit = values.price;
    values.price = values.deposit;
  }
  if (values.monthly_rent === undefined) {
    if (values.transaction_type==='sale' && existing?.transaction_type==='sale') values.deposit=existing.deposit;
    values.monthly_rent=values.transaction_type==='rent' ? values.price : existing?.transaction_type===values.transaction_type ? existing.monthly_rent??0 : 0;
  }
  if (values.transaction_type === 'rent') values.price = values.monthly_rent;
  return { values, confirm, assigned_staff_id };
}
export async function editableProperty(context: Awaited<ReturnType<typeof propertyContext>>, id: string) {
  if (context.error) return { error: context.error } as const;
  if (!validId(id)) return { error: Response.json({ error: '매물을 찾을 수 없습니다.' }, { status: 404 }) } as const;
  const { data, error } = await context.db.from('properties').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) return { error: Response.json({ error: '매물을 조회하지 못했습니다.' }, { status: 500 }) } as const;
  if (!data) return { error: Response.json({ error: '매물을 찾을 수 없습니다.' }, { status: 404 }) } as const;
  if (!canEdit(context.staff, data)) return { error: Response.json({ error: '담당자 또는 대표·관리자만 변경할 수 있습니다.' }, { status: 403 }) } as const;
  return { property: data } as const;
}
export const conflict = () => Response.json({ error: '다른 사용자가 변경했거나 수정 권한이 없습니다. 새로고침 후 다시 시도하세요.' }, { status: 409 });
