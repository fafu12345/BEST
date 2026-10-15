'use server';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
export async function login(form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) redirect('/login?error=config');
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=credentials');
  redirect('/dashboard');
}
export async function logout() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect('/login');
}
