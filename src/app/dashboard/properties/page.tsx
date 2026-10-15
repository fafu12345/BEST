import Link from 'next/link';
import { BuildingFilters } from '@/components/properties/building-filters';
import { PropertyFilters } from '@/components/properties/property-filters';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { areaLabel, dateLabel, wanToWon, propertyTypes, transactionTypes, statuses, propertyPriceLabel, type Property } from '@/lib/properties/shared';
const optionalNumber = (min: number, max: number) => z.preprocess(v => v === '' || v === undefined ? undefined : Number(v), z.number().min(min).max(max).optional());
const filters = z.object({
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
  const db = await supabaseServer();
  let query = db.from('properties').select('*', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).order('id');
  if (f.q) query = query.ilike('search_text', `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  if (f.type) query = query.eq('property_type', f.type);
  if (f.transaction) query = query.eq('transaction_type', f.transaction);
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
  const names = new Map(colleagues?.map(s => [s.id,s.display_name]));
  const price=propertyPriceLabel;
  const buildingResult=await db.from('property_buildings').select('id,property_type,name').order('name');
  if(buildingResult.error) throw new Error('건물·단지 목록을 조회하지 못했습니다.');
  const link = (page: number) => { const p = new URLSearchParams(Object.entries(values).filter((x): x is [string,string] => typeof x[1] === 'string')); p.set('page',String(page)); return `/dashboard/properties?${p}`; };
  return <><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-teal-700">우리 사무소의 매물을 한눈에</p><h1 className="mt-2 text-3xl font-bold">매물관리</h1></div><Link className="btn-primary" href="/dashboard/properties/new">＋ 매물 등록</Link></div>
    <form className="panel mb-6 space-y-4" action="/dashboard/properties"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><BuildingFilters buildings={buildingResult.data??[]} initialType={f.type} initialBuilding={f.building}/><label className="field sm:col-span-2">주소·상호·호실 검색<input name="q" maxLength={200} defaultValue={values.q} placeholder="건물명, 주소, 상호, 호실"/></label><label className="field">거래 방식<select name="transaction" defaultValue={values.transaction??''}><option value="">전체 거래</option>{Object.entries(transactionTypes).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></div><PropertyFilters initiallyOpen={Object.entries(values).some(([key,value])=>['status','minPrice','maxPrice','area'].includes(key)&&!!value)}><label className="field">거래 상태<select name="status" defaultValue={values.status??''}><option value="">전체 상태</option>{Object.entries(statuses).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
    {([['minPrice','최소 가격 (만 원)'],['maxPrice','최대 가격 (만 원)'],['area','전용면적 (㎡)']] as const).map(([name,label])=><label className="field" key={name}>{label}<input name={name} type="number" step={name==='area'?'0.01':'any'} min={name==='area'?0.01:0} defaultValue={values[name]}/>{name==='area'&&<span className="hint">입력한 전용면적과 같은 매물을 표시합니다.</span>}</label>)}</PropertyFilters><div className="flex flex-wrap items-center justify-between gap-3"><p className="hint">가격은 매매가격·전세 보증금·월세 기준입니다. 삭제한 매물은 제외됩니다.</p><div className="flex gap-2"><Link className="btn-secondary" href="/dashboard/properties">초기화</Link><button className="btn-primary">검색</button></div></div></form>
    {searchError && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-red-800">{searchError}</p>}
    <p className="mb-3 text-sm text-slate-600">총 <strong>{result.count ?? 0}</strong>개 · {f.page}페이지</p>
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-100 text-slate-600"><tr>{['매물 / 위치','유형 / 거래','전용면적 / 층','가격','거래 상태','담당 / 최종 확인'].map(t => <th key={t} className="whitespace-nowrap px-4 py-3 font-medium">{t}</th>)}</tr></thead><tbody>{properties.map(p => <tr key={p.id} className="border-b border-slate-100 hover:bg-teal-50/40"><td className="min-w-56 px-4 py-4"><Link className="font-semibold text-slate-900 hover:text-teal-800 hover:underline" href={`/dashboard/properties/${p.id}`}>{p.title}</Link><p className="mt-1 text-xs text-slate-500">{p.building_name || '건물명 미입력'} · {p.address || '주소 미입력'}</p></td><td className="whitespace-nowrap px-4 py-4">{propertyTypes[p.property_type] ?? p.property_type}<p className="mt-1 text-slate-500">{transactionTypes[p.transaction_type]}</p></td><td className="whitespace-nowrap px-4 py-4">{areaLabel(p.area_m2)}<p className="mt-1 text-slate-500">{p.floor ?? '-'} / {p.total_floors ?? '-'}층</p></td><td className="min-w-40 px-4 py-4 font-semibold">{price(p)}</td><td className="px-4 py-4"><span className="status-pill">{statuses[p.status]}</span></td><td className="min-w-40 px-4 py-4">{names.get(p.assigned_staff_id)}<p className="mt-1 text-xs text-slate-500">{dateLabel(p.last_confirmed_at)}</p></td></tr>)}</tbody></table>{!properties.length && <p className="p-12 text-center text-slate-500">조건에 맞는 매물이 없습니다.</p>}</div>
    <div className="grid gap-4 md:hidden">{properties.map(p => <Link className="panel block" href={`/dashboard/properties/${p.id}`} key={p.id}><div className="flex items-center justify-between gap-2"><span className="text-sm text-slate-500">{propertyTypes[p.property_type] ?? p.property_type} · {transactionTypes[p.transaction_type]}</span><span className="status-pill">{statuses[p.status]}</span></div><h2 className="mt-3 text-lg font-bold">{p.title}</h2><p className="mt-1 text-sm text-slate-500">{p.building_name} {p.address}</p><p className="mt-4 font-bold text-teal-900">{price(p)}</p><p className="mt-2 text-sm">{areaLabel(p.area_m2)} · {p.floor ?? '-'}층</p><p className="mt-3 border-t pt-3 text-xs text-slate-500">{names.get(p.assigned_staff_id)} · 확인 {dateLabel(p.last_confirmed_at)}</p></Link>)}{!properties.length && <p className="panel text-center text-slate-500">조건에 맞는 매물이 없습니다.</p>}</div>
    <nav aria-label="매물 페이지" className="mt-6 flex justify-center gap-3">{f.page>1 && <Link className="btn-secondary" href={link(f.page-1)}>이전</Link>}{f.page*20<(result.count ?? 0) && <Link className="btn-secondary" href={link(f.page+1)}>다음</Link>}</nav>
  </>;
}
