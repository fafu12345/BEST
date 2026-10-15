'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { propertyInput, propertyTypes, transactionTypes, statuses, moneyLabel, wanToWon, wonToWan, areaLabel, dateLabel, type Property, type StaffOption } from '@/lib/properties/shared';

type Candidate = { id: string; title: string; floor: number | null; area_m2: number | null };
export function PropertyForm({ initial, staff, colleagues }: { initial?: Property; staff: StaffOption; colleagues: StaffOption[] }) {
  const router = useRouter();
  const [type, setType] = useState(initial?.property_type ?? 'retail');
  const [transaction, setTransaction] = useState(initial?.transaction_type ?? 'sale');
  const [price, setPrice] = useState(wonToWan(initial?.price ?? 0));
  const [area, setArea] = useState(String(initial?.area_m2 ?? ''));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const manager = ['owner', 'manager'].includes(staff.role);
  const number = (form: FormData, name: string) => form.get(name) === '' || form.get(name) === null ? null : Number(form.get(name));
  let preview = ''; try { preview = moneyLabel(wanToWon(price)); } catch { preview = '금액을 확인하세요.'; }
  async function duplicates(form: FormData) {
    const query = new URLSearchParams({ address: String(form.get('address') ?? '') });
    if (form.get('floor') !== '') query.set('floor', String(form.get('floor')));
    if (initial) query.set('exclude', initial.id);
    const response = await fetch(`/api/properties/duplicates?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setCandidates(result.candidates); return result.candidates as Candidate[];
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError(''); setPending(true);
    try {
      const input = {
        title: String(form.get('title')), building_name: String(form.get('building_name')), address: String(form.get('address')),
        property_type: type, transaction_type: transaction, price: wanToWon(price),
        deposit: wanToWon(String(form.get('deposit') ?? '0')), area_m2: Number(area), floor: number(form, 'floor'), total_floors: number(form, 'total_floors'),
        status: String(form.get('status')), description: String(form.get('description') ?? ''),
        premium: wanToWon(String(form.get('premium') ?? '0')), business_type: String(form.get('business_type') ?? ''), facilities: String(form.get('facilities') ?? ''),
        complex_name: String(form.get('complex_name') ?? ''), building_dong: String(form.get('building_dong') ?? ''), unit_number: String(form.get('unit_number') ?? ''), room_count: number(form, 'room_count'),
        ...(initial && manager ? { assigned_staff_id: String(form.get('assigned_staff_id')) } : {}), confirm: form.get('confirm') === 'on',
      };
      const parsed = propertyInput.safeParse(input);
      if (!parsed.success) throw new Error(parsed.error.issues.map(i => i.message).join(' / '));
      const found = await duplicates(form);
      if (found.length && !allowDuplicate) { setError('같은 주소·층의 매물이 있습니다. 아래 후보를 확인한 뒤 중복 가능성 확인란을 선택하세요.'); return; }
      const response = await fetch(initial ? `/api/properties/${initial.id}` : '/api/properties', {
        method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initial ? { property: parsed.data, version: initial.version } : parsed.data),
      });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      router.push(`/dashboard/properties/${result.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-6">
    <section className="panel"><h2 className="section-title">기본 정보</h2><div className="form-grid">
      <label className="field">매물 유형<select name="property_type" value={type} onChange={e => setType(e.target.value as typeof type)}>{!Object.hasOwn(propertyTypes, type) && <option value={type}>기존 유형 ({type}) · 지원 유형으로 변경 필요</option>}{Object.entries(propertyTypes).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field">거래 방식<select name="transaction_type" value={transaction} onChange={e => setTransaction(e.target.value as typeof transaction)}>{Object.entries(transactionTypes).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field md:col-span-2">매물명<input name="title" required maxLength={200} defaultValue={initial?.title} placeholder="예: 역세권 1층 상가"/></label>
      <label className="field">건물명<input name="building_name" maxLength={200} defaultValue={initial?.building_name}/></label>
      <label className="field">거래 상태<select name="status" defaultValue={initial?.status ?? 'available'}>{Object.entries(statuses).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field md:col-span-2">주소<input name="address" required minLength={4} maxLength={500} defaultValue={initial?.address} onChange={() => { setAllowDuplicate(false); setCandidates([]); }} placeholder="도로명 주소와 상세 위치"/></label>
      <label className="field">면적 (㎡)<input name="area_m2" type="number" min="0.01" step="0.01" required value={area} onChange={e => setArea(e.target.value)}/><span className="hint">{area ? areaLabel(Number(area)) : '㎡로 입력하면 평으로 환산합니다.'}</span></label>
      <label className="field">{transaction === 'rent' ? '월세' : transaction === 'lease' ? '전세금' : '매매가'} (만 원)<input name="price" inputMode="decimal" required value={price} onChange={e => setPrice(e.target.value)}/><span className="hint">{preview}</span></label>
      {transaction === 'rent' && <label className="field">보증금 (만 원)<input name="deposit" inputMode="decimal" required defaultValue={wonToWan(initial?.deposit ?? 0)}/></label>}
      <label className="field">해당 층<input name="floor" type="number" min="-20" max="300" defaultValue={initial?.floor ?? ''} onChange={() => setAllowDuplicate(false)}/><span className="hint">지하는 -1, -2와 같이 입력</span></label>
      <label className="field">전체 층<input name="total_floors" type="number" min="1" max="300" defaultValue={initial?.total_floors ?? ''}/></label>
    </div></section>
    {type === 'retail' && <section className="panel"><h2 className="section-title">상가 정보</h2><div className="form-grid"><label className="field">권리금 (만 원)<input name="premium" inputMode="decimal" defaultValue={wonToWan(initial?.premium ?? 0)} required/></label><label className="field">업종<input name="business_type" maxLength={100} defaultValue={initial?.business_type} placeholder="예: 음식점, 소매점"/></label><label className="field md:col-span-2">시설 정보<textarea name="facilities" maxLength={5000} defaultValue={initial?.facilities} placeholder="주방, 냉난방, 주차 등" rows={3}/></label></div></section>}
    {type === 'apartment' && <section className="panel"><h2 className="section-title">아파트 정보</h2><div className="form-grid"><label className="field">단지명<input name="complex_name" maxLength={200} defaultValue={initial?.complex_name}/></label><label className="field">동<input name="building_dong" maxLength={40} defaultValue={initial?.building_dong}/></label><label className="field">호수<input name="unit_number" maxLength={40} defaultValue={initial?.unit_number}/></label><label className="field">방 수<input name="room_count" type="number" min="0" max="100" defaultValue={initial?.room_count ?? ''}/></label></div></section>}
    {type === 'officetel' && <section className="panel"><h2 className="section-title">오피스텔 정보</h2><label className="field max-w-sm">방 수<input name="room_count" type="number" min="0" max="100" defaultValue={initial?.room_count ?? ''}/></label></section>}
    {type === 'office' && <p className="hint">사무실의 주차·회의실·냉난방 등은 아래 설명에 기록하세요.</p>}
    <section className="panel"><h2 className="section-title">관리 정보</h2><div className="form-grid">
      <label className="field">담당 직원{initial && manager ? <select name="assigned_staff_id" defaultValue={initial.assigned_staff_id}>{colleagues.map(s => <option key={s.id} value={s.id}>{s.display_name}{s.active ? '' : ' (비활성 · 다른 직원으로 변경 필요)'}</option>)}</select> : <input readOnly value={initial ? colleagues.find(s => s.id === initial.assigned_staff_id)?.display_name ?? '담당 직원' : `${staff.display_name} (자동 지정)`}/>}</label>
      <div className="field">최종 확인일<p className="text-sm font-normal">{dateLabel(initial?.last_confirmed_at ?? null)}</p><label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="confirm" defaultChecked={!initial}/>현재 정보로 확인 완료 처리</label></div>
      <label className="field md:col-span-2">상세 설명<textarea name="description" rows={5} maxLength={10000} defaultValue={initial?.description}/></label>
    </div><p className="hint mt-3">사진과 도면은 매물을 저장한 뒤 상세 화면에서 업로드할 수 있습니다.</p></section>
    {!!candidates.length && <section className="rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-semibold">중복 등록 가능성이 있습니다</h2><ul className="my-3 space-y-2">{candidates.map(p => <li key={p.id}><Link className="text-teal-800 underline" target="_blank" href={`/dashboard/properties/${p.id}`}>{p.title}</Link> · {p.floor ?? '-'}층 · {areaLabel(p.area_m2)}</li>)}</ul><label className="flex items-center gap-2"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)}/>후보를 확인했으며 별도 매물로 저장합니다.</label></section>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    <div className="flex justify-end gap-3"><Link className="btn-secondary" href={initial ? `/dashboard/properties/${initial.id}` : '/dashboard/properties'}>취소</Link><button className="btn-primary" disabled={pending}>{pending ? '확인·저장 중…' : initial ? '수정 저장' : '매물 등록'}</button></div>
  </form>;
}
