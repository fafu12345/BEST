import {contractPropertyLabel} from '@/lib/contracts/display';
import Link from 'next/link';
import {supabaseServer} from '@/lib/supabase/server';
import {contractTypes,contractStatuses} from '@/lib/contracts/shared';
import {moneyLabel} from '@/lib/properties/shared';
export async function ContractLinks({propertyId,customerId}:{propertyId?:string;customerId?:string}){
 const db=await supabaseServer();let query=db.from('contract_directory').select('properties,id,contract_number,contract_type,status,contract_date,signed_at,sale_price_krw,deposit_krw,rent_krw,amount').is('deleted_at',null).order('created_at',{ascending:false}).limit(20);
 if(propertyId)query=query.eq('property_id',propertyId);
 if(customerId)query=query.contains('customer_ids',[customerId]);
 const r=await query;if(r.error){
  // Keep the existing property/customer usable when the contracts query fails.
  // Log only the database code, never customer data or query contents.
  console.error('[ContractLinks] contract_directory query failed', {code:r.error.code});
  const schemaError=['42P01','42703','PGRST204','PGRST205'].includes(r.error.code);
  return <section className="panel"><h2 className="text-lg font-bold">과거·현재 계약</h2><p role="alert" className="mt-3 text-sm text-red-700">관련 계약을 조회하지 못했습니다. 고객·매물 정보는 계속 확인할 수 있습니다.</p><p className="hint mt-2">{schemaError?'계약 DB 업데이트 또는 스키마 캐시를 확인해야 합니다.':'DB 연결과 계약 조회 권한을 확인해야 합니다.'} 오류 코드: {r.error.code||'UNKNOWN'}</p></section>;
 }return <section className="panel"><div className="mb-5 flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">과거·현재 계약</h2><Link className="text-sm text-teal-800 underline" href={'/dashboard/contracts?'+new URLSearchParams(propertyId?{property:propertyId}:{customer:customerId!})}>전체 계약 조회</Link></div><ul className="space-y-3">{r.data.map(c=><li key={c.id} className="rounded-xl border p-4"><Link className="font-semibold text-teal-800 underline" href={'/dashboard/contracts/'+c.id}>{contractPropertyLabel(c.properties)}</Link><p className="mt-2 text-sm">{c.contract_type?contractTypes[c.contract_type as keyof typeof contractTypes]:'기존 계약 · 유형 확인 필요'} · {contractStatuses[c.status as keyof typeof contractStatuses]} · {c.contract_date??c.signed_at??'계약일 미입력'}</p><p className="mt-1 text-sm text-slate-600">{c.contract_type==='sale'?`매매 ${moneyLabel(c.sale_price_krw??c.amount)}`:c.contract_type?`보증금 ${moneyLabel(c.deposit_krw??c.amount)} · 월세 ${moneyLabel(c.rent_krw??0)}`:`기존 금액 ${moneyLabel(c.amount)}`}</p></li>)}</ul>{!r.data.length&&<p className="text-sm text-slate-500">연결된 계약이 없습니다.</p>}<p className="hint mt-4">최근 20건을 표시합니다. 계약 종료 후에도 이력이 유지됩니다.</p></section>;
}
