'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function DeleteProperty({ id, version }: { id: string; version: number }) {
  const router = useRouter(); const [pending,setPending] = useState(false); const [error,setError] = useState('');
  return <div><button className="btn-secondary text-red-700" disabled={pending} onClick={async () => {
    if (!window.confirm('매물을 삭제할까요? 목록에서 숨겨지고 첨부파일 접근이 차단됩니다. 기록은 보존됩니다.')) return;
    setPending(true); setError('');
    try { const r = await fetch(`/api/properties/${id}`, { method:'DELETE', headers:{'Content-Type':'application/json'},body:JSON.stringify({version}) }); if (!r.ok) throw new Error((await r.json()).error); router.push('/dashboard/properties'); router.refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : '삭제하지 못했습니다.'); setPending(false); }
  }}>{pending ? '삭제 중…' : '매물 삭제'}</button>{error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-700">{error}</p>}</div>;
}
