// User-provided exclusive areas (㎡). These are reference data, not listings.
export const unitReferences: Record<string, Record<string, number | null>> = {
  '행운빌딩': {
    '101':20.45,'102':20.45,'103':20.45,'104':20.45,'105':22.62,'106':22.62,
    '201':97.59,'202':81.78,'203':135.84,
    '301':97.59,'302':40.89,'303':60.03,'304':116.7,
    '401':97.59,'402':217.62,'501':97.59,'502':81.78,'503':135.84,
    '601':99.99,'602':81.78,'603':135.84,
  },
  '한솔프라자': {
    '205-A':93.12,'206-A':76.45,'205-B':9.40,'206-B':27.39,'303-1':6.66,
    '중101':54.57,'중102':27.36,'중103':69.92,'중104':53.36,
    '101':37.40,'102':37.40,'103':37.40,'104':37.40,'105':37.40,'106':37.40,
    '107':62.08,'108':62.48,'109':76.28,'110':39.68,'111':39.68,
    '201':156.02,'202':120.56,'203':120.56,'204':203.48,'205':null,'206':null,'207':103.84,'208':166.94,
    '301':157.34,'302':120.56,'303':113.90,'304':204.80,'305':102.52,'306':103.84,'307':103.84,'308':166.94,
    '401':157.34,'402':120.56,'403':120.56,'404':204.80,'405':102.52,'406':103.84,'407':103.84,'408':166.94,
    '501':1169.14,
  },
};
export function referenceUnit(building: string, unit: string, propertyType: string, dong = '') {
  if (!['retail','office'].includes(propertyType) || dong.trim()) return null;
  const units = unitReferences[building.trim()];
  const key = unit.trim().replace(/호$/, '').trim().toUpperCase();
  if (!units || !Object.hasOwn(units,key)) return null;
  const digits = /^(\d{3,})(?:-[A-Z0-9]+)?$/.exec(key);
  // The supplied register uses 중101–중104; the user classifies them as floor 1.
  return {area_m2:units[key],floor:building.trim()==='한솔프라자' && /^중10[1-4]$/.test(key) ? 1 : digits ? Math.floor(Number(digits[1])/100) : null};
}
