'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="panel"><h1 className="section-title">매물 정보를 불러오지 못했습니다.</h1><p className="mb-4 text-slate-600">연결 상태를 확인하고 다시 시도해 주세요.</p><button className="btn-primary" onClick={reset}>다시 시도</button></section>; }
