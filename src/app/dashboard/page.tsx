import { InvitationForm } from './invitation-form';
import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logout } from '../login/actions';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const staff = await currentStaff();
  if (!staff) redirect('/login?error=membership');
  const db = await supabaseServer();
  const { data: properties, error } = await db.from('properties').select('id,title,status,price').order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error('매물을 불러올 수 없습니다.');
  if (!staff.active) redirect('/login');
  return <main className="mx-auto max-w-4xl p-8"><header className="flex justify-between"><div><p className="text-teal-700">EstateMatch</p><h1 className="text-2xl font-bold">{staff.display_name} · {staff.role}</h1></div><form action={logout}><button className="rounded border px-4 py-2">로그아웃</button></form></header><h2 className="mt-10 text-xl font-bold">사무소 매물</h2><ul className="mt-4 grid gap-3">{properties?.map(p => <li className="rounded border p-4" key={p.id}>{p.title} · {p.status} · {Number(p.price).toLocaleString('ko-KR')}원</li>)}</ul>{!properties?.length && <p className="mt-4">등록된 매물이 없습니다.</p>}{['owner','manager'].includes(staff.role) && <InvitationForm/>}</main>;
}
