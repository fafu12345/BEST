import {redirect} from 'next/navigation';
import {currentStaff} from '@/lib/auth';
import {supabaseServer} from '@/lib/supabase/server';
import {OfficeHeader} from '@/components/office-header';
import {StaffNames} from '@/components/staff-names';
export default async function Page(){const staff=await currentStaff();if(!staff)redirect('/login');const db=await supabaseServer();const r=await db.from('staff').select('id,display_name,role,active,updated_at').is('deleted_at',null).order('created_at');if(r.error)throw new Error('직원 목록 조회 실패');return <div className="min-h-screen bg-slate-50"><OfficeHeader name={staff.display_name}/><main className="mx-auto max-w-5xl space-y-6 px-4 py-8"><h1 className="text-3xl font-bold">직원관리</h1><p className="text-sm text-slate-600">대표·관리자가 같은 사무소 직원의 표시 이름을 변경합니다. 직원 삭제 시 업무 접근을 차단하고 담당 자료는 보존합니다. 삭제된 직원의 자료는 대표·관리자가 담당자를 변경해 관리할 수 있습니다.</p><StaffNames selfId={staff.id} viewerRole={staff.role} people={r.data??[]} editable={['owner','manager'].includes(staff.role)}/></main></div>;}
