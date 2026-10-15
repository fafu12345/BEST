import { CustomerList } from '@/components/customers/customer-list';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const raw=await searchParams;const values=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));return <CustomerList values={values} schedule/>;}
