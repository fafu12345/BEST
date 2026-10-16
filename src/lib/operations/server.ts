import 'server-only';
import {z} from 'zod';
import type {supabaseServer} from '@/lib/supabase/server';
import {koreaToday} from '@/lib/expiration/shared';
import type {NoticeResult,Statistics} from './shared';
type DB=Awaited<ReturnType<typeof supabaseServer>>;type Staff={id:string;role:string};
const assignedSchema=z.union([z.literal('all'),z.guid()]);
export async function operationFilters(db:DB,staff:Staff,raw:Record<string,unknown>){
 const parsed=z.object({assigned:assignedSchema.default(['owner','manager'].includes(staff.role)?'all':staff.id),page:z.coerce.number().int().min(1).max(100000).default(1)}).safeParse(raw);
 if(!parsed.success)return {error:'담당자·페이지를 확인하세요.'} as const;
 const people=await db.from('staff').select('id,display_name,active').order('display_name');
 if(people.error)return {error:'직원 정보를 조회하지 못했습니다.'} as const;
 if(parsed.data.assigned!=='all'&&!people.data.some(s=>s.id===parsed.data.assigned))return {error:'같은 사무소의 담당자를 선택하세요.'} as const;
 return {filters:parsed.data,people:people.data,assigned:parsed.data.assigned==='all'?null:parsed.data.assigned} as const;
}
export async function notifications(db:DB,staff:Staff,raw:Record<string,unknown>){
 const base=await operationFilters(db,staff,raw);if(base.error)return base;
 const p=z.object({state:z.enum(['all','unread','read','dismissed']).default('unread'),kind:z.enum(['all','expiration','closing','customer_contact','relocation_contact','property_recheck','renewal_pending']).default('all')}).safeParse(raw);
 if(!p.success)return {error:'알림 검색 조건을 확인하세요.'} as const;
 const r=await db.rpc('operations_notifications',{p_assigned:base.assigned,p_page:base.filters.page,p_state:p.data.state,p_kind:p.data.kind});
 if(r.error){console.warn(`[notifications] code=${r.error.code||'UNKNOWN'}`);return {error:`알림 조회 실패 (${r.error.code||'UNKNOWN'}). 014 DB 업데이트와 연결 상태를 확인하세요.`} as const;}
 return {...base,filters:{...base.filters,...p.data},data:r.data as NoticeResult} as const;
}
export async function statistics(db:DB,staff:Staff,raw:Record<string,unknown>){
 const base=await operationFilters(db,staff,raw);if(base.error)return base;const today=koreaToday();
 const p=z.object({from:z.iso.date().default(today.slice(0,4)+'-01-01'),to:z.iso.date().default(today)}).refine(v=>v.from<=v.to&&(Date.parse(v.to)-Date.parse(v.from))/86400000<=731).safeParse(raw);
 if(!p.success)return {error:'조회 기간은 시작일 이후 최대 24개월로 선택하세요.'} as const;
 const r=await db.rpc('operations_statistics',{p_from:p.data.from,p_to:p.data.to,p_assigned:base.assigned});
 if(r.error){console.warn(`[statistics] code=${r.error.code||'UNKNOWN'}`);return {error:`통계 조회 실패 (${r.error.code||'UNKNOWN'}). 014 DB 업데이트와 연결 상태를 확인하세요.`} as const;}
 return {...base,filters:{...base.filters,...p.data},data:r.data as Statistics} as const;
}
