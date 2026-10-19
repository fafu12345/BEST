'use client';
import Link from 'next/link';
import { referenceUnit, pyeongToM2, m2ToPyeong } from '@/lib/properties/unit-reference';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { directions, propertyInput, propertyTypes, transactionTypes, statuses, moneyLabel, wanToWon, wonToWan, areaLabel, dateLabel, propertyFinancials, type Property, type StaffOption, type BuildingOption } from '@/lib/properties/shared';

type Candidate = { id: string; title: string; floor: number | null; area_m2: number | null };
export function PropertyForm({ initial, staff, colleagues, buildings: initialBuildings }: { initial?: Property; staff: StaffOption; colleagues: StaffOption[]; buildings: BuildingOption[] }) {
  const router = useRouter();
  const [type,setType] = useState(initial?.property_type ?? '');
  const [buildings,setBuildings] = useState(initialBuildings);
  const [buildingId,setBuildingId] = useState(initial?.building_id ?? '');
  const [optionName,setOptionName] = useState(''); const [adding,setAdding] = useState(false);
  const [optionAddress,setOptionAddress]=useState('');const [optionFloors,setOptionFloors]=useState('');
  const [unit,setUnit]=useState(initial?.unit_number??'');const [dong,setDong]=useState(initial?.building_dong??'');const [floor,setFloor]=useState(String(initial?.floor??''));const [totalFloors,setTotalFloors]=useState(String(initial?.total_floors??''));const [lookupMessage,setLookupMessage]=useState('');const [looking,setLooking]=useState(false);
  const [optionError,setOptionError] = useState('');
  const [transaction,setTransaction] = useState(initial?.transaction_type ?? 'sale');
  const financial = initial ? propertyFinancials(initial) : {salePrice:0,deposit:0,monthlyRent:0};
  const [price,setPrice] = useState(wonToWan(financial.salePrice));
  const [deposit,setDeposit] = useState(wonToWan(financial.deposit));
  const [rent,setRent] = useState(wonToWan(financial.monthlyRent));
  const [area,setAreaM2] = useState(String(initial?.area_m2 ?? ''));
  const [areaPyeong,setAreaPyeong] = useState(initial?.area_m2==null?'':String(m2ToPyeong(initial.area_m2)));
  function setArea(value: string) {setAreaM2(value);setAreaPyeong(value===''?'':String(m2ToPyeong(Number(value))));}
  const [pending,setPending] = useState(false); const [error,setError] = useState('');
  const [candidates,setCandidates] = useState<Candidate[]>([]); const [allowDuplicate,setAllowDuplicate] = useState(false);
  const manager = ['owner','manager'].includes(staff.role);
  const selected = buildings.find(b=>b.id===buildingId && b.property_type===type);
  const options = buildings.filter(b=>b.property_type===type);
  const number = (form: FormData,name: string) => form.get(name)==='' || form.get(name)===null ? null : Number(form.get(name));
  const preview = (value: string) => { try { return moneyLabel(wanToWon(value)); } catch { return '금액을 확인하세요.'; } };
  async function addOption() {
    if (!type || !optionName.trim()) { setOptionError('매물 유형을 고르고 추가할 건물·단지명을 입력하세요.'); return; }
    setAdding(true); setOptionError('');
    const requestedType=type;
    try {
      const r=await fetch('/api/property-buildings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property_type:requestedType,name:optionName,address:optionAddress,total_floors:optionFloors?Number(optionFloors):null})});
      const result=await r.json(); if (!r.ok) throw new Error(result.error);
      setBuildings(old=>old.some(b=>b.id===result.id)?old:[...old,result].sort((a,b)=>a.name.localeCompare(b.name,'ko')));
      setBuildingId(result.id);setTotalFloors(String(result.total_floors??''));setOptionName('');setOptionAddress('');setOptionFloors('');
    } catch(e) { setOptionError(e instanceof Error?e.message:'보기를 추가하지 못했습니다.'); } finally { setAdding(false); }
  }
  async function duplicates(form: FormData) {
    const unit=String(form.get('unit_number')??'').trim();
    const address=String(form.get('address')??selected?.address??initial?.address??'');
    if (!unit&&address.length<4) {setCandidates([]);return [];}
    const query=unit?new URLSearchParams({building_id:buildingId,unit_number:unit,building_dong:String(form.get('building_dong')??'').trim()}):new URLSearchParams({address});
    if(!unit&&form.get('floor')!=='')query.set('floor',String(form.get('floor')));
    if (initial) query.set('exclude',initial.id);
    const r=await fetch(`/api/properties/duplicates?${query}`); const result=await r.json();
    if (!r.ok) throw new Error(result.error); setCandidates(result.candidates); return result.candidates as Candidate[];
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget);setError('');setPending(true);
    try {
      if (!selected) throw new Error('매물 유형과 건물·단지 보기를 선택하세요.');
      const unit=String(form.get('unit_number')??'').trim();const store=String(form.get('store_name')??'').trim();
      const sale=transaction==='sale'?wanToWon(price):0, leaseDeposit=wanToWon(deposit), monthly=wanToWon(rent);
      const input={
        building_id:selected.id, title:[selected.name,unit?`${unit}호`:'',type==='retail'?store:''].filter(Boolean).join(' ').slice(0,200),
        building_name:selected.name, complex_name:['apartment','officetel'].includes(type)?selected.name:'', store_name:store,
        address:['apartment','officetel','retail'].includes(type)?initial?.address??selected.address??'':String(form.get('address')??''), property_type:type,transaction_type:transaction,
        price:transaction==='sale'?sale:transaction==='lease'?leaseDeposit:monthly,deposit:leaseDeposit,monthly_rent:monthly,
        area_m2:Number(area),floor:number(form,'floor'),total_floors:number(form,'total_floors'),
        owner_name:String(form.get('owner_name')??''),owner_phone:String(form.get('owner_phone')??''),remarks:String(form.get('remarks')??''),
        direction:String(form.get('direction')??'')||null,
        status:String(form.get('status')),description:String(form.get('description')??''),
        premium:wanToWon(String(form.get('premium')??'0')),business_type:String(form.get('business_type')??''),facilities:String(form.get('facilities')??''),
        building_dong:String(form.get('building_dong')??''),unit_number:unit,room_count:number(form,'room_count'),bathroom_count:number(form,'bathroom_count'),
        next_confirmation_date:String(form.get('next_confirmation_date')??'')||null,
        desired_transaction_date:String(form.get('desired_transaction_date')??'')||null,desired_transaction_note:String(form.get('desired_transaction_note')??''),
        ...(initial && manager?{assigned_staff_id:String(form.get('assigned_staff_id'))}:{}),confirm:form.get('confirm')==='on',
      };
      const parsed=propertyInput.safeParse(input);if (!parsed.success) throw new Error(parsed.error.issues.map(i=>i.message).join(' / '));
      const found=await duplicates(form); if (found.length && !allowDuplicate) {setError('같은 건물·호실 또는 주소·층의 매물이 있습니다. 후보를 확인하고 중복 가능성 확인란을 선택하세요.');return;}
      const r=await fetch(initial?`/api/properties/${initial.id}`:'/api/properties',{method:initial?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(initial?{property:parsed.data,version:initial.version}:parsed.data)});
      const result=await r.json();if (!r.ok) throw new Error(result.error);router.push(`/dashboard/properties/${result.id}`);router.refresh();
    } catch(e) {setError(e instanceof Error?e.message:'저장하지 못했습니다.');} finally {setPending(false);}
  }
  return <form onSubmit={submit}><fieldset disabled={pending} className="space-y-6">
    <section className="panel"><h2 className="section-title">1. 매물 유형 · 건물 선택</h2>
      <label className="field">매물 유형<select name="property_type" required value={type} disabled={adding} onChange={e=>{setType(e.target.value as typeof type);setBuildingId('');setOptionName('');setOptionError('');setAllowDuplicate(false);}}><option value="">매물 유형을 선택하세요</option>{Object.entries(propertyTypes).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {type && <div className="mt-5 space-y-4"><label className="field">{type==='apartment'?'단지 선택':'건물·매물명 선택'}<select name="building_id" required value={buildingId} disabled={adding} onChange={e=>{setTotalFloors(String(buildings.find(b=>b.id===e.target.value)?.total_floors??''));setBuildingId(e.target.value);setAllowDuplicate(false);}}><option value="">{options.length?'보기를 선택하세요':'아래에서 첫 보기를 추가하세요'}</option>{options.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <div className="rounded-xl bg-slate-50 p-4"><p className="mb-3 text-xs"><Link className="text-teal-800 underline" href="/dashboard/buildings">건물·단지 보기 수정·삭제</Link></p><label className="field">새 건물·단지명<input value={optionName} disabled={adding} maxLength={200} onChange={e=>setOptionName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!adding)void addOption();}}} placeholder={type==='officetel'?'예: 한솔2차 오피스텔, 한솔3차 오피스텔':'추가할 보기 이름을 입력하세요'}/></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="field">건물 도로명주소 (선택)<input value={optionAddress} onChange={e=>setOptionAddress(e.target.value)} maxLength={500}/></label><label className="field">건물 총층수 (선택)<input type="number" min={1} max={300} value={optionFloors} onChange={e=>setOptionFloors(e.target.value)}/></label></div><button type="button" className="btn-secondary mt-3" disabled={adding || !optionName.trim()} onClick={addOption}>{adding?'추가 중…':'＋ 보기 추가'}</button><p className="hint mt-2">추가한 보기는 같은 사무소에서 함께 사용하며 목록 검색에서도 선택할 수 있습니다.</p>{optionError && <p role="alert" className="mt-2 text-sm text-red-700">{optionError}</p>}</div>
      </div>}
    </section>
    {selected && <>
      <section className="panel"><h2 className="section-title">2. 호실 · 기본 정보</h2><p className="mb-5 font-semibold text-teal-800">{selected.name}</p><div className="form-grid">
        <label className="field">호실<input name="unit_number" maxLength={40} value={unit} onChange={e=>setUnit(e.target.value)} onBlur={()=>{
          if (!selected) return;
          const info=referenceUnit(selected.name,unit,type,dong);
          if (!info) return;
          setArea(info.area_m2===null?'':String(info.area_m2));
          setFloor(info.floor===null?'':String(info.floor));
          setAllowDuplicate(false);setCandidates([]);
          setLookupMessage('건물별 기본정보를 불러왔습니다.'+(info.original_area_m2!==undefined?' 원본 '+info.original_area_m2+'㎡를 저장 단위에 맞춰 '+info.area_m2+'㎡로 반올림했습니다.':'')+(info.area_m2===null?' 면적은 미등록 상태입니다. 직접 입력하세요.':'')+(info.floor===null?' 층수는 확인 후 입력하세요.':' 호실에서 추정한 층수를 확인하세요.'));
        }} placeholder="예: 201, 1001"/></label>
        {type==='retail' && <label className="field">상호<input name="store_name" maxLength={200} defaultValue={initial?.store_name} placeholder="예: 한솔카페 (공실이면 비워두세요)"/></label>}
        {['apartment','officetel'].includes(type) && <><label className="field md:col-span-2">동<input name="building_dong" maxLength={40} value={dong} onChange={e=>setDong(e.target.value)}/></label><label className="field">방 수<input name="room_count" type="number" min="0" max="100" defaultValue={initial?.room_count??''}/></label><label className="field">화장실 수<input name="bathroom_count" type="number" min="0" max="100" defaultValue={initial?.bathroom_count??''}/></label></>}
        {!['apartment','officetel','retail'].includes(type) && <label className="field md:col-span-2">주소<input name="address" required minLength={4} maxLength={500} defaultValue={initial?.address} onChange={()=>{setAllowDuplicate(false);setCandidates([]);}} placeholder="도로명 주소"/></label>}
        <div className="md:col-span-2 text-sm"><button type="button" disabled={looking||!unit.trim()} className="text-teal-800 underline" onClick={async()=>{setLooking(true);setLookupMessage('');try{const r=await fetch('/api/property-buildings/'+buildingId+'/unit?'+new URLSearchParams({unit,dong}));const d=await r.json();if(!r.ok)throw new Error(d.error);if(d.area_m2!==null)setArea(String(d.area_m2));if(d.floor!==null)setFloor(String(d.floor));if(d.total_floors!==null)setTotalFloors(String(d.total_floors));setLookupMessage((d.source==='building_reference'?'건물별 기본정보':'같은 사무소에 등록된 호실 정보')+'를 불러왔습니다. 실제 면적과 층수를 확인하세요.'+(d.original_area_m2!==undefined?' 원본 '+d.original_area_m2+'㎡를 '+d.area_m2+'㎡로 반올림했습니다.':''));}catch(e){setLookupMessage(e instanceof Error?e.message:'조회 실패');}finally{setLooking(false);}}}>등록된 호실 정보 불러오기</button>{lookupMessage&&<p role="status" className="hint mt-2">{lookupMessage}</p>}{type==='retail'&&<p className="hint mt-2">건물 주소: {selected.address||'건물별 호실 보기에서 대표·관리자가 입력할 수 있습니다.'}</p>}</div>
        <label className="field">전용면적 ({selected.name.trim()==='주공공이'?'평':'㎡'})<input name={selected.name.trim()==='주공공이'?'area_pyeong':'area_m2'} type="number" min="0.01" step="0.01" required value={selected.name.trim()==='주공공이'?areaPyeong:area} onChange={e=>{if(selected.name.trim()==='주공공이'){setAreaPyeong(e.target.value);setAreaM2(e.target.value===''?'':String(pyeongToM2(Number(e.target.value))));}else setArea(e.target.value);}}/><span className="hint">{area?areaLabel(Number(area)):selected.name.trim()==='주공공이'?'평으로 입력하면 ㎡로 자동 환산합니다.':'전용면적을 입력하면 평으로 환산합니다.'}</span></label>
        <label className="field">방향 (선택)<select name="direction" aria-label="방향" defaultValue={initial?.direction??''}><option value="">선택 안 함</option>{Object.entries(directions).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field">거래 상태<select name="status" defaultValue={initial?.status??'available'}>{Object.entries(statuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">해당 층<input name="floor" type="number" min="-20" max="300" value={floor} onChange={e=>{setFloor(e.target.value);setAllowDuplicate(false);}}/><span className="hint">지하는 -1, -2와 같이 입력</span></label>
        <label className="field">전체 층<input name="total_floors" type="number" min="1" max="300" value={totalFloors} onChange={e=>setTotalFloors(e.target.value)}/></label>
      </div></section>
      <section className="panel"><h2 className="section-title">3. 거래 방식 · 금액</h2><div className="form-grid"><label className="field md:col-span-2">거래 방식<select name="transaction_type" value={transaction} onChange={e=>setTransaction(e.target.value as typeof transaction)}>{Object.entries(transactionTypes).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        {transaction==='sale' && <label className="field md:col-span-2">매매가격 (만 원)<input name="price" inputMode="decimal" required value={price} onChange={e=>setPrice(e.target.value)}/><span className="hint">{preview(price)}</span></label>}
        <label className="field">보증금 (만 원)<input name="deposit" inputMode="decimal" required value={deposit} onChange={e=>setDeposit(e.target.value)}/><span className="hint">{preview(deposit)}</span></label>
        <label className="field">월세 (만 원)<input name="monthly_rent" inputMode="decimal" required value={rent} onChange={e=>setRent(e.target.value)}/><span className="hint">{preview(rent)}</span></label>
      </div><p className="hint mt-3">{transaction==='sale'?'현재 세입자가 있다면 보증금과 월세도 입력하세요. 임대가 없으면 0으로 두세요.':'보증금과 월세를 입력하세요. 전세처럼 월세가 없으면 0으로 두세요.'}</p></section>
      <section className="panel"><h2 className="section-title">거래 희망 일정</h2><div className="form-grid"><label className="field">거래 희망일<input name="desired_transaction_date" type="date" defaultValue={initial?.desired_transaction_date??''}/></label><label className="field">일정 메모<input name="desired_transaction_note" maxLength={500} defaultValue={initial?.desired_transaction_note??''} placeholder="예: 즉시 가능, 세입자 퇴거 후, 날짜 협의"/></label></div><p className="hint mt-3">매매·전세·월세 모두 기록할 수 있습니다. 날짜 미정이면 메모만 입력하세요.</p></section>
      {type==='retail' && <section className="panel"><h2 className="section-title">상가 정보</h2><div className="form-grid"><label className="field">권리금 (만 원)<input name="premium" inputMode="decimal" defaultValue={wonToWan(initial?.premium??0)} required/></label><label className="field">업종<input name="business_type" maxLength={100} defaultValue={initial?.business_type}/></label><label className="field md:col-span-2">시설 정보<textarea name="facilities" maxLength={5000} defaultValue={initial?.facilities} rows={3}/></label></div></section>}
      <section className="panel"><h2 className="section-title">소유자 정보 (선택)</h2><div className="form-grid"><label className="field">소유자 성함<input name="owner_name" maxLength={100} defaultValue={initial?.owner_name}/></label><label className="field">소유자 연락처<input name="owner_phone" type="tel" maxLength={40} defaultValue={initial?.owner_phone}/></label></div><p className="hint mt-3">매물의 참고 정보입니다. 계약 당사자는 고객관리에서 별도로 선택합니다.</p></section><section className="panel"><h2 className="section-title">관리 정보</h2><div className="form-grid"><label className="field">담당 직원{initial && manager?<select name="assigned_staff_id" defaultValue={initial.assigned_staff_id}>{colleagues.map(s=><option key={s.id} value={s.id}>{s.display_name}{s.active?'':' (비활성 · 변경 필요)'}</option>)}</select>:<input readOnly value={initial?colleagues.find(s=>s.id===initial.assigned_staff_id)?.display_name??'담당 직원':`${staff.display_name} (자동 지정)`}/>}</label><div className="field">최종 확인일<p className="text-sm font-normal">{dateLabel(initial?.last_confirmed_at??null)}</p><label className="field">다음 재확인일<input aria-label="다음 재확인일" name="next_confirmation_date" type="date" defaultValue={initial?.next_confirmation_date??''}/><span className="hint">비우면 최종 확인 후 30일, 미확인은 등록일부터 확인 대상입니다.</span></label><label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="confirm" defaultChecked={!initial}/>현재 정보로 확인 완료 처리</label></div><label className="field md:col-span-2">비고<textarea name="remarks" rows={2} maxLength={2000} defaultValue={initial?.remarks}/></label><label className="field md:col-span-2">상세 설명<textarea name="description" rows={5} maxLength={10000} defaultValue={initial?.description}/></label></div><p className="hint mt-3">사진과 도면은 저장한 뒤 상세 화면에서 업로드할 수 있습니다.</p></section>
      {!!candidates.length && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-semibold">중복 등록 가능성이 있습니다</h2><ul className="my-3 space-y-2">{candidates.map(p=><li key={p.id}><Link className="text-teal-800 underline" target="_blank" href={`/dashboard/properties/${p.id}`}>{p.title}</Link> · {p.floor??'-'}층 · {areaLabel(p.area_m2)}</li>)}</ul><label className="flex items-center gap-2"><input type="checkbox" checked={allowDuplicate} onChange={e=>setAllowDuplicate(e.target.checked)}/>후보를 확인했으며 별도 매물로 저장합니다.</label></section>}
    </>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="flex justify-end gap-3"><Link className="btn-secondary" href={initial?`/dashboard/properties/${initial.id}`:'/dashboard/properties'}>취소</Link><button className="btn-primary" disabled={pending || adding || !selected}>{pending?'확인·저장 중…':initial?'수정 저장':'매물 등록'}</button></div>
  </fieldset></form>;
}
