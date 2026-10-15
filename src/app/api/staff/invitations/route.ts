import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { currentStaff, sameOrigin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
const input = z.object({ email: z.email().max(254), role: z.enum(['manager','agent']) }).strict();
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const staff = await currentStaff();
  if (!staff || !['owner','manager'].includes(staff.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
  const token = randomBytes(32).toString('hex');
  const { data, error } = await supabaseAdmin().from('staff_invitations').insert({ office_id: staff.office_id, invited_by: staff.id, email: parsed.data.email.toLowerCase(), role: parsed.data.role, token_hash: createHash('sha256').update(token).digest('hex') }).select('id').single();
  if (error) return Response.json({ error: '초대를 생성할 수 없습니다.' }, { status: 409 });
  return Response.json({ id: data.id, token, message: '관리자 승인 후 사용 가능합니다. 토큰은 안전하게 전달하세요.' }, { headers: { 'Cache-Control': 'no-store' } });
}
