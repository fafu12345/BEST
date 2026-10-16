import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { PropertyForm } from '@/components/properties/property-form';
export default async function NewProperty() {
  const staff = await currentStaff(); if (!staff) redirect('/login');
  const db=await supabaseServer();
  const {data:buildings,error}=await db.from('property_buildings').select('id,property_type,name,address,total_floors,updated_at').order('name');
  if(error) throw new Error('건물·단지 보기를 불러오지 못했습니다.');
  return <div className="mx-auto max-w-3xl"><p className="text-sm text-slate-500">매물관리 / 신규 등록</p><h1 className="mb-7 mt-2 text-3xl font-bold">매물 등록</h1><PropertyForm staff={staff} colleagues={[]} buildings={buildings??[]}/></div>;
}
