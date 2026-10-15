import { z } from 'zod';
import { customerContext } from '@/lib/customers/server';
export async function GET(request:Request){
 const c=await customerContext();if(c.error)return c.error;
 const parsed=z.object({name:z.string().trim().min(1).max(100),company_name:z.string().trim().max(200).default(''),phone:z.string().max(40).default(''),email:z.string().max(254).default(''),exclude:z.guid().optional()}).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!parsed.success)return Response.json({error:'중복 확인 입력을 확인하세요.'},{status:400});
 const p=parsed.data;const phone=p.phone.replace(/\D/g,'');const email=p.email.trim().toLowerCase();
 const fields:[string,string][]=[['normalized_name',p.name.toLowerCase().replace(/\s+/g,' ')]];if(p.company_name)fields.push(['normalized_company_name',p.company_name.toLowerCase().replace(/\s+/g,' ')]);if(phone.length>=7)fields.push(['normalized_phone',phone]);if(email)fields.push(['normalized_email',email]);
 const results=await Promise.all(fields.map(async([field,value])=>{let q=c.db.from('customers').select('id,name,company_name,customer_kind').eq(field,value).is('deleted_at',null).limit(10);if(p.exclude)q=q.neq('id',p.exclude);return q;}));
 if(results.some(x=>x.error))return Response.json({error:'중복 확인에 실패했습니다.'},{status:500});
 return Response.json({candidates:[...new Map(results.flatMap(x=>x.data??[]).map(x=>[x.id,x])).values()].slice(0,10)},{headers:{'Cache-Control':'private, no-store'}});
}
