import {z} from 'zod';
import {saveContract,contractContext,contractTarget} from '@/lib/contracts/server';
type Context={params:Promise<{id:string}>};
export async function PATCH(r:Request,{params}:Context){return saveContract(r,(await params).id);}
export async function GET(_r:Request,{params}:Context){const c=await contractContext();if(c.error)return c.error;const target=await contractTarget(c,(await params).id);if(target.error)return target.error;const parties=await c.db.from('contract_parties').select('*').eq('contract_id',target.contract.id);if(parties.error)return Response.json({error:'당사자 조회 실패'},{status:500});return Response.json({contract:target.contract,parties:parties.data},{headers:{'Cache-Control':'private, no-store'}});}
export async function DELETE(request:Request,{params}:Context){
 const c=await contractContext(request);if(c.error)return c.error;const {id}=await params;const target=await contractTarget(c,id,true);if(target.error)return target.error;
 const p=z.object({version:z.number().int().positive()}).strict().safeParse(await request.json().catch(()=>null));if(!p.success)return Response.json({error:'계약 버전을 확인하세요.'},{status:400});
 const r=await c.db.from('contracts').update({deleted_at:new Date().toISOString()}).eq('id',id).eq('version',p.data.version).is('deleted_at',null).select('id').maybeSingle();if(r.error||!r.data)return Response.json({error:'삭제 실패: 다른 사용자가 변경했거나 DB 016 업데이트가 필요합니다. 새로고침 후 확인하세요.'},{status:409});return new Response(null,{status:204});
}
