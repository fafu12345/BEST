import Link from 'next/link';
import {supabaseServer} from '@/lib/supabase/server';
import {contractTypes,contractStatuses} from '@/lib/contracts/shared';
import {moneyLabel} from '@/lib/properties/shared';
export async function ContractLinks({propertyId,customerId}:{propertyId?:string;customerId?:string}){
 const db=await supabaseServer();let query=db.from('contract_directory').select('id,contract_number,contract_type,status,contract_date,signed_at,sale_price_krw,deposit_krw,rent_krw,amount').is('deleted_at',null).order('created_at',{ascending:false}).limit(20);
 if(propertyId)query=query.eq('property_id',propertyId);
 if(customerId)query=query.contains('customer_ids',[customerId]);
 const r=await query;if(r.error)throw new Error('관련 계약 조회 실패');return <section className="panel"><div className="mb-5 flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">과거·현재 계약</h2><Link className="text-sm text-teal-800 underline" href={'/dashboard/contracts?'+new URLSearchParams(propertyId?{property:propertyId}:{customer:customerId!})}>전체 계약 조회</Link></div><ul className="space-y-3">{r.data.map(c=><li key={c.id} className="rounded-xl border p-4"><Link className="font-semibold text-teal-800 underline" href={'/dashboard/contracts/'+c.id}>{c.contract_number}</Link><p className="mt-2 text-sm">{c.contract_type?contractTypes[c.contract_type as keyof typeof contractTypes]:'기존 계약 · 유형 확인 필요'} · {contractStatuses[c.status as keyof typeof contractStatuses]} · {c.contract_date??c.signed_at??'계약일 미입력'}</p><p className="mt-1 text-sm text-slate-600">{c.contract_type==='sale'?`매매 ${moneyLabel(c.sale_price_krw??c.amount)}`:c.contract_type?`보증금 ${moneyLabel(c.deposit_krw??c.amount)} · 월세 ${moneyLabel(c.rent_krw??0)}`:`기존 금액 ${moneyLabel(c.amount)}`}</p></li>)}</ul>{!r.data.length&&<p className="text-sm text-slate-500">연결된 계약이 없습니다.</p>}<p className="hint mt-4">최근 20건을 표시합니다. 계약 종료 후에도 이력이 유지됩니다.</p></section>;
}
