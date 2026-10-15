import { z } from 'zod';
export const customerKinds={individual:'개인',company:'법인'} as const;
export const privacyBases={unrecorded:'미확인 · 기존 자료',consent:'정보주체 동의',contract:'계약 체결·이행',legal_obligation:'법령상 의무',legitimate_interest:'정당한 이익',other:'기타 근거'} as const;
export const contactMethods={phone:'전화',visit:'방문',email:'이메일',message:'메시지',other:'기타'} as const;
const text=(max:number)=>z.string().trim().max(max);
export const customerInput=z.object({
 address:text(500).optional(),customer_kind:z.enum(['individual','company']),name:text(100).min(1),company_name:text(200),
 phone:text(40).regex(/^[0-9+()\-\s]*$/,'전화번호 형식을 확인하세요.').nullable(),
 email:z.union([z.email().max(254),z.literal('')]).nullable(),notes:text(10000),
 status:z.enum(['active','inactive']), contact_consent:z.boolean().nullable().optional(),
 next_contact_at:z.iso.datetime({offset:true}).nullable(),
 privacy_basis:z.enum(['unrecorded','consent','contract','legal_obligation','legitimate_interest','other']).optional(),
 privacy_basis_note:text(1000).optional(),processing_purpose:text(500).optional(),retention_until:z.iso.date().nullable().optional(),
 assigned_staff_id:z.guid().optional(),
}).strict().refine(p=>p.customer_kind!=='company'||!!p.company_name,{message:'법인명을 입력하세요.',path:['company_name']});
export const updateCustomerInput=z.object({customer:customerInput,version:z.number().int().positive()}).strict();
export const consultationInput=z.object({summary:text(10000).min(1),consulted_at:z.iso.datetime({offset:true}),contact_method:z.enum(['phone','visit','email','message','other']),property_id:z.guid().nullable()}).strict();
export type Customer=Omit<z.infer<typeof customerInput>,'assigned_staff_id'> & {id:string;office_id:string;assigned_staff_id:string;version:number;created_at:string;updated_at:string;deleted_at:string|null;consent_recorded_at:string|null};
export type Consultation={id:string;summary:string;consulted_at:string;contact_method:keyof typeof contactMethods;property_id:string|null;assigned_staff_id:string};
export function consentLabel(v:boolean|null){return v===true?'동의':v===false?'거부':'미확인';}
// All office schedules use explicit Asia/Seoul input and display, independent of device timezone.
export function localDateTime(value:string|null|undefined){if(!value)return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const get=(type:string)=>parts.find(p=>p.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;}
export function retentionExpired(date:string|null){return !!date&&date<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
