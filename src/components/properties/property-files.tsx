'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { PropertyFile } from '@/lib/properties/shared';
export function PropertyFiles({ id, files, editable }: { id: string; files: PropertyFile[]; editable: boolean }) {
  const router = useRouter(); const [kind, setKind] = useState('photo'); const [pending,setPending] = useState(false); const [error,setError] = useState('');
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const payload = new FormData(form); const file = payload.get('file');
    if (!(file instanceof File) || !file.size || file.size > 10*1024*1024) { setError('10MB 이하 파일을 선택하세요.'); return; }
    setPending(true); setError('');
    try { const r = await fetch(`/api/properties/${id}/files`, { method: 'POST', body: payload }); if (!r.ok) throw new Error((await r.json()).error); form.reset(); router.refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : '파일을 올리지 못했습니다.'); } finally { setPending(false); }
  }
  async function remove(fileId: string) {
    if (!window.confirm('첨부파일을 삭제할까요? 이 파일 삭제는 되돌릴 수 없습니다.')) return;
    setPending(true); setError('');
    try { const r = await fetch(`/api/properties/${id}/files/${fileId}`, { method:'DELETE' }); if (!r.ok) throw new Error((await r.json()).error); router.refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : '삭제하지 못했습니다.'); } finally { setPending(false); }
  }
  return <section className="panel"><h2 className="section-title">사진 · 도면</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{files.map(file => <article className="overflow-hidden rounded-xl border border-slate-200" key={file.id}><a target="_blank" rel="noopener noreferrer" href={`/api/properties/${id}/files/${file.id}`} className="block bg-slate-100">{file.mime_type?.startsWith('image/') ? /* unoptimized keeps the request in the authenticated browser. */ <Image unoptimized width={600} height={400} alt={file.caption || file.original_name || '매물 사진'} src={`/api/properties/${id}/files/${file.id}`} className="h-44 w-full object-cover" loading="lazy"/> : <span className="flex h-44 items-center justify-center text-sm font-semibold text-slate-600">{file.mime_type === 'application/pdf' ? 'PDF 도면 열기 ↗' : '첨부파일 열기 ↗'}</span>}</a><div className="p-3"><p className="text-xs font-medium text-teal-700">{file.file_kind === 'photo' ? '사진' : '도면'}</p><p className="mt-1 truncate text-sm">{file.original_name || '가상 테스트 파일'}</p>{editable && <button className="mt-2 text-xs text-red-700 underline" disabled={pending} onClick={() => remove(file.id)}>파일 삭제</button>}</div></article>)}</div>{!files.length && <p className="text-sm text-slate-500">등록된 사진이나 도면이 없습니다.</p>}
    {editable && <form className="mt-6 grid items-end gap-3 border-t pt-5 sm:grid-cols-[130px_1fr_auto]" onSubmit={upload}><label className="field">종류<select name="file_kind" value={kind} onChange={e => setKind(e.target.value)}><option value="photo">사진</option><option value="floorplan">도면</option></select></label><label className="field">파일 (최대 10MB)<input name="file" type="file" accept={kind === 'photo' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} required/></label><button className="btn-primary" disabled={pending}>{pending ? '처리 중…' : '업로드'}</button></form>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<p className="hint mt-4">사무소 직원만 열람할 수 있습니다. 도면은 PDF도 지원합니다. 매물을 삭제하면 파일 접근도 차단됩니다.</p>
  </section>;
}
