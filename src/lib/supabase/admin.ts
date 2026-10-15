import 'server-only';
import { createClient } from '@supabase/supabase-js';
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('서버 전용 Supabase 설정이 필요합니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
