import 'server-only';
import { supabaseServer } from './supabase/server';
export async function currentStaff() {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: staff } = await db.from('staff').select('id,office_id,role,display_name,active').eq('user_id', user.id).eq('active', true).single();
  return staff;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  return !!host && origin === `${new URL(request.url).protocol}//${host}`;
}
