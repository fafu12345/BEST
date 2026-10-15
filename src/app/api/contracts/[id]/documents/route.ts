import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {contractContext,contractTarget} from '@/lib/contracts/server';
const maxSize=10*1024*1024;
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
 const c=await contractContext(r);if(c.error)return c.error;const {id}=await params;const target=await contractTarget(c,id,true);if(target.error)return target.error;
 const size=Number(r.headers.get('content-length'));if(!Number.isFinite(size)||size<=0||size>maxSize+65536)return Response.json({error:'파일은 최대 10MB입니다.'},{status:413});
 const f=await r.formData().catch(()=>null);const file=f?.get('file');const kind=z.enum(['contract','identification','receipt','other']).safeParse(f?.get('document_type'));const previous=z.guid().nullable().safeParse(f?.get('previous_document_id')||null);
 if(!(file instanceof File)||!file.size||file.size>maxSize||!kind.success||!previous.success)return Response.json({error:'파일·서류 종류·정정 대상을 확인하세요.'},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());const head=new TextDecoder('ascii');let mime:string|null=null;
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))mime='image/png';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';else if(head.decode(bytes.slice(0,4))==='RIFF'&&head.decode(bytes.slice(8,12))==='WEBP')mime='image/webp';else if(head.decode(bytes.slice(0,5))==='%PDF-')mime='application/pdf';
 if(!mime||mime!==file.type)return Response.json({error:'PDF·JPEG·PNG·WebP만 지원하며 파일 내용과 형식이 일치해야 합니다.'},{status:400});
 if(previous.data){const p=await c.db.from('contract_documents').select('id').eq('id',previous.data).eq('contract_id',id).maybeSingle();if(p.error||!p.data)return Response.json({error:'정정할 원본을 확인하세요.'},{status:400});}
 const extension={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];const path=`${c.staff.office_id}/${id}/${randomUUID()}.${extension}`;const hash=createHash('sha256').update(bytes).digest('hex');
 const uploaded=await c.db.storage.from('contract-documents').upload(path,bytes,{contentType:mime,upsert:false});if(uploaded.error)return Response.json({error:'계약 서류 업로드 실패. 담당자 권한을 확인하세요.'},{status:409});
 const saved=await c.db.from('contract_documents').insert({office_id:c.staff.office_id,contract_id:id,storage_path:path,document_type:kind.data,uploaded_by:c.staff.id,original_name:file.name.slice(0,255)||'contract-document',mime_type:mime,byte_size:file.size,sha256:hash,previous_document_id:previous.data}).select('id').single();
 if(saved.error){const cleanup=await c.db.storage.from('contract-documents').remove([path]);if(cleanup.error)console.error('Unregistered contract document requires cleanup:',path);return Response.json({error:'서류 정보 저장 실패. 담당자 변경 여부를 확인하세요.'},{status:409});}return Response.json(saved.data,{status:201});
}
