'use client';
import { useState } from 'react';
export function InvitationForm() {
 const [invitation, setInvitation] = useState<{id:string;token:string}|null>(null);
 const [message,setMessage] = useState('');
 const [pending,setPending] = useState(false);
 async function approve() {
 if (!invitation) return;
 setPending(true);
 try { const r = await fetch('/api/staff/approve',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invitationId:invitation.id}) }); setMessage(r.ok?'승인했습니다. 직원에게 토큰과 /join 경로를 안전하게 전달하세요.':'승인에 실패했습니다.'); }
 catch { setMessage('연결에 실패했습니다.'); } finally { setPending(false); }
 }
 return <section className="mt-10 rounded border p-6"><h2 className="text-xl font-bold">직원 초대·승인</h2><form className="mt-4 flex flex-wrap gap-3" onSubmit={async e=>{
 e.preventDefault();setPending(true);setInvitation(null);
 const f=new FormData(e.currentTarget);
 try { const r=await fetch('/api/staff/invitations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(f))}); const result=await r.json(); if(r.ok){setInvitation(result);setMessage('초대를 생성했습니다. 아래에서 승인하세요.');}else setMessage(result.error); }
 catch {setMessage('연결에 실패했습니다.');} finally {setPending(false);}
 }}><label>직원 이메일<input className="ml-2 rounded border p-2" type="email" name="email" required/></label><label>역할<select className="ml-2 rounded border p-2" name="role"><option value="agent">직원</option><option value="manager">관리자</option></select></label><button disabled={pending} className="rounded bg-teal-800 px-4 py-2 text-white">초대 생성</button></form><p className="mt-3" role="status">{message}</p>{invitation&&<div className="mt-3"><p className="break-all text-sm">초대 토큰: {invitation.token}</p><button className="mt-3 rounded border p-2" disabled={pending} onClick={approve}>서버 승인</button></div>}</section>;
}
