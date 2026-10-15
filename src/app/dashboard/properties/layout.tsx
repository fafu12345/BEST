import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { OfficeHeader } from '@/components/office-header';
export default async function PropertyLayout({ children }: { children: React.ReactNode }) {
 const staff=await currentStaff();if(!staff)redirect('/login?error=membership');
 return <div className="min-h-screen bg-slate-50"><OfficeHeader name={staff.display_name}/><main className="mx-auto max-w-7xl px-4 py-7 md:px-8 md:py-10">{children}</main></div>;
}
