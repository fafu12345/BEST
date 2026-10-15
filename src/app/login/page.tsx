import { login } from './actions';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
    <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
      <p className="font-semibold text-teal-700">EstateMatch</p>
      <h1 className="mt-3 text-2xl font-bold">사무소 업무 로그인</h1>
      <p className="mt-2 text-sm text-slate-600">관리자의 초대와 승인을 받은 직원만 이용할 수 있습니다.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error === 'membership' ? '관리자의 승인과 활성 직원 소속이 필요합니다.' : error === 'config' ? 'Supabase 연결 설정이 필요합니다. README를 확인해 주세요.' : '이메일과 비밀번호를 확인해 주세요.'}</p>}
      <form action={login} className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm font-medium">이메일<input className="rounded-lg border p-3" type="email" name="email" autoComplete="username" required /></label>
        <label className="grid gap-1 text-sm font-medium">비밀번호<input className="rounded-lg border p-3" type="password" name="password" autoComplete="current-password" required /></label>
        <button className="rounded-lg bg-teal-800 p-3 font-semibold text-white">로그인</button>
      </form>
    </section>
  </main>;
}
