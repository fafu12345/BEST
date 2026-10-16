import {propertyContext} from '@/lib/properties/server';
import {notifications} from '@/lib/operations/server';
import {receiptInput} from '@/lib/operations/shared';
export async function GET(r:Request){const c=await propertyContext();if(c.error)return c.error;const v=await notifications(c.db,c.staff,Object.fromEntries(new URL(r.url).searchParams));return Response.json(v,{status:v.error?400:200,headers:{'Cache-Control':'private, no-store'}});}
export async function PATCH(r:Request){const c=await propertyContext(r);if(c.error)return c.error;const p=receiptInput.safeParse(await r.json().catch(()=>null));if(!p.success)return Response.json({error:'알림과 처리 상태를 확인하세요.'},{status:400});const v=p.data;
 const visible=await c.db.from('notification_directory').select('notice_key').eq('notice_key',v.notice_key).maybeSingle();if(visible.error)return Response.json({error:'알림 DB 업데이트를 확인하세요.'},{status:500});if(!visible.data)return Response.json({error:'이미 처리되었거나 조회할 수 없는 알림입니다.'},{status:404});
 const query=c.db.from('notification_receipts');const saved=v.state==='unread'?await query.delete().eq('office_id',c.staff.office_id).eq('staff_id',c.staff.id).eq('notice_key',v.notice_key):await query.upsert({office_id:c.staff.office_id,staff_id:c.staff.id,notice_key:v.notice_key,state:v.state},{onConflict:'office_id,staff_id,notice_key'});
 if(saved.error)return Response.json({error:'알림 상태를 저장하지 못했습니다.'},{status:400});return Response.json({ok:true});}
