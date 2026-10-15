'use client';
import {createContext,useContext,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
type Item={id:string;name:string;version:number};
type Selection={selected:Set<string>;pending:boolean;toggle:(id:string)=>void};
const Context=createContext<Selection|null>(null);
export function CustomerSelection({items,children}:{items:Item[];children:ReactNode}){
 const router=useRouter();const [selected,setSelected]=useState(new Set<string>());const [pending,setPending]=useState(false);const [message,setMessage]=useState('');
 const toggle=(id:string)=>setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});
 async function remove(){
  const targets=items.filter(x=>selected.has(x.id));if(!targets.length||!confirm(`선택한 고객 ${targets.length}명을 삭제할까요? 기존 상담·계약 이력은 보존됩니다.`))return;
  setPending(true);setMessage('');let succeeded=0;const failed:string[]=[];
  for(const item of targets){try{const r=await fetch('/api/customers/'+item.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:item.version})});if(r.ok){succeeded++;setSelected(old=>{const next=new Set(old);next.delete(item.id);return next;});}else failed.push(item.name);}catch{failed.push(item.name);}}
  setMessage(`${succeeded}명 삭제 완료.${failed.length?` ${failed.length}명 삭제 실패: ${failed.join(', ')}. 변경되었거나 권한이 없을 수 있습니다. 새로고침 후 확인하세요.`:''}`);setPending(false);router.refresh();
 }
 return <Context.Provider value={{selected,pending,toggle}}><div className="mb-4 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="현재 페이지 삭제 가능 고객 전체 선택" disabled={pending||!items.length} checked={items.length>0&&items.every(x=>selected.has(x.id))} onChange={e=>setSelected(e.target.checked?new Set(items.map(x=>x.id)):new Set())}/>현재 페이지 전체 선택</label><button className="btn-secondary" disabled={pending||!selected.size} onClick={remove}>{pending?'삭제 중…':`선택 삭제 (${selected.size}명)`}</button><span className="hint">담당 고객 또는 대표·관리자가 삭제할 수 있습니다.</span></div>{message&&<p role="status" className="mb-4 text-sm">{message}</p>}{children}</Context.Provider>;
}
export function CustomerCheckbox({id,name,editable}:{id:string;name:string;editable:boolean}){const c=useContext(Context);if(!c)return null;return <input type="checkbox" aria-label={`${name} 선택`} disabled={!editable||c.pending} checked={c.selected.has(id)} onChange={()=>c.toggle(id)}/>;}
