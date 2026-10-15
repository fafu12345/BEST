import 'server-only';
import {propertyContext,validId} from '@/lib/properties/server';
import {canEdit} from '@/lib/properties/shared';
export {propertyContext as expirationContext};
export async function workflowTarget(c:Awaited<ReturnType<typeof propertyContext>>,contractId:string,edit=false){
 if(c.error)return {error:c.error};if(!validId(contractId))return {error:Response.json({error:'계약을 찾을 수 없습니다.'},{status:404})};
 const r=await c.db.from('contracts').select('*').eq('id',contractId).is('deleted_at',null).maybeSingle();
 if(r.error)return {error:Response.json({error:'계약 DB 조회에 실패했습니다. 최신 마이그레이션을 확인하세요.'},{status:500})};if(!r.data)return {error:Response.json({error:'계약을 찾을 수 없습니다.'},{status:404})};
 if(edit&&!canEdit(c.staff,r.data))return {error:Response.json({error:'계약 담당자 또는 대표·관리자만 변경할 수 있습니다.'},{status:403})};
 const f=await c.db.from('contract_followups').select('*').eq('contract_id',contractId).maybeSingle();if(f.error)return {error:Response.json({error:'만기 DB 업데이트를 확인하세요.'},{status:500})};if(!f.data)return {error:Response.json({error:'유형이 확인된 임대차 계약만 만기관리할 수 있습니다.'},{status:400})};return {contract:r.data,workflow:f.data};
}
export function dbFailure(error:{code?:string}|null,fallback='저장하지 못했습니다. 입력값과 권한을 확인하세요.'){
 return Response.json({error:error?.code==='40001'?'다른 사용자가 변경했습니다. 새로고침하세요.':error?.code==='23505'?'이미 처리되었거나 진행 중인 동일 건이 있습니다.':error?.code==='42501'?'담당 권한과 퇴거 확인 여부를 확인하세요.':fallback},{status:error?.code==='40001'?409:error?.code==='42501'?403:400});
}
