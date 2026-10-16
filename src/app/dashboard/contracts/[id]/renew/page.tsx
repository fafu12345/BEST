import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {expirationContext,workflowTarget} from '@/lib/expiration/server';
import {koreaToday} from '@/lib/expiration/shared';
import {ContractForm} from '@/components/contracts/contract-form';
import {closingExclusive,type Contract,type Party} from '@/lib/contracts/shared';
import type {Property} from '@/lib/properties/shared';
export default async function Page({params}:{params:Promise<{id:string}>}){const c=await expirationContext();if(c.error)redirect('/login');const {id}=await params;const t=await workflowTarget(c,id,true);if(t.error){if(t.error.status===404)notFound();return <p className="panel">{(await t.error.json()).error}</p>;}
 const [p,parties,staff,renewed]=await Promise.all([c.db.from('properties').select('*').eq('id',t.contract.property_id).single(),c.db.from('contract_parties').select('*').eq('contract_id',id),c.db.from('staff').select('id,display_name,role,active'),c.db.from('contract_renewals').select('renewed_contract_id').eq('source_contract_id',id).maybeSingle()]);if(p.error||parties.error||staff.error||renewed.error)throw new Error('갱신 입력 조회 실패');if(renewed.data)return <section className="panel"><h1 className="section-title">이미 갱신된 계약입니다.</h1><Link className="btn-primary" href={'/dashboard/expiration/'+renewed.data.renewed_contract_id}>갱신 계약 보기</Link></section>;
 if(!t.contract.lease_end_date||!['signed','active','completed','terminated'].includes(t.contract.status)||p.data.deleted_at)return <section className="panel"><h1 className="section-title">원계약의 기간·상태와 매물 상태를 먼저 확인하세요.</h1><Link className="btn-secondary" href={'/dashboard/contracts/'+id+'/edit'}>원계약 확인</Link></section>;
 const initial={...t.contract,contract_number:'',status:'signed',contract_date:koreaToday(),signed_at:koreaToday(),occupancy_start_date:null,closing_date:closingExclusive(t.contract.lease_end_date),lease_start_date:closingExclusive(t.contract.lease_end_date),lease_end_date:null,previous_contract_id:id,brokerage_fee_krw:0,notes:'',overlap_override_reason:''} as Contract;
 return <div className="mx-auto max-w-4xl"><h1 className="mb-7 text-3xl font-bold">갱신·재계약 생성</h1><ContractForm property={p.data as Property} initial={initial} initialParties={parties.data as Party[]} staff={c.staff} colleagues={staff.data} previousContracts={[t.contract]} renewalSource={{id,version:t.contract.version}}/></div>;
}
