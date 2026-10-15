'use client';
import { useState } from 'react';
export default function Join() {
 const [message, setMessage] = useState('');
 const [pending, setPending] = useState(false);
 return <main className="mx-auto max-w-md p-8"><h1 className="text-2xl font-bold">초대받은 직원 가입</h1><p className="mt-3 text-slate-600">관리자가 승인한 초대 토큰을 입력하세요.</p><form className="mt-6 grid gap-4" onSubmit={async e => {
 e.preventDefault(); setPending(true); setMessage('');
 const form = new FormData(e.currentTarget);
 try {
 const res = await fetch('/api/staff/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) });
 const result = await res.json(); setMessage(res.ok ? '가입되었습니다. 로그인해 주세요.' : result.error);
 } catch { setMessage('연결을 확인해 주세요.'); } finally { setPending(false); }
 }}>
 {([['token','초대 토큰','text'],['email','이메일','email'],['displayName','직원 이름','text'],['password','비밀번호 (12자 이상)','password']] as const).map(([name,label,type]) => <label className="grid gap-1" key={name}>{label}<input className="rounded border p-3" name={name} type={type} required minLength={name==='password'?12:undefined} autoComplete={name==='password'?'new-password':undefined}/></label>)}
 <button className="rounded bg-teal-800 p-3 text-white disabled:opacity-50" disabled={pending}>가입 신청</button><p role="status">{message}</p><a href="/login" className="underline">로그인으로 이동</a>
 </form></main>;
}
