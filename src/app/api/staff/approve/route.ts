import { z } from 'zod';
import { currentStaff, sameOrigin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
export async function POST(request: Request) {
 if (!sameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
 const staff = await currentStaff();
 if (!staff || !['owner','manager'].includes(staff.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
 const parsed = z.object({ invitationId: z.uuid() }).strict().safeParse(await request.json().catch(() => null));
 if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
 const { data, error } = await supabaseAdmin().from('staff_invitations').update({ approved_by: staff.id, approved_at: new Date().toISOString() }).eq('office_id', staff.office_id).eq('id', parsed.data.invitationId).is('accepted_at', null).gt('expires_at', new Date().toISOString()).select('id').single();
 if (error || !data) return Response.json({ error: '승인 가능한 초대가 없습니다.' }, { status: 404 });
 return Response.json({ id: data.id });
}
