import { notFound,redirect } from 'next/navigation';
import { currentStaff } from '@/lib/auth';
import { customerContext,customerTarget } from '@/lib/customers/server';
import { CustomerForm } from '@/components/customers/customer-form';
import { canEdit } from '@/lib/properties/shared';
import type {Customer} from '@/lib/customers/shared';
export default async function Page({params}:{params:Promise<{id:string}>}){const staff=await currentStaff();if(!staff)redirect('/login');const c=await customerContext();if(c.error)redirect('/login');const target=await customerTarget(c,(await params).id);if(target.error) {if(target.error.status!==404)throw new Error('고객 조회 실패');notFound();}if(!canEdit(staff,target.customer))return <section className="panel"><h1 className="section-title">수정 권한이 없습니다.</h1><p>담당 직원 또는 대표·관리자에게 요청하세요.</p></section>;const colleagues=await c.db.from('staff').select('id,display_name,role,active').order('display_name');if(colleagues.error)throw new Error('직원 조회 실패');return <div className="mx-auto max-w-3xl"><h1 className="mb-7 text-3xl font-bold">고객 수정</h1><CustomerForm initial={target.customer as Customer} staff={staff} colleagues={colleagues.data}/></div>;}
