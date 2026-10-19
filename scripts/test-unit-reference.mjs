import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/properties/unit-reference.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('exports',js)(exports);
const {referenceUnit:lookup,unitReferences:data}=exports;
assert.equal(Object.keys(data['행운빌딩']).length,21);
assert.equal(Object.keys(data['한솔프라자']).length,45);
assert.deepEqual(lookup('행운빌딩','601','retail'),{area_m2:99.99,floor:6});
assert.deepEqual(lookup('행운빌딩',' 101호 ','office'),{area_m2:20.45,floor:1});
assert.deepEqual(lookup('한솔프라자','205-a','retail'),{area_m2:93.12,floor:2});
assert.deepEqual(lookup('한솔프라자','206-B','retail'),{area_m2:27.39,floor:2});
assert.deepEqual(lookup('한솔프라자','303-1','retail'),{area_m2:6.66,floor:3});
for(const unit of ['중101','중102','중103','중104'])assert.equal(lookup('한솔프라자',unit,'retail').floor,1);
for(const unit of ['205','206'])assert.deepEqual(lookup('한솔프라자',unit,'retail'),{area_m2:null,floor:2});
assert.deepEqual(lookup('한솔프라자','501','retail'),{area_m2:1169.14,floor:5});
for(const [building,units] of Object.entries(data))for(const [unit,area] of Object.entries(units)){
 const result=lookup(building,unit,'retail');assert.equal(result.area_m2,area===null?null:Math.round(area*100)/100);assert.ok(Number.isInteger(result.floor));
 if(area!==null)assert.ok(area>0&&Number.isFinite(area));
}
assert.equal(lookup('다른건물','101','retail'),null);
assert.equal(lookup('행운빌딩','999','retail'),null);
assert.equal(lookup('행운빌딩','101','apartment'),null);
assert.equal(lookup('행운빌딩','101','retail','A동'),null);
console.log('PASS: 505 reference units, areas, inferred floors, special labels, missing areas, building/type isolation');

assert.equal(Object.keys(data['주공공이']).length,63);
assert.deepEqual(lookup('주공공이','101','retail'),{area_m2:66.12,floor:1});
assert.deepEqual(lookup('주공공이','120 ~ 121','retail'),{area_m2:84.30,floor:1});
assert.deepEqual(lookup('주공공이','110-3 ~ 110-4','retail'),{area_m2:66.12,floor:1});
assert.equal(lookup('주공공이','120','retail'),null);
for(const unit of ['138','140','214'])assert.equal(lookup('주공공이',unit,'retail').area_m2,null);
for(const [unit,area] of Object.entries(exports.jugongPyeong))if(area!==null){
 assert.equal(exports.m2ToPyeong(lookup('주공공이',unit,'retail').area_m2),area);
}
console.log('PASS: pyeong conversion, grouped units, missing areas and original pyeong precision');

assert.equal(Object.keys(data['아이파크상가']).length,31);
assert.deepEqual(lookup('아이파크상가','103 ~ 104','retail'),{area_m2:27.28,floor:1});
assert.deepEqual(lookup('아이파크상가','209~210','retail'),{area_m2:38.6,floor:2});
assert.deepEqual(lookup('아이파크상가','213','retail'),{area_m2:148.28,floor:2});
assert.equal(lookup('아이파크상가','102','retail').area_m2,null);
assert.equal(lookup('아이파크상가','103','retail'),null);
console.log('PASS: IPark square-metre areas, grouped units and missing area');

assert.equal(Object.keys(data['신세대상가']).length,43);
assert.deepEqual(lookup('신세대상가','205-1','retail'),{area_m2:91.86,floor:2});
assert.deepEqual(lookup('신세대상가','205','retail'),{area_m2:24.72,floor:2});
assert.deepEqual(lookup('신세대상가','301-1','retail'),{area_m2:54.94,floor:3});
assert.deepEqual(lookup('신세대상가','506','retail'),{area_m2:143.76,floor:5});
assert.equal(Object.values(data).reduce((count,units)=>count+Object.keys(units).length,0),505);
console.log('PASS: Sinse-dae separate suffixed units and total 505 reference entries');

assert.equal(Object.keys(data['삼일프라자']).length,63);
assert.deepEqual(lookup('삼일프라자','401-1','retail'),{area_m2:127.36,floor:4});
assert.deepEqual(lookup('삼일프라자','401','retail'),{area_m2:63.68,floor:4});
assert.deepEqual(lookup('삼일프라자','502-2','retail'),{area_m2:127.6,floor:5});
assert.deepEqual(lookup('삼일프라자','503','retail'),{area_m2:169.35,floor:5});
assert.deepEqual(lookup('삼일프라자','121 ~ 122','retail'),{area_m2:18.56,floor:1});
assert.equal(lookup('삼일프라자','121','retail'),null);
console.log('PASS: Samil 63 entries, grouped units and separate subdivided units');

