import {saveContract,contractContext,contractTarget} from '@/lib/contracts/server';
type Context={params:Promise<{id:string}>};
export async function PATCH(r:Request,{params}:Context){return saveContract(r,(await params).id);}
export async function GET(_r:Request,{params}:Context){const c=await contractContext();if(c.error)return c.error;const target=await contractTarget(c,(await params).id);if(target.error)return target.error;const parties=await c.db.from('contract_parties').select('*').eq('contract_id',target.contract.id);if(parties.error)return Response.json({error:'당사자 조회 실패'},{status:500});return Response.json({contract:target.contract,parties:parties.data},{headers:{'Cache-Control':'private, no-store'}});}
