import {z} from 'zod';
export const noticeKinds={expiration:'만기 사전 확인',closing:'잔금 예정',customer_contact:'고객 재연락',relocation_contact:'이전 고객 후속 상담',property_recheck:'매물·재임대 확인',renewal_pending:'갱신 미처리'} as const;
export type Notice={notice_key:string;kind:keyof typeof noticeKinds;title:string;due_date:string;href:string;assigned_staff_id:string;state:'unread'|'read'|'dismissed'};
export type NoticeResult={total:number;unread:number;items:Notice[];today:string};
export type Statistics={from:string;to:string;total:number;monthly:{month:string;count:number}[];types:{type:string|null;count:number}[];property_types:{type:string;count:number}[];staff:{id:string;display_name:string;total:number;ongoing:number}[];renewals:number;completed:number;terminated:number;relocation_conversions:number;tasks:{total:number;completed:number};brokerage:{unconfirmed:number;agreed:number;received:number;refunded:number;outstanding:number;overpaid:number}};
export const receiptInput=z.object({notice_key:z.string().min(1).max(200),state:z.enum(['read','dismissed','unread'])}).strict();
export const paymentInput=z.object({version:z.number().int().positive(),direction:z.enum(['receipt','refund']),amount_krw:z.number().int().positive().max(9e15),paid_on:z.iso.date(),note:z.string().trim().max(2000),idempotency_key:z.guid()}).strict();
export const relocationLinkInput=z.object({version:z.number().int().positive(),new_contract_id:z.guid(),new_contract_version:z.number().int().positive(),end_source:z.boolean(),source_version:z.number().int().positive().nullable()}).strict().refine(v=>!v.end_source||v.source_version!==null,{message:'기존 계약 버전이 필요합니다.'});
// Provider boundary for a future opt-in SMS/Kakao adapter. No external transport is configured.
export type NoticeChannel='in_app'|'sms'|'kakao';
export const enabledNoticeChannels:readonly NoticeChannel[]=['in_app'];

export const reviewItems={applicable_law:'실제 사용 형태와 적용 법률 검토',notice_evidence:'개별 통지 시기·내용·도달 증빙 확인',renewal_history:'이전 갱신 이력과 당사자 의사 확인',occupancy_settlement:'실제 퇴거·보증금 정산과 계약 종료 구분',special_terms:'계약 특약·개별 예외 상황 검토'} as const;
export const reviewChecksInput=z.object({version:z.number().int().positive(),checks:z.object({applicable_law:z.boolean(),notice_evidence:z.boolean(),renewal_history:z.boolean(),occupancy_settlement:z.boolean(),special_terms:z.boolean()}).strict(),note:z.string().trim().max(2000)}).strict();
