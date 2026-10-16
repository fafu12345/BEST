'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
export function PriorityToggle({id,version,marked,editable}:{id:string;version:number;marked:boolean;editable:boolean}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [pending,startTransition]=useTransition();const [error,setError]=useState('');
 async function toggle(){if(busy||pending)return;setBusy(true);setError('');try{const r=await fetch(`/api/properties/${id}/priority`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_priority:!marked,version})});const d=await r.json();if(!r.ok)throw new Error(d.error);startTransition(()=>router.refresh());}catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{setBusy(false);}}
 return <div className="float-right ml-2 text-xs">{editable?<button type="button" aria-label="급한 매물" aria-pressed={marked} title={marked?'급한 매물 해제':'급한 매물로 지정'} disabled={busy||pending} onClick={()=>void toggle()} className={`min-h-8 min-w-8 rounded border px-2 disabled:opacity-50 ${marked?'border-amber-300 bg-amber-50 text-amber-800':'border-slate-200 text-slate-500'}`}>{marked?'★':'☆'}</button>:marked?<span className="text-amber-700" title="급한 매물">★ 급함</span>:null}{error&&<p role="alert" className="max-w-48 text-red-700">{error}</p>}</div>;
}
