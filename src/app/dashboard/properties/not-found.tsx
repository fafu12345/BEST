import Link from 'next/link';
export default function NotFound() { return <section className="panel"><h1 className="section-title">매물을 찾을 수 없습니다.</h1><p className="mb-4 text-slate-600">삭제되었거나 접근할 수 없는 매물입니다.</p><Link className="btn-secondary" href="/dashboard/properties">목록으로</Link></section>; }
