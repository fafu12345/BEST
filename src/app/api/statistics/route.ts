import {propertyContext} from '@/lib/properties/server';
import {statistics} from '@/lib/operations/server';
export async function GET(r:Request){const c=await propertyContext();if(c.error)return c.error;const v=await statistics(c.db,c.staff,Object.fromEntries(new URL(r.url).searchParams));return Response.json(v,{status:v.error?400:200,headers:{'Cache-Control':'private, no-store'}});}
