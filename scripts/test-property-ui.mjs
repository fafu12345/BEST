import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const config=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
assert.match(config.NEXT_PUBLIC_SUPABASE_URL,/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
const admin=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE_PATH?{executablePath:process.env.CHROME_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const marker='UI-'+Date.now(),ids=[];let checks=0;
const pass=label=>{console.log('PASS:',label);checks++;};
async function login(email){await page.goto('http://127.0.0.1:3000/login');await page.getByLabel('이메일',{exact:true}).fill(email+'@estatematch.test');await page.getByLabel('비밀번호',{exact:true}).fill('EstateMatch-Test-2026!');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.waitForURL('**/dashboard');}
async function form(title){await page.getByLabel('매물명',{exact:true}).fill(title);await page.getByLabel('건물명',{exact:true}).fill(marker+'빌딩');await page.getByLabel('주소',{exact:true}).fill(marker+' 가상로 123');await page.locator('[name=area_m2]').fill('33.06');await page.locator('[name=floor]').fill('1');await page.locator('[name=total_floors]').fill('5');await page.locator('[name=price]').fill('123.4567');}
try {
 await login('agent1');await page.getByRole('link',{name:'매물관리 열기'}).click();await page.getByRole('link',{name:'매물 등록'}).click();
 await page.locator('[name=property_type]').selectOption('apartment');await expect(page.getByLabel('단지명',{exact:true})).toBeVisible();await expect(page.locator('[name=premium]')).toHaveCount(0);pass('apartment-specific form');
 await page.locator('[name=property_type]').selectOption('officetel');await expect(page.getByLabel('방 수',{exact:true})).toBeVisible();await expect(page.locator('[name=complex_name]')).toHaveCount(0);pass('officetel-specific form');
 await page.locator('[name=property_type]').selectOption('office');await expect(page.locator('[name=room_count]')).toHaveCount(0);pass('office-specific form');
 await page.locator('[name=property_type]').selectOption('retail');await page.locator('[name=transaction_type]').selectOption('rent');await form(marker+' 상가');await page.locator('[name=deposit]').fill('1000');await page.locator('[name=premium]').fill('1250');await page.getByLabel('업종',{exact:true}).fill('가상 음식점');await page.getByLabel('시설 정보',{exact:true}).fill('가상 주방');
 await page.getByRole('button',{name:'매물 등록',exact:true}).click();await page.waitForURL(/\/dashboard\/properties\/[a-f0-9-]{36}$/);const id=page.url().split('/').at(-1);ids.push(id);await expect(page.getByRole('heading',{name:marker+' 상가',exact:true})).toBeVisible();pass('retail registration through browser');
 await expect(page.getByText('보증금 1,000만 원 / 월 123만 4,567 원',{exact:true})).toBeVisible();await expect(page.getByText('10평 (33.06㎡)',{exact:true})).toBeVisible();pass('money and area conversion rendered');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 await page.locator('input[type=file]').setInputFiles({name:'ui-photo.png',mimeType:'image/png',buffer:png});const uploaded=page.waitForResponse(r=>r.url().endsWith(`/api/properties/${id}/files`)&&r.request().method()==='POST');await page.getByRole('button',{name:'업로드',exact:true}).click();assert.equal((await uploaded).status(),201);await expect(page.getByRole('img',{name:'ui-photo.png'})).toBeVisible();pass('browser photo upload and private image rendering');
 const imageUrl=await page.getByRole('img',{name:'ui-photo.png'}).getAttribute('src');
 await page.getByRole('link',{name:'수정',exact:true}).click();await page.locator('[name=price]').fill('125.0001');await page.locator('[name=status]').selectOption('reserved');await page.getByRole('button',{name:'수정 저장',exact:true}).click();await page.waitForURL(`**/properties/${id}`);await expect(page.getByText('가격: 123만 4,567 원 → 125만 1 원',{exact:true})).toBeVisible();await expect(page.getByText('거래 상태: 거래 가능 → 계약 진행',{exact:true})).toBeVisible();pass('browser edit and immutable history display');
 await page.screenshot({path:'/tmp/estatematch-stage2-detail.png',fullPage:true});
 await page.goto('http://127.0.0.1:3000/dashboard/properties/new');await form(marker+' 별도 매물');await page.getByRole('button',{name:'매물 등록',exact:true}).click();await expect(page.getByRole('heading',{name:'중복 등록 가능성이 있습니다'})).toBeVisible();pass('duplicate registration warning');
 await page.getByLabel('후보를 확인했으며 별도 매물로 저장합니다.').check();await page.getByRole('button',{name:'매물 등록',exact:true}).click();await page.waitForURL(/\/dashboard\/properties\/[a-f0-9-]{36}$/);ids.push(page.url().split('/').at(-1));pass('acknowledged duplicate can be saved');
 await page.goto('http://127.0.0.1:3000/dashboard/properties?q='+encodeURIComponent(marker));await expect(page.getByRole('table')).toBeVisible();await page.screenshot({path:'/tmp/estatematch-stage2-desktop.png',fullPage:true});pass('desktop table layout');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('table',{includeHidden:true})).toBeHidden();await expect(page.getByRole('link',{name:new RegExp(marker+' 상가')})).toBeVisible();await page.screenshot({path:'/tmp/estatematch-stage2-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));pass('mobile cards and no horizontal overflow');
 await login('agent2');await page.goto(`http://127.0.0.1:3000/dashboard/properties/${id}`);await expect(page.getByRole('link',{name:'수정',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'업로드',exact:true})).toHaveCount(0);await page.goto(`http://127.0.0.1:3000/dashboard/properties/${id}/edit`);await expect(page.getByRole('heading',{name:'수정 권한이 없습니다.'})).toBeVisible();pass('non-assignee read-only UI and edit-route check');
 await login('other-owner');await page.goto(`http://127.0.0.1:3000/dashboard/properties/${id}`);await expect(page.getByRole('heading',{name:'매물을 찾을 수 없습니다.'})).toBeVisible();pass('cross-office detail hidden');
 await login('agent1');await page.goto(`http://127.0.0.1:3000/dashboard/properties/${id}`);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'매물 삭제',exact:true}).click();await page.waitForURL('**/dashboard/properties');await page.goto(`http://127.0.0.1:3000/dashboard/properties/${id}`);await expect(page.getByRole('heading',{name:'매물을 찾을 수 없습니다.'})).toBeVisible();assert.equal((await context.request.get('http://127.0.0.1:3000'+imageUrl)).status(),404);pass('browser soft deletion blocks detail and attachment');
 console.log(`${checks} browser workflow checks passed`);
} catch(e) {
 console.error('Browser test URL:',page.url());
 await page.screenshot({path:'/tmp/estatematch-stage2-ui-failure.png',fullPage:true});
 console.error((await page.locator('main').innerText()).slice(0,2000));
 throw e;
} finally {
 await browser.close();
 if(ids.length){const files=await admin.from('property_images').select('storage_path').in('property_id',ids);if(files.data?.length)assert.ifError((await admin.storage.from('property-images').remove(files.data.map(f=>f.storage_path))).error);assert.ifError((await admin.from('property_change_history').delete().in('property_id',ids)).error);assert.ifError((await admin.from('property_images').delete().in('property_id',ids)).error);assert.ifError((await admin.from('properties').delete().in('id',ids)).error);}
}
