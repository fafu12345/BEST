import { redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { PropertyForm } from '@/components/properties/property-form';
export default async function NewProperty() {
  const staff = await currentStaff(); if (!staff) redirect('/login');
  return <div className="mx-auto max-w-3xl"><p className="text-sm text-slate-500">매물관리 / 신규 등록</p><h1 className="mb-7 mt-2 text-3xl font-bold">매물 등록</h1><PropertyForm staff={staff} colleagues={[]}/></div>;
}
