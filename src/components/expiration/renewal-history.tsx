import {contractTypes} from '@/lib/contracts/shared';
import Link from 'next/link';
import {supabaseServer} from '@/lib/supabase/server';
import {renewalTypes} from '@/lib/expiration/shared';
import {moneyLabel} from '@/lib/properties/shared';
export async function RenewalHistory({id}:{id:string}){
 const db=await supabaseServer();const r=await db.from('contract_renewals').select('*').or(`source_contract_id.eq.${id},renewed_contract_id.eq.${id}`).order('renewal_number');
 if(r.error)return <p className="panel text-sm text-red-700">갱신 이력 조회 실패 · DB 업데이트를 확인하세요.</p>;
 const labels:Record<string,string>={contract_type:'계약 유형',deposit_krw:'보증금',rent_krw:'월세',maintenance_fee_krw:'관리비',brokerage_fee_krw:'중개보수',lease_start_date:'시작일',lease_end_date:'종료일'};
 function show(key:string,value:unknown){return key==='contract_type'?contractTypes[value as keyof typeof contractTypes]??'미확인':key.endsWith('_krw')?value===null?'미확인':moneyLabel(Number(value)):String(value??'미입력');}
 return <section className="panel"><h2 className="section-title">갱신·재계약 이력 및 조건 비교</h2>{!r.data.length&&<p className="text-sm text-slate-500">기록된 갱신이 없습니다. 기존 연결은 계약의 갱신 원본에서 확인할 수 있습니다.</p>}<ul className="space-y-6">{r.data.map(x=><li key={x.id}><h3 className="font-bold">{x.renewal_number}차 · {renewalTypes[x.renewal_type as keyof typeof renewalTypes]}</h3><p className="my-3 text-sm">처리일 {x.processed_at} · <Link className="text-teal-800 underline" href={'/dashboard/expiration/'+x.source_contract_id}>원계약</Link> → <Link className="text-teal-800 underline" href={'/dashboard/expiration/'+x.renewed_contract_id}>갱신계약</Link></p><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(labels).map(([key,label])=><div className="break-words rounded-lg bg-slate-50 p-3 text-sm" key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1">{show(key,x.old_terms[key])} → {show(key,x.new_terms[key])}</dd></div>)}</dl></li>)}</ul></section>;
}
