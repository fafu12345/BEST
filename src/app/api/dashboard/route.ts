import {propertyContext} from '@/lib/properties/server';
import {loadDashboard} from '@/lib/dashboard/server';
export async function GET(request:Request){const c=await propertyContext();if(c.error)return c.error;const data=await loadDashboard(c.db,c.staff,Object.fromEntries(new URL(request.url).searchParams));return Response.json(data,{status:data.filterError?400:200,headers:{'Cache-Control':'private, no-store'}});}
