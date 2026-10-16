import {redirect} from 'next/navigation';
import {currentStaff} from '@/lib/auth';
import {supabaseServer} from '@/lib/supabase/server';
import {OfficeHeader} from '@/components/office-header';
import {StaffNames} from '@/components/staff-names';
export default async function Page(){const staff=await currentStaff();if(!staff)redirect('/login');const db=await supabaseServer();const r=await db.from('staff').select('id,display_name,role,active,updated_at').order('created_at');if(r.error)throw new Error('직원 목록 조회 실패');return <div className="min-h-screen bg-slate-50"><OfficeHeader name={staff.display_name}/><main className="mx-auto max-w-5xl space-y-6 px-4 py-8"><h1 className="text-3xl font-bold">직원관리</h1><p className="text-sm text-slate-600">대표·관리자가 같은 사무소 직원의 표시 이름을 변경합니다. 담당 자료는 그대로 연결됩니다.</p><StaffNames people={r.data??[]} editable={['owner','manager'].includes(staff.role)}/></main></div>;}
