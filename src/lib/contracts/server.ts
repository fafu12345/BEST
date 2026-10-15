import 'server-only';
import {propertyContext,validId} from '@/lib/properties/server';
import {canEdit} from '@/lib/properties/shared';
import {saveInput} from './shared';
export {propertyContext as contractContext};
export async function contractTarget(c:Awaited<ReturnType<typeof propertyContext>>,id:string,edit=false){if(c.error)return {error:c.error};if(!validId(id))return {error:Response.json({error:'계약을 찾을 수 없습니다.'},{status:404})};const r=await c.db.from('contracts').select('*').eq('id',id).is('deleted_at',null).maybeSingle();if(r.error)return {error:Response.json({error:'계약 조회 실패'},{status:500})};if(!r.data)return {error:Response.json({error:'계약을 찾을 수 없습니다.'},{status:404})};if(edit&&!canEdit(c.staff,r.data))return {error:Response.json({error:'계약 담당자 또는 대표·관리자만 변경할 수 있습니다.'},{status:403})};return {contract:r.data};}
export async function saveContract(request:Request,id:string|null){
 const c=await propertyContext(request);if(c.error)return c.error;
 if(id){const target=await contractTarget(c,id,true);if(target.error)return target.error;}
 const parsed=saveInput.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:parsed.error.issues[0]?.message},{status:400});
 const v=parsed.data;if((id&&!v.version)||(!id&&v.version!==null))return Response.json({error:'계약 버전을 확인하세요.'},{status:400});
 const result=await c.db.rpc('save_contract',{p_id:id,p_version:v.version,p_data:v.contract,p_parties:v.parties,p_property_status:v.property_status,p_property_version:v.property_version});
 if(result.error){const msg=result.error.message;return Response.json({error:msg.includes('OVERLAP')?'같은 매물에 기간이 겹치는 계약이 있습니다. 예외 사유를 5자 이상 입력하세요.':result.error.code==='40001'?'다른 사용자가 변경했거나 매물 수정 권한이 없습니다. 새로고침하세요.':'계약 저장 실패: 당사자·담당자·기간·사무소 연결을 확인하세요.'},{status:result.error.code==='40001'?409:result.error.code==='42501'?403:400});}
 const r=await c.db.from('contracts').select('id,version').eq('id',result.data).single();if(r.error)return Response.json({error:'저장 결과 확인 실패'},{status:500});return Response.json(r.data,{status:id?200:201});
}
