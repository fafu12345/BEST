import Link from 'next/link';
export default function Page(){return <section className="panel"><h1 className="section-title">고객을 찾을 수 없습니다.</h1><p className="mb-4 text-sm text-slate-500">보관되었거나 접근할 수 없는 고객입니다.</p><Link className="btn-secondary" href="/dashboard/customers">고객 목록</Link></section>;}
