type PropertyDisplay={title?:string|null;building_name?:string|null;complex_name?:string|null;building_dong?:string|null;unit_number?:string|null};
export function contractPropertyLabel(p:PropertyDisplay|null|undefined){
 if(!p)return '부동산 정보 미입력';
 const base=p.complex_name||p.building_name||p.title||'부동산';
 const dong=p.building_dong?.trim();const unit=p.unit_number?.trim();
 return [base,dong?(dong.endsWith('동')?dong:dong+'동'):'',unit?(unit.endsWith('호')?unit:unit+'호'):''].filter(Boolean).join(' ');
}
