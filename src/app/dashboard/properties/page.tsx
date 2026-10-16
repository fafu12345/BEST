import {PriorityToggle} from '@/components/properties/priority-toggle';
import {InlineRemarks} from '@/components/properties/inline-remarks';
import {currentStaff} from '@/lib/auth';
import {PropertyContacts,type PropertyContact} from '@/components/properties/property-contacts';
import {canEdit} from '@/lib/properties/shared';
import {koreaToday} from '@/lib/expiration/shared';
import Link from 'next/link';
import { BuildingFilters } from '@/components/properties/building-filters';
import { PropertyFilters } from '@/components/properties/property-filters';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { directions, areaLabel, statusClass, wanToWon, propertyTypes, transactionTypes, statuses, propertyPriceLabel, type Property } from '@/lib/properties/shared';
const optionalNumber = (min: number, max: number) => z.preprocess(v => v === '' || v === undefined ? undefined : Number(v), z.number().min(min).max(max).optional());
const filters = z.object({
  priority:z.enum(['','on']).default(''),
  direction:z.enum(['','south','north','west','east']).default(''),
  excludeClosed:z.enum(['','on']).default(''),
  assigned:z.union([z.literal(''),z.guid()]).default(''),recheck:z.enum(['','due']).default(''),
  q: z.string().trim().max(200).default(''), type: z.enum(['', 'retail','office','apartment','officetel']).default(''),
  transaction: z.enum(['', 'sale','lease','rent']).default(''), status: z.enum(['', 'available','reserved','closed','on_hold']).default(''),
  building: z.union([z.literal(''),z.guid()]).default(''), area: optionalNumber(0.01,9_999_999_999.99),
  minPrice: z.string().default(''), maxPrice: z.string().default(''),
  page: z.preprocess(v => v === undefined ? 1 : Number(v), z.number().int().min(1).max(100000)),
});
export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const values = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k,Array.isArray(v) ? v[0] : v]));
  const parsed = filters.safeParse(values);
  let searchError = parsed.success ? '' : '검색 조건과 전용면적을 확인해 주세요.';
  const f = parsed.success ? parsed.data : filters.parse({});
  let minPrice: number | undefined, maxPrice: number | undefined;
  try { if (f.minPrice) minPrice = wanToWon(f.minPrice); if (f.maxPrice) maxPrice = wanToWon(f.maxPrice); if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new Error(); }
  catch { searchError = '가격 범위를 만 원 단위로 올바르게 입력하세요.'; }
  const staff=await currentStaff();
  const db = await supabaseServer();
  let query = db.from('properties').select('*', { count: 'exact' }).is('deleted_at', null).order('is_priority',{ascending:false}).order('created_at', { ascending: false }).order('id');
  if (f.q) query = query.ilike('search_text', `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  if(f.assigned)query=query.eq('assigned_staff_id',f.assigned);
  if(f.recheck==='due'){const today=koreaToday();const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-29);const cutoff=new Date(d.toISOString().slice(0,10)+'T00:00:00+09:00').toISOString();const next=new Date(today+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);const tomorrow=new Date(next.toISOString().slice(0,10)+'T00:00:00+09:00').toISOString();query=query.neq('status','closed').or(`next_confirmation_date.lte.${today},and(next_confirmation_date.is.null,last_confirmed_at.lt.${cutoff}),and(next_confirmation_date.is.null,last_confirmed_at.is.null,created_at.lt.${tomorrow})`);}
  if(f.priority==='on')query=query.eq('is_priority',true);
  if(f.direction)query=query.eq('direction',f.direction);
  if (f.type) query = query.eq('property_type', f.type);
  if (f.transaction) query = query.eq('transaction_type', f.transaction);
  if(f.excludeClosed==='on')query=query.neq('status','closed');
  if (f.status) query = query.eq('status', f.status);
  if (minPrice !== undefined) query = query.gte('price', minPrice);
  if (maxPrice !== undefined) query = query.lte('price', maxPrice);
  if (f.building) query=query.eq('building_id',f.building);
  if (f.area !== undefined) query=query.eq('area_m2',f.area);
  const result = searchError ? { data: [], count: 0, error: null } : await query.range((f.page-1)*20, f.page*20-1);
  if (result.error) throw new Error('매물 목록을 조회하지 못했습니다.');
  const properties = (result.data ?? []) as Property[];
  const { data: colleagues, error } = await db.from('staff').select('id,display_name');
  if (error) throw new Error('직원 목록을 조회하지 못했습니다.');
  const contactsResult=properties.length?await db.from('property_contacts').select('id,property_id,access_code,relationship,version,customers!inner(id,name,phone,phone2,version,assigned_staff_id)').in('property_id',properties.map(p=>p.id)).is('customers.deleted_at',null).order('created_at'):{data:[],error:null};
  let contactError=contactsResult.error?'관련 고객 조회 실패: DB 015 업데이트를 확인하세요.':'';
  if(contactsResult.data?.length){const audit=await db.rpc('record_customer_access',{p_customer:null});if(audit.error)contactError='고객 접근기록을 저장하지 못했습니다.';}
  const contacts=contactError?[]:(contactsResult.data??[]) as unknown as PropertyContact[];
  const related=(p:Property)=><PropertyContacts propertyId={p.id} contacts={contacts.filter(c=>c.property_id===p.id)} editable={!!staff&&canEdit(staff,p)} staffId={staff?.id??''} manager={!!staff&&['owner','manager'].includes(staff.role)}/>;
  const price=propertyPriceLabel;
  const buildingResult=await db.from('property_buildings').select('id,property_type,name').or(f.building?`deleted_at.is.null,id.eq.${f.building}`:'deleted_at.is.null').order('name');
  if(buildingResult.error) throw new Error('건물·단지 목록을 조회하지 못했습니다.');
  const link = (page: number) => { const p = new URLSearchParams(Object.entries(values).filter((x): x is [string,string] => typeof x[1] === 'string')); p.set('page',String(page)); return `/dashboard/properties?${p}`; };
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-teal-700">우리 사무소의 매물을 한눈에</p><h1 className="mt-2 text-3xl font-bold">매물관리</h1></div><Link className="btn-primary" href="/dashboard/properties/new">＋ 매물 등록</Link></div><p className="mb-3 text-right text-xs"><Link className="text-teal-800 underline" href="/dashboard/buildings">건물·단지 보기 관리</Link></p>
    <form className="rounded-xl border bg-white p-4 mb-4 space-y-3" action="/dashboard/properties"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><BuildingFilters buildings={buildingResult.data??[]} initialType={f.type} initialBuilding={f.building}/><label className="field sm:col-span-2">주소·상호·호실 검색<input name="q" maxLength={200} defaultValue={values.q} placeholder="건물명, 주소, 상호, 호실"/></label><label className="field">거래 방식<select name="transaction" defaultValue={values.transaction??''}><option value="">전체 거래</option>{Object.entries(transactionTypes).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></div><PropertyFilters initiallyOpen={Object.entries(values).some(([key,value])=>['direction','status','minPrice','maxPrice','area','assigned','recheck'].includes(key)&&!!value)}><label className="field">담당 직원<select name="assigned" defaultValue={f.assigned}><option value="">사무소 전체</option>{colleagues?.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label><label className="field">방향<select name="direction" defaultValue={f.direction}><option value="">전체 방향</option>{Object.entries(directions).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label className="field">재확인<select name="recheck" defaultValue={f.recheck}><option value="">전체</option><option value="due">확인 필요</option></select></label><label className="field">거래 상태<select name="status" defaultValue={values.status??''}><option value="">전체 상태</option>{Object.entries(statuses).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
    {([['minPrice','최소 가격 (만 원)'],['maxPrice','최대 가격 (만 원)'],['area','전용면적 (㎡)']] as const).map(([name,label])=><label className="field" key={name}>{label}<input name={name} type="number" step={name==='area'?'0.01':'any'} min={name==='area'?0.01:0} defaultValue={values[name]}/>{name==='area'&&<span className="hint">입력한 전용면적과 같은 매물을 표시합니다.</span>}</label>)}</PropertyFilters><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="priority" defaultChecked={f.priority==='on'}/>★ 급한 매물만 보기</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="excludeClosed" defaultChecked={f.excludeClosed==='on'}/>거래 완료 매물 제외</label><p className="hint sr-only">가격은 매매가격·전세 보증금·월세 기준입니다. 삭제한 매물은 제외됩니다.</p><div className="flex gap-2"><Link className="btn-secondary" href="/dashboard/properties">초기화</Link><button className="btn-primary">검색</button></div></div></form>
    {searchError && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-red-800">{searchError}</p>}
    {contactError&&<p role="alert" className="mb-4 text-sm text-red-700">{contactError}</p>}
    <p className="mb-3 text-sm text-slate-600">총 <strong>{result.count ?? 0}</strong>개 · {f.page}페이지 · ★ 급한 매물 우선</p>
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-100 text-slate-600"><tr>{['매물 / 관련 고객','유형 / 거래','전용면적 / 층','가격 / 상태','거래희망일 / 일정 메모','비고'].map(t => <th key={t} className="whitespace-nowrap px-3 py-2 font-medium">{t}</th>)}</tr></thead><tbody>{properties.map(p => <tr key={p.id} className="border-b border-slate-100 hover:bg-teal-50/40"><td className="min-w-52 max-w-80 px-3 py-2 align-top"><PriorityToggle key={p.id+':'+p.version} id={p.id} version={p.version} marked={p.is_priority} editable={!!staff&&canEdit(staff,p)}/><Link className="block truncate font-semibold text-slate-900 hover:text-teal-800 hover:underline" href={`/dashboard/properties/${p.id}`}>{p.title}</Link>{p.building_id&&<Link className="text-[10px] text-slate-400 underline" href={'/dashboard/buildings/'+p.building_id}>건물별 호실 보기</Link>}{!contactError&&related(p)}</td><td className="whitespace-nowrap px-3 py-2">{propertyTypes[p.property_type] ?? p.property_type}<p className="mt-1 text-slate-500">{transactionTypes[p.transaction_type]}</p></td><td className="whitespace-nowrap px-3 py-2">{areaLabel(p.area_m2)}<p className="mt-1 text-slate-500">{p.floor ?? '-'} / {p.total_floors ?? '-'}층{p.direction&&` · ${directions[p.direction]}`}</p></td><td className="min-w-36 px-3 py-2"><p className="font-semibold text-xs">{price(p)}</p><span className={statusClass(p.status)}>{statuses[p.status]}</span></td><td className="max-w-52 px-3 py-2 text-xs"><p>{p.desired_transaction_date||''}</p><p className="line-clamp-2 whitespace-pre-wrap break-words" title={p.desired_transaction_note}>{p.desired_transaction_note}</p></td><td className="w-44 min-w-28 px-3 py-2"><InlineRemarks key={p.id+':'+p.version} id={p.id} version={p.version} initial={p.remarks??''} editable={!!staff&&canEdit(staff,p)}/></td></tr>)}</tbody></table>{!properties.length && <p className="p-12 text-center text-slate-500">조건에 맞는 매물이 없습니다.</p>}</div>
    <div className="grid gap-4 md:hidden">{properties.map(p => <article className="rounded-xl border bg-white p-3" key={p.id}><div className="flex items-center justify-between gap-2"><span className="text-sm text-slate-500">{propertyTypes[p.property_type] ?? p.property_type} · {transactionTypes[p.transaction_type]}</span><span className={statusClass(p.status)}>{statuses[p.status]}</span></div><PriorityToggle key={p.id+':'+p.version} id={p.id} version={p.version} marked={p.is_priority} editable={!!staff&&canEdit(staff,p)}/><h2 className="mt-1 text-base font-bold"><Link href={`/dashboard/properties/${p.id}`}>{p.title}</Link></h2>{!contactError&&related(p)}<p className="mt-2 text-sm font-bold text-teal-900">{price(p)}</p><p className="mt-2 text-sm">{areaLabel(p.area_m2)} · {p.floor ?? '-'}층{p.direction&&` · ${directions[p.direction]}`}</p>{p.building_id&&<Link className="text-xs text-slate-500 underline" href={'/dashboard/buildings/'+p.building_id}>건물별 호실 보기</Link>}<div className="mt-2 flex gap-2 text-xs text-slate-600"><span>{p.desired_transaction_date}</span><p className="line-clamp-2">{p.desired_transaction_note}</p></div><div className="mt-2"><InlineRemarks key={p.id+':'+p.version} id={p.id} version={p.version} initial={p.remarks??''} editable={!!staff&&canEdit(staff,p)}/></div></article>)}{!properties.length && <p className="panel text-center text-slate-500">조건에 맞는 매물이 없습니다.</p>}</div>
    <nav aria-label="매물 페이지" className="mt-6 flex justify-center gap-3">{f.page>1 && <Link className="btn-secondary" href={link(f.page-1)}>이전</Link>}{f.page*20<(result.count ?? 0) && <Link className="btn-secondary" href={link(f.page+1)}>다음</Link>}</nav>
  </>;
}
