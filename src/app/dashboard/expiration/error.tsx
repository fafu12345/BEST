'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel"><h1 className="section-title">만기 정보를 불러오지 못했습니다.</h1><p className="mb-4 text-sm">DB 연결과 최신 만기관리 업데이트 적용 여부를 확인하세요.</p><button className="btn-primary" onClick={reset}>다시 시도</button></section>;}
