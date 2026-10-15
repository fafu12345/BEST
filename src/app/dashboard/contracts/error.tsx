'use client';
export default function Page({reset}:{reset:()=>void}){return <section className="panel"><h1 className="section-title">계약 정보를 불러오지 못했습니다.</h1><button className="btn-primary" onClick={reset}>다시 시도</button></section>;}
