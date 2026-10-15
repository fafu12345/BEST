import {createHash} from 'node:crypto';
import {contractContext,contractTarget} from '@/lib/contracts/server';
import {validId} from '@/lib/properties/server';
export async function GET(_r:Request,{params}:{params:Promise<{id:string;documentId:string}>}){
 const c=await contractContext();if(c.error)return c.error;const {id,documentId}=await params;const target=await contractTarget(c,id);if(target.error)return target.error;if(!validId(documentId))return new Response(null,{status:404});
 const file=await c.db.from('contract_documents').select('*').eq('id',documentId).eq('contract_id',id).maybeSingle();if(file.error||!file.data)return new Response(null,{status:404});
 // The Storage SELECT policy logs each authenticated download, including direct Storage requests.
 const r=await c.db.storage.from('contract-documents').download(file.data.storage_path);if(r.error||!r.data)return Response.json({error:'서류 접근 또는 접근 기록 저장에 실패했습니다.'},{status:409});const bytes=new Uint8Array(await r.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==file.data.sha256)return Response.json({error:'서류 무결성 검사 실패. 관리자에게 확인하세요.'},{status:409});
 return new Response(bytes,{headers:{'Content-Type':file.data.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.data.original_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
