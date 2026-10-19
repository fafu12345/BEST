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
 const result=lookup(building,unit,'retail');assert.equal(result.area_m2,area);assert.ok(Number.isInteger(result.floor));
 if(area!==null)assert.ok(area>0&&Number.isFinite(area));
}
assert.equal(lookup('다른건물','101','retail'),null);
assert.equal(lookup('행운빌딩','999','retail'),null);
assert.equal(lookup('행운빌딩','101','apartment'),null);
assert.equal(lookup('행운빌딩','101','retail','A동'),null);
console.log('PASS: 91 reference units, areas, inferred floors, special labels, missing areas, building/type isolation');
