import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), email: z.email().max(254), password: z.string().min(12).max(72), displayName: z.string().trim().min(1).max(80) }).strict();
export async function POST(request: Request) {
 if (!sameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
 const parsed = input.safeParse(await request.json().catch(() => null));
 if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
 const { token, email, password, displayName } = parsed.data;
 const db = supabaseAdmin();
 const hash = createHash('sha256').update(token).digest('hex');
 const { data: invitation } = await db.from('staff_invitations').select('id').eq('token_hash', hash).eq('email', email.toLowerCase()).not('approved_at', 'is', null).is('accepted_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
 if (!invitation) return Response.json({ error: '유효한 승인 초대가 필요합니다.' }, { status: 403 });
 // No external email is sent. Only accounts created by this request are cleaned up on failure.
 const { data, error } = await db.auth.admin.createUser({ email: email.toLowerCase(), password, email_confirm: true });
 if (error || !data.user) return Response.json({ error: '계정을 생성할 수 없습니다.' }, { status: 409 });
 const result = await db.rpc('accept_staff_invitation', { p_token_hash: hash, p_user_id: data.user.id, p_display_name: displayName });
 if (result.error) {
   const cleanup = await db.auth.admin.deleteUser(data.user.id);
   if (cleanup.error) console.error('Enrollment cleanup requires administrator review', data.user.id);
   return Response.json({ error: '가입 승인에 실패했습니다.' }, { status: 409 });
 }
 return Response.json({ success: true }, { status: 201 });
}
