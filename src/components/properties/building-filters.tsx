'use client';
import { useState } from 'react';
import { propertyTypes, type BuildingOption } from '@/lib/properties/shared';
export function BuildingFilters({ buildings, initialType, initialBuilding }: { buildings: BuildingOption[]; initialType: string; initialBuilding: string }) {
  const [type,setType]=useState(initialType);const [building,setBuilding]=useState(initialBuilding);
  return <><label className="field">매물 유형<select name="type" value={type} onChange={e=>{setType(e.target.value);setBuilding('');}}><option value="">전체 유형</option>{Object.entries(propertyTypes).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field">건물·단지 선택<select name="building" value={building} onChange={e=>setBuilding(e.target.value)}><option value="">전체 건물·단지</option>{buildings.filter(b=>!type || b.property_type===type).map(b=><option key={b.id} value={b.id}>{b.name}{!type?` · ${propertyTypes[b.property_type as keyof typeof propertyTypes]}`:''}</option>)}</select></label></>;
}
