import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { validId } from '@/lib/properties/server';
import { canEdit, type Property } from '@/lib/properties/shared';
import { PropertyForm } from '@/components/properties/property-form';
export default async function EditProperty({ params }: { params: Promise<{ id: string }> }) {
  const staff = await currentStaff(); if (!staff) redirect('/login');
  const { id } = await params; if (!validId(id)) notFound();
  const db = await supabaseServer();
  const { data, error } = await db.from('properties').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error('매물을 조회하지 못했습니다.'); if (!data) notFound();
  if (!canEdit(staff, data)) return <section className="panel"><h1 className="section-title">수정 권한이 없습니다.</h1><Link className="btn-secondary" href={`/dashboard/properties/${id}`}>상세로 돌아가기</Link></section>;
  const { data: colleagues, error: staffError } = await db.from('staff').select('id,display_name,role,active').or(`active.eq.true,id.eq.${data.assigned_staff_id}`).order('display_name');
  if (staffError) throw new Error('직원 목록을 조회하지 못했습니다.');
  const buildingsResult=await db.from('property_buildings').select('id,property_type,name,address,total_floors,updated_at').or(data.building_id?`deleted_at.is.null,id.eq.${data.building_id}`:'deleted_at.is.null').order('name');
  if(buildingsResult.error) throw new Error('건물·단지 보기를 불러오지 못했습니다.');
  return <div className="mx-auto max-w-3xl"><p className="text-sm text-slate-500">매물관리 / 상세 / 수정</p><h1 className="mb-7 mt-2 text-3xl font-bold">매물 수정</h1><PropertyForm initial={data as Property} staff={staff} colleagues={colleagues ?? []} buildings={buildingsResult.data??[]}/></div>;
}
