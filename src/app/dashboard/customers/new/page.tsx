import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { CustomerForm } from '@/components/customers/customer-form';
export default async function Page(){const staff=await currentStaff();if(!staff)redirect('/login');const db=await supabaseServer();const colleagues=await db.from('staff').select('id,display_name,role,active').eq('active',true).order('display_name');if(colleagues.error)throw new Error('직원 조회 실패');return <div className="mx-auto max-w-3xl"><h1 className="mb-7 text-3xl font-bold">고객 신규 등록</h1><CustomerForm staff={staff} colleagues={colleagues.data}/></div>;}
