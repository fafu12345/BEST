import {saveContract,contractContext} from '@/lib/contracts/server';
import {listContracts} from '@/lib/contracts/list';
export async function POST(r:Request){return saveContract(r,null);}
export async function GET(r:Request){const c=await contractContext();if(c.error)return c.error;return Response.json(await listContracts(c.db,Object.fromEntries(new URL(r.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}});}