assert.equal(Object.keys(data['씨티빌딩']).length,12);
assert.deepEqual(lookup('씨티빌딩','101-1','retail'),{area_m2:43.02,floor:1});
assert.deepEqual(lookup('씨티빌딩','101-2','retail'),{area_m2:21.94,floor:1});
assert.deepEqual(lookup('씨티빌딩','303','retail'),{area_m2:37.34,floor:3});
assert.deepEqual(lookup('씨티빌딩','502','retail'),{area_m2:151.62,floor:5});
assert.equal(lookup('씨티빌딩','101','retail'),null);
console.log('PASS: City building 12 entries and separate first-floor units');

assert.equal(Object.keys(data['벌말프라자']).length,28);
assert.equal(data['벌말프라자']['201'],61.875);
assert.deepEqual(lookup('벌말프라자','201','retail'),{area_m2:61.88,original_area_m2:61.875,floor:2});
assert.deepEqual(lookup('벌말프라자','505','retail'),{area_m2:80.8,floor:5});
console.log('PASS: Beolmal 28 entries, original precision retained and compatible saved area');

assert.equal(Object.keys(data['부림프라자']).length,36);
assert.deepEqual(lookup('부림프라자','306-1','retail'),{area_m2:95,floor:3});
assert.deepEqual(lookup('부림프라자','306','retail'),{area_m2:60,floor:3});
assert.deepEqual(lookup('부림프라자','101','retail'),{area_m2:51.98,original_area_m2:51.975,floor:1});
assert.deepEqual(lookup('부림프라자','208','retail'),{area_m2:104.53,original_area_m2:104.525,floor:2});
assert.deepEqual(lookup('부림프라자','506','retail'),{area_m2:138.28,original_area_m2:138.275,floor:5});
console.log('PASS: Burim 36 entries, separate units and three-decimal originals');

assert.equal(Object.keys(data['무지개상가']).length,38);
for(const unit of ['203-1','203-2'])assert.deepEqual(lookup('무지개상가',unit,'retail'),{area_m2:107.1,floor:2});
for(const unit of ['304-1','304-2'])assert.deepEqual(lookup('무지개상가',unit,'retail'),{area_m2:144.74,floor:3});
assert.deepEqual(lookup('무지개상가','505','retail'),{area_m2:243.55,floor:5});
assert.equal(lookup('무지개상가','203','retail'),null);
console.log('PASS: Rainbow 38 entries and distinct suffixed units');

assert.equal(Object.keys(data['동아프라자']).length,47);
for(const [unit,area] of [['105 ~ 106',16.74],['116~117',18.6],['125~126',7.44],['135~136',9.12]])assert.deepEqual(lookup('동아프라자',unit,'retail'),{area_m2:area,floor:1});
for(const unit of ['204','208'])assert.deepEqual(lookup('동아프라자',unit,'retail'),{area_m2:null,floor:2});
assert.deepEqual(lookup('동아프라자','207','retail'),{area_m2:115.42,floor:2});
assert.equal(lookup('동아프라자','105','retail'),null);
console.log('PASS: Donga 47 entries, four grouped units and missing areas');

assert.equal(Object.keys(data['남경빌딩']).length,16);
assert.deepEqual(lookup('남경빌딩','501-A','retail'),{area_m2:83.73,floor:5});
assert.deepEqual(lookup('남경빌딩','501-b','retail'),{area_m2:96.5,floor:5});
assert.deepEqual(lookup('남경빌딩','401','retail'),{area_m2:370.44,floor:4});
assert.deepEqual(lookup('남경빌딩','602','retail'),{area_m2:105.38,floor:6});
assert.equal(lookup('남경빌딩','501','retail'),null);
console.log('PASS: Namgyeong 16 entries and separate A/B units');

assert.equal(Object.keys(data['광장빌딩']).length,37);
assert.equal(data['광장빌딩']['106'],22.425);
assert.deepEqual(lookup('광장빌딩','106','retail'),{area_m2:22.43,original_area_m2:22.425,floor:1});
assert.deepEqual(lookup('광장빌딩','209','retail'),{area_m2:37.08,floor:2});
assert.deepEqual(lookup('광장빌딩','506','retail'),{area_m2:76.22,floor:5});
console.log('PASS: Gwangjang 37 entries and original three-decimal precision');
