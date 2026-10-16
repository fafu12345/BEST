import {z} from 'zod';
export const contractTypes={sale:'매매',jeonse:'전세',monthly_rent:'월세'} as const;
export const contractStatuses={draft:'작성 중',signed:'체결',active:'진행 중',completed:'정상 종료',terminated:'중도 종료',cancelled:'취소'} as const;
export const partyRoles={landlord:'임대인',tenant:'임차인',seller:'매도인',buyer:'매수인',other:'기타'} as const;
export const documentTypes={contract:'계약서',identification:'확인 서류',receipt:'영수증',other:'기타 서류'} as const;
const date=z.iso.date().nullable();const money=z.number().int().min(0).max(9_000_000_000_000_000);
export const partyInput=z.object({customer_id:z.guid(),role:z.enum(['landlord','tenant','seller','buyer','other']),customer_version:z.number().int().positive().optional()}).strict();
export const contractInput=z.object({property_id:z.guid(),assigned_staff_id:z.guid().optional(),contract_number:z.string().trim().max(100),contract_type:z.enum(['sale','jeonse','monthly_rent']),status:z.enum(['draft','signed','active','completed','terminated','cancelled']),contract_date:date,occupancy_start_date:date,lease_start_date:date,lease_end_date:date,closing_date:date,sale_price_krw:money,deposit_krw:money,rent_krw:money,maintenance_fee_krw:money,brokerage_fee_krw:money,notes:z.string().trim().max(10000),previous_contract_id:z.guid().nullable(),overlap_override_reason:z.string().trim().max(1000)}).strict().superRefine((c,ctx)=>{
 if(c.lease_start_date&&c.lease_end_date&&c.lease_start_date>=c.lease_end_date)ctx.addIssue({code:'custom',message:'임대차 종료일은 시작일 이후여야 합니다.'});
 if(c.contract_date&&c.closing_date&&c.contract_date>c.closing_date)ctx.addIssue({code:'custom',message:'잔금일은 계약일 이후여야 합니다.'});
 if(['signed','active','completed','terminated'].includes(c.status)&&(!c.contract_date||(c.contract_type!=='sale'&&(!c.lease_start_date||!c.lease_end_date))))ctx.addIssue({code:'custom',message:'계약일과 임대차 기간을 확인하세요.'});
 if(c.contract_type==='sale'&&(c.deposit_krw||c.rent_krw)||c.contract_type==='jeonse'&&(c.sale_price_krw||c.rent_krw)||c.contract_type==='monthly_rent'&&c.sale_price_krw)ctx.addIssue({code:'custom',message:'계약 유형별 금액을 확인하세요.'});
});
export const saveInput=z.object({contract:contractInput,parties:z.array(partyInput).min(1).max(30),version:z.number().int().positive().nullable(),property_status:z.enum(['available','reserved','closed','on_hold']).nullable(),property_version:z.number().int().positive().nullable()}).strict().superRefine((v,ctx)=>{
 const required=v.contract.contract_type==='sale'?['seller','buyer']:['landlord','tenant'];
 if(!['draft','cancelled'].includes(v.contract.status)&&required.some(role=>!v.parties.some(p=>p.role===role)))ctx.addIssue({code:'custom',message:'계약 유형에 맞는 양쪽 당사자를 선택하세요.'});
 if(v.parties.some((p,i)=>v.parties.some((q,j)=>j!==i&&p.customer_id===q.customer_id&&required.includes(p.role)&&required.includes(q.role)&&p.role!==q.role)))ctx.addIssue({code:'custom',message:'계약 양쪽 당사자는 서로 다른 고객이어야 합니다.'});
 if(new Set(v.parties.map(p=>p.customer_id+':'+p.role)).size!==v.parties.length)ctx.addIssue({code:'custom',message:'중복 당사자 역할을 정리하세요.'});
});
export type ContractInput=z.infer<typeof contractInput>;
export type Contract=Omit<ContractInput,'contract_type'|'assigned_staff_id'> & {id:string;office_id:string;assigned_staff_id:string;contract_type:keyof typeof contractTypes|null;version:number;property_review_required:boolean;created_at:string;updated_at:string;deleted_at:string|null;signed_at:string|null;amount:number};
export type Party=z.infer<typeof partyInput>&{id:string;name_snapshot:string;company_name_snapshot:string};
export type ContractDocument={id:string;document_type:keyof typeof documentTypes;original_name:string;mime_type:string;byte_size:number;sha256:string;created_at:string;previous_document_id:string|null};
export type ContractEvent={id:string;event_type:string;event_date:string;description:string;actor_id:string|null;old_values:Record<string,unknown>|null;new_values:Record<string,unknown>|null};

export function closingExclusive(date:string|null){if(!date)return null;const day=new Date(date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+1);return day.toISOString().slice(0,10);}
export function contractNeedsReview(c:{property_review_required:boolean;status:string;lease_end_date:string|null;contract_type?:string|null;contract_date?:string|null;closing_date?:string|null}){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return (c.property_review_required&&(!c.contract_type||!c.contract_date||!c.closing_date||['cancelled','terminated'].includes(c.status)))||(['signed','active'].includes(c.status)&&!!c.lease_end_date&&c.lease_end_date<=today);}

// Inclusive lease end: 2026-11-01 + 12 months -> 2027-10-31.
export function leaseEndForMonths(start:string,months:number){
 if(!z.iso.date().safeParse(start).success||!Number.isInteger(months)||months<1||months>120)return '';
 const [year,month,day]=start.split('-').map(Number);const first=new Date(Date.UTC(year,month-1+months,1));
 const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 if(day>lastDay)return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),lastDay)).toISOString().slice(0,10);
 return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),day-1)).toISOString().slice(0,10);
}
export function leasePeriodLabel(start:string,end:string){
 if(!z.iso.date().safeParse(start).success||!z.iso.date().safeParse(end).success||end<start)return '기간을 확인하세요';
 for(let months=1;months<=120;months++)if(leaseEndForMonths(start,months)===end)return months%12===0?`${months/12}년 (${months}개월)`:`${months}개월`;
 return `${Math.round((Date.parse(end)-Date.parse(start))/86400000)+1}일`;
}
