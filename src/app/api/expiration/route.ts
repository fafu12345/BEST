import {expirationContext} from '@/lib/expiration/server';
import {expirationList} from '@/lib/expiration/list';
export async function GET(request:Request){const c=await expirationContext();if(c.error)return c.error;try{return Response.json(await expirationList(c.db,Object.fromEntries(new URL(request.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'만기 정보를 조회하지 못했습니다. DB 연결과 최신 업데이트를 확인하세요.'},{status:503});}}
