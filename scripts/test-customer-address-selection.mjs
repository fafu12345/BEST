import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {actor,create,req,cleanup,customerInput,admin} from './contract-test-helpers.mjs';
const agent=await actor('agent1'),colleague=await actor('agent2'),other=await actor('other-owner');
const fixtures={customers:[]};const marker='가상주소선택-'+Date.now();const address='가상시 테스트로 12, 301호';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});let count=0;const pass=s=>console.log('PASS',++count,s);
try{
 const first=await create('/api/customers',{...customerInput(marker+' 가'),address},agent);fixtures.customers.push(first.id);
 const second=await create('/api/customers',{...customerInput(marker+' 나'),address},agent);fixtures.customers.push(second.id);
 const third=await create('/api/customers',customerInput(marker+' 다'),colleague);fixtures.customers.push(third.id);
 assert.equal((await req('/api/customers/'+first.id,'GET')).status,401);
 assert.equal((await req('/api/customers/'+first.id,'GET',undefined,other)).status,404);
 assert.equal((await req('/api/customers/'+first.id,'DELETE',{version:first.version},colleague)).status,403);
 assert.equal((await req('/api/customers','POST',{...customerInput('invalid'),address:'x'.repeat(501)},agent)).status,400);pass('address validation, anonymous and foreign office access, non-assignee deletion blocked');
 await page.goto('http://127.0.0.1:3000/login');await page.getByLabel('이메일',{exact:true}).fill('agent1@estatematch.test');await page.getByLabel('비밀번호',{exact:true}).fill('EstateMatch-Test-2026!');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.waitForURL('**/dashboard');
 await page.goto('http://127.0.0.1:3000/dashboard/customers/'+first.id+'/edit');await expect(page.getByLabel('주소',{exact:true})).toHaveValue(address);await page.getByLabel('주소',{exact:true}).fill(address+' 수정');await page.getByRole('button',{name:'수정 저장',exact:true}).click();await page.waitForURL('**/customers/'+first.id);await expect(page.getByText(address+' 수정',{exact:true})).toBeVisible();pass('address form persists and customer detail displays it');
 await page.goto('http://127.0.0.1:3000/dashboard/customers?'+new URLSearchParams({q:marker}));await expect(page.getByRole('table').getByText(address+' 수정',{exact:true})).toBeVisible();await expect(page.getByRole('table').getByLabel(marker+' 다 선택',{exact:true})).toBeDisabled();await page.getByLabel('현재 페이지 삭제 가능 고객 전체 선택').check();await expect(page.getByRole('button',{name:'선택 삭제 (2명)',exact:true})).toBeEnabled();pass('desktop address, selectable assignees and select-all');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('table',{includeHidden:true})).toBeHidden();await expect(page.getByText('주소: '+address+' 수정',{exact:true})).toBeVisible();await expect(page.getByLabel(marker+' 가 선택',{exact:true}).filter({visible:true})).toBeChecked();pass('mobile address and checkbox share desktop selection');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'선택 삭제 (2명)',exact:true}).click();assert.equal((await agent.db.from('customers').select('deleted_at').eq('id',first.id).single()).data.deleted_at,null);pass('cancel leaves customers intact');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'선택 삭제 (2명)',exact:true}).click();await expect(page.getByRole('status')).toHaveText('2명 삭제 완료.');
 const records=await admin.from('customers').select('id,deleted_at,address').in('id',fixtures.customers);assert.ifError(records.error);assert.equal(records.data.length,3);assert.ok(records.data.find(x=>x.id===first.id).deleted_at);assert.ok(records.data.find(x=>x.id===second.id).deleted_at);assert.equal(records.data.find(x=>x.id===third.id).deleted_at,null);assert.equal(records.data.find(x=>x.id===first.id).address,address+' 수정');pass('bulk soft deletion preserves records, address and other assignee');
 console.log(count+' address/selection checks passed');
}finally{await browser.close();await cleanup(fixtures);}
