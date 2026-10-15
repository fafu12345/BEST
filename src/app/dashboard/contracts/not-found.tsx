import Link from 'next/link';
export default function Page(){return <section className="panel"><h1 className="section-title">계약을 찾을 수 없습니다.</h1><p className="mb-4 text-sm">보관되었거나 접근할 수 없는 계약입니다.</p><Link className="btn-secondary" href="/dashboard/contracts">계약 목록</Link></section>;}
