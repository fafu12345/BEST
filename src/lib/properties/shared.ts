import { z } from 'zod';

export const propertyTypes = { retail: '상가', office: '사무실', apartment: '아파트', officetel: '오피스텔' } as const;
export const transactionTypes = { sale: '매매', lease: '전세', rent: '월세' } as const;
export const statuses = { available: '거래 가능', reserved: '계약 진행', closed: '거래 완료', on_hold: '보류' } as const;
const money = z.number().int().min(0).max(9_000_000_000_000_000);
const text = (max: number) => z.string().trim().max(max);
export const propertyInput = z.object({
  title: text(200).min(1), building_name: text(200), address: text(500).min(4),
  property_type: z.enum(['retail', 'office', 'apartment', 'officetel']),
  transaction_type: z.enum(['sale', 'lease', 'rent']), price: money, deposit: money,
  area_m2: z.number().positive().max(9_999_999_999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.001, '면적은 소수점 두 자리까지 입력하세요.'),
  floor: z.number().int().min(-20).max(300).nullable(), total_floors: z.number().int().min(1).max(300).nullable(),
  status: z.enum(['available', 'reserved', 'closed', 'on_hold']), description: text(10000),
  premium: money, business_type: text(100), facilities: text(5000), complex_name: text(200),
  building_dong: text(40), unit_number: text(40), room_count: z.number().int().min(0).max(100).nullable(),
  assigned_staff_id: z.guid().optional(), confirm: z.boolean().default(false),
}).strict().refine(p => p.floor === null || p.total_floors === null || p.floor <= p.total_floors, { message: '현재 층이 전체 층보다 높습니다.', path: ['floor'] });
export const updateInput = z.object({ property: propertyInput, version: z.number().int().positive() }).strict();
export type PropertyInput = z.infer<typeof propertyInput>;
export type Property = Omit<PropertyInput, 'confirm' | 'assigned_staff_id'> & {
  id: string; office_id: string; assigned_staff_id: string; version: number;
  last_confirmed_at: string | null; created_at: string; updated_at: string; deleted_at: string | null;
};
export type StaffOption = { id: string; display_name: string; role: string; active: boolean };
export type PropertyFile = { id: string; file_kind: 'photo' | 'floorplan'; original_name: string; mime_type: string | null; caption: string; storage_path: string };
export type Change = { id: string; event: string; actor_staff_id: string | null; old_values: Record<string, string | number | null> | null; new_values: Record<string, string | number | null>; created_at: string };
export function moneyLabel(value: number) {
  const eok = Math.floor(value / 100_000_000);
  const man = Math.floor((value % 100_000_000) / 10000);
  const won = value % 10000;
  return [eok ? `${eok.toLocaleString('ko-KR')}억` : '', man ? `${man.toLocaleString('ko-KR')}만` : '', won ? won.toLocaleString('ko-KR') : ''].filter(Boolean).join(' ') + (value ? ' 원' : '0 원');
}
export function wanToWon(value: string) {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) throw new Error('금액은 0 이상의 숫자이며 만 원 단위 소수점 4자리까지 입력할 수 있습니다.');
  const [whole, fraction = ''] = value.split('.');
  const won = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  if (won > 9000000000000000n) throw new Error('금액이 입력 가능한 범위를 넘었습니다.');
  return Number(won);
}
export function wonToWan(value: number) {
  const whole = Math.floor(value / 10000);
  const tail = String(value % 10000).padStart(4, '0').replace(/0+$/, '');
  return `${whole}${tail ? `.${tail}` : ''}`;
}
export function areaLabel(value: number | null) { return value === null ? '미입력' : `${(value / 3.305785).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}평 (${value.toLocaleString('ko-KR')}㎡)`; }
export function dateLabel(value: string | null) { return value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '미확인'; }
export function canEdit(staff: { id: string; role: string }, property: { assigned_staff_id: string }) { return ['owner', 'manager'].includes(staff.role) || staff.id === property.assigned_staff_id; }
export function normalizeAddress(address: string) { return address.toLowerCase().replace(/[\s\p{P}]/gu, ''); }
