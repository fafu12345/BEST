import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { logout } from '../../login/actions';
export default async function PropertyLayout({ children }: { children: React.ReactNode }) {
  const staff = await currentStaff(); if (!staff) redirect('/login?error=membership');
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8"><nav className="flex items-center gap-6"><Link href="/dashboard" className="text-xl font-bold tracking-tight text-teal-800">EstateMatch</Link><Link href="/dashboard/properties" className="text-sm font-semibold text-slate-700">매물관리</Link></nav><div className="flex items-center gap-3"><span className="text-sm text-slate-600">{staff.display_name}</span><form action={logout}><button className="text-sm text-slate-500 underline">로그아웃</button></form></div></div></header><main className="mx-auto max-w-7xl px-4 py-7 md:px-8 md:py-10">{children}</main></div>;
}
