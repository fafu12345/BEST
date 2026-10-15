import Link from 'next/link';
import {ContractLinks} from '@/components/contracts/contract-links';
import { notFound, redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { validId } from '@/lib/properties/server';
import { propertyTypes, transactionTypes, statuses, moneyLabel, propertyPriceLabel, areaLabel, dateLabel, canEdit, type Property, type PropertyFile, type Change } from '@/lib/properties/shared';
import { PropertyFiles } from '@/components/properties/property-files';
import { DeleteHistory } from '@/components/properties/delete-history';
import { DeleteProperty } from '@/components/properties/delete-property';
export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await currentStaff(); if (!staff) redirect('/login'); const { id } = await params; if (!validId(id)) notFound();
  const db = await supabaseServer(); const result = await db.from('properties').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
  if (result.error) throw new Error('매물 조회에 실패했습니다.'); if (!result.data) notFound(); const p = result.data as Property;
  const [staffResult, fileResult, historyResult] = await Promise.all([
    db.from('staff').select('id,display_name').order('display_name'),
    db.from('property_images').select('id,file_kind,original_name,mime_type,caption,storage_path').eq('property_id',id).order('sort_order').order('created_at'),
    db.from('property_change_history').select('*').eq('property_id',id).order('created_at',{ascending:false}).order('id').limit(100),
  ]);
  if (staffResult.error || fileResult.error || historyResult.error) throw new Error('관련 정보를 불러오지 못했습니다.');
  const names = new Map(staffResult.data?.map(s => [s.id,s.display_name])); const editable = canEdit(staff,p);
  const financial=propertyPriceLabel(p);
  const rows: [string, string][] = [['유형 / 거래',`${propertyTypes[p.property_type] ?? p.property_type} / ${transactionTypes[p.transaction_type]}`],['건물·단지명',p.building_name || '-'],['호실',p.unit_number || '-'],['주소',p.address || '-'],['전용면적',areaLabel(p.area_m2)],['해당 / 전체 층',`${p.floor ?? '-'} / ${p.total_floors ?? '-'}층`],['담당 직원',names.get(p.assigned_staff_id) ?? '-'],['최종 확인',dateLabel(p.last_confirmed_at)],['등록일',dateLabel(p.created_at)],['거래 희망일',p.desired_transaction_date || '미정'],['거래 일정 메모',p.desired_transaction_note || '-']];
  if (p.property_type === 'retail') rows.push(['상호',p.store_name || '-'],['권리금',moneyLabel(p.premium)],['업종',p.business_type || '-'],['시설',p.facilities || '-']);
  if (['apartment','officetel'].includes(p.property_type)) rows.push(['동',p.building_dong || '-']);
  if (['apartment','officetel'].includes(p.property_type)) rows.push(['방 수',p.room_count === null ? '-' : `${p.room_count}개`],['화장실 수',p.bathroom_count == null ? '-' : `${p.bathroom_count}개`]);
  function historyValue(key: string, value: string | number | null | undefined) {
    if (value === null || value === undefined) return '-';
    if (['price','deposit','premium','monthly_rent'].includes(key)) return moneyLabel(Number(value));
    if (key === 'transaction_type') return transactionTypes[value as keyof typeof transactionTypes] ?? String(value);
    if (key === 'status') return statuses[value as keyof typeof statuses] ?? String(value);
    if (key === 'assigned_staff_id') return names.get(String(value)) ?? '직원';
    return dateLabel(String(value));
  }
  const labels: Record<string,string> = {price:'매매가격',monthly_rent:'월세',transaction_type:'거래 방식',deposit:'보증금',premium:'권리금',status:'거래 상태',assigned_staff_id:'담당 직원',deleted_at:'삭제일'};
  return <><Link className="text-sm text-slate-500 hover:underline" href="/dashboard/properties">← 매물 목록</Link><div className="mb-7 mt-5 flex flex-wrap items-start justify-between gap-4"><div><span className="status-pill">{statuses[p.status]}</span><h1 className="mt-3 text-2xl font-bold md:text-3xl">{p.title}</h1><p className="mt-3 text-xl font-bold text-teal-900">{financial}</p></div>{editable && <div className="flex gap-2"><Link className="btn-primary" href={`/dashboard/properties/${id}/edit`}>수정</Link><DeleteProperty id={id} version={p.version}/></div>}</div>
    {!editable && <p className="mb-6 rounded-lg bg-slate-100 p-4 text-sm text-slate-600">사무소 매물은 열람할 수 있습니다. 수정은 담당 직원 또는 대표·관리자에게 요청하세요.</p>}
    <div className="space-y-6"><section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">매물별 계약관리</h2><Link className="btn-primary" href={'/dashboard/contracts/new?'+new URLSearchParams({property:id})}>계약 등록</Link></div></section><ContractLinks propertyId={id}/><section className="panel"><h2 className="section-title">매물 정보</h2><dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">{rows.map(([label,value]) => <div key={label} className="border-b border-slate-100 pb-4"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{value}</dd></div>)}</dl>{p.description && <div className="mt-6"><h3 className="mb-2 text-sm font-semibold">설명</h3><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{p.description}</p></div>}</section>
    <PropertyFiles id={id} files={(fileResult.data ?? []) as PropertyFile[]} editable={editable}/>
    <section className="panel"><h2 className="section-title">가격 · 상태 변경 이력</h2>{editable&&!!historyResult.data?.length&&<DeleteHistory propertyId={id}/>}<p className="hint mb-5">기능 적용 이후 변경한 매매가격·보증금·월세·권리금·상태·담당자 기록을 최신 100건까지 표시합니다.</p><ol className="space-y-5">{(historyResult.data as Change[]).map(h => <li key={h.id} className="border-l-2 border-teal-200 pl-4"><p className="text-sm font-semibold">{h.event === 'created' ? '매물 등록' : '매물 변경'} <span className="font-normal text-slate-500">· {names.get(h.actor_staff_id ?? '') ?? '시스템'} · {dateLabel(h.created_at)}</span></p><ul className="mt-2 space-y-1 text-sm text-slate-600">{Object.entries(h.new_values).filter(([key,value]) => h.old_values ? h.old_values[key] !== value : (h.new_values.monthly_rent === undefined ? ['price','status'] : h.new_values.transaction_type==='sale' ? ['price','deposit','monthly_rent','status'] : ['deposit','monthly_rent','status']).includes(key)).map(([key,value]) => <li key={key}>{key==='price' && h.new_values.monthly_rent===undefined ? '가격 (기존 기록)' : labels[key] ?? key}: {h.old_values ? `${historyValue(key,h.old_values[key])} → ` : ''}{historyValue(key,value)}</li>)}</ul>{editable&&<DeleteHistory propertyId={id} historyId={h.id}/>}</li>)}</ol>{!historyResult.data?.length && <p className="text-sm text-slate-500">기록된 변경 사항이 없습니다.</p>}</section></div>
  </>;
}
