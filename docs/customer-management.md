# 3단계: 계약 중심 고객관리

## 제공 화면

로그인 → 대시보드의 **고객관리 열기**, 또는 매물 화면 상단 **고객관리**.

| 경로 | 기능 |
| --- | --- |
| /dashboard/customers | 이름·법인명·전화·이메일 검색, 개인/법인·담당자 필터, 이름·등록·수정·연락·보유기한 정렬, 20명씩 페이지 |
| /dashboard/customers/new | 개인·법인 등록, 중복 경고, 담당자 지정, 개인정보 기록 |
| /dashboard/customers/[id] | 기본정보·내부 메모·연락 일정·상담 이력·관련 매물 |
| /dashboard/customers/[id]/edit | 수정, 대표·관리자 담당자 변경, 다음 연락일 변경 |
| /dashboard/customers/schedule | 기한 경과 / 앞으로 7일 / 일정 미정 / 전체 연락 일정 |

PC는 표, 모바일은 카드로 표시한다. 다음 연락일과 상담 일시는 **한국 시간**으로 입력·표시하고 DB에는 timestamptz로 저장한다. 연락 일정은 알림 발송이 아닌 조회 기능이다.

상담 기록에는 일시, 전화/방문/이메일/메시지/기타, 상담 내용과 선택적인 관련 매물을 입력한다. 매물 선택은 최근 활성 매물 200건이며, 같은 사무소 매물을 연결할 수 있다. 관련 매물은 모든 상담에서 중복을 제거한 목록으로 조회하고, 상담·관련 매물 목록은 각각 20건씩 페이지를 제공한다. 소프트 삭제된 매물은 기존 상담에 이름과 보관 상태로 남고, 활성 매물/사진 접근을 다시 열지 않는다.

계약 영역은 다음 단계 안내만 표시한다. **새 계약 연결·당사자 역할·계약 등록은 구현하지 않았다.** 기존 contracts/customer_id는 보존한다. 고객에게 landlord/tenant 같은 고정 customer_type은 두지 않는다.

## DB: 추가 마이그레이션 006

기존 customers와 consultations를 재사용한다. 기존 001~005 파일을 수정하지 않는다. 공개 업무 테이블 14개의 기존 RLS를 유지하고 고객/상담 변경 정책을 보강한다.

### customers

기존 `id`를 customer_id로 사용하고, 기존 `assigned_staff_id`를 담당 직원(assigned_to)으로 사용한다. 별도 동의어 ID·담당자 컬럼을 만들지 않는다. office_id, name, phone, email, status, notes, created_at, updated_at와 기존 FK/UNIQUE를 유지한다.

| 추가 컬럼 | 형식 / 의미 |
| --- | --- |
| customer_kind | individual / company, 기본 individual |
| company_name | 최대 200자, 기본 빈 문자열 |
| contact_consent | nullable boolean: 미확인 / 동의 / 거부 |
| consent_recorded_at | 연락 동의 상태를 마지막으로 기록한 시각, DB가 생성 |
| next_contact_at | nullable timestamptz |
| privacy_basis | unrecorded / consent / contract / legal_obligation / legitimate_interest / other |
| privacy_basis_note | 근거·확인 내용, 최대 1,000자 |
| processing_purpose | 처리 목적, 최대 500자 |
| retention_until | nullable date, 보유기한 |
| deleted_at | 소프트 보관 시각 |
| version | 동시 수정 방지용 정수, DB 증가 |
| normalized_name / normalized_company_name / normalized_phone / normalized_email / search_text | 생성 컬럼, 중복·검색용 |

고객의 과거 이름·연락처·메모·담당자·ID·타임스탬프는 마이그레이션으로 바꾸지 않는다. 기존 고객은 구분 기본값 개인으로 표시하므로 법인 여부를 확인해 보완할 수 있다. 연락 동의는 NULL, 근거는 unrecorded, 기한은 NULL로 남기고 화면에서 확인 대상으로 표시한다. 과거 자료가 동의된 것으로 간주되지 않는다.

신규 등록 API는 처리 근거·근거 기록·목적·보유기한을 요구한다. 기존 고객 수정은 과거 미확인 상태를 유지할 수 있어, 연락처·메모 수정이 갑자기 막히지 않는다. 연락 동의는 수집·이용 근거와 별도이다. 시스템이 실제 동의나 법적 근거를 자동 판정하지 않는다.

사업자등록번호·주민등록번호 필드는 수집하지 않는다. 근거·메모에도 불필요한 민감정보를 넣지 않는다. 기한이 지난 자료는 검토 표시하고 보유기한순 정렬로 찾을 수 있다. **자동 파기 기능은 없으며 고객 보관은 개인정보 파기가 아니다.** 실제 운영 시 기한 경과 자료의 보유 근거 검토·파기 절차를 별도 수행해야 한다.

### consultations / 파생 뷰

기존 customer_id/property_id/담당자/일시/내용/FK를 보존하고 contact_method(phone/visit/email/message/other, 기본 other)를 추가한다.
`customer_property_links`는 상담의 사무소·고객·매물 ID를 DISTINCT로 조회하는 **security_invoker 뷰**이며 호출자 RLS를 적용한다. 계약·매칭 테이블의 데이터나 구조는 변경하지 않는다.

## 권한과 보관

- 비로그인·미등록·비활성 직원은 고객 API/화면 접근 불가.
- 같은 사무소 직원은 고객 연락처와 상담을 조회한다. 다른 사무소는 ID로 직접 요청해도 404/빈 결과.
- 담당 직원은 자기 고객 수정·보관·상담 기록. 대표·관리자는 사무소 전체에 가능.
- 일반 직원 등록은 자기 담당 자동 지정. 대표·관리자는 활성 직원으로 지정·변경 가능.
- DB에서도 office_id/id 변경, 다른 사무소·비활성 직원 지정, 일반 직원의 담당자 변경을 차단.
- 신규 상담은 기존 작성자 권한에 더해 고객 담당 권한도 필요하다. 상담 작성자와 고객 담당자는 별도로 보존한다. 담당자가 바뀌어도 이전 상담이 사라지거나 작성자가 바뀌지 않는다.
- 변경 API는 동일 출처 Origin, 엄격한 입력 검증, 사용자 세션을 사용한다. 일반 고객 업무에 service_role을 쓰지 않는다.
- 고객 하드 삭제와 상담 삭제는 authenticated에서 철회한다. 고객 보관은 deleted_at만 기록하며 상담·매칭·계약 FK를 유지한다. 보관 이후 활성 API/상담 추가·수정·복원은 차단한다.
- 같은 사무소의 DB 감사용 SELECT에는 보관된 행이 남는다. 보관 고객 조회 UI와 복원 UI는 아직 제공하지 않는다.
- 단일 최신 연락 동의 상태·기록시각·근거 메모를 관리한다. 동의 증빙 파일이나 별도의 변경 감사 원장은 이번 범위가 아니다.

중복 경고는 같은 사무소의 이름·법인명·정규화한 전화번호·이메일 기준이다. 동명이인·공동 연락처가 있어 강제 UNIQUE는 적용하지 않고 확인 후 별도 등록할 수 있다. 국가번호 변환이나 외부 고객 식별 연동은 없다. 수정 시 식별·연락처가 바뀌지 않으면 이미 존재하는 중복에 대한 재확인을 반복하지 않는다.

## API

- GET/POST /api/customers
- GET/PATCH/DELETE /api/customers/[id] (PATCH는 customer + version, DELETE는 version)
- GET /api/customers/duplicates?name=…&company_name=…&phone=…&email=…&exclude=…
- GET/POST /api/customers/[id]/consultations

조회 응답은 private/no-store. 중복 응답에는 후보 ID·이름·법인명만 반환한다. 고객 목록 API도 화면과 같은 필터·페이지를 사용한다. 상담 GET API는 최신 100건을 제공하며 상세 화면은 별도 페이지로 과거 전체 이력을 탐색한다.

## 실행 및 검증

기존 서버를 종료하고 최신 소스를 받은 프로젝트 폴더의 Git Bash에서:

```bash
npm ci
bash scripts/start-local.sh
npm run dev
```

기존 Docker 볼륨을 삭제하거나 DB reset을 실행하지 않는다. start-local은 미적용 006만 추가 적용한다. 표준 Supabase CLI 구성에서는 `npx supabase migration up --local`로 미적용 로컬 마이그레이션을 적용한다.

로컬 가상 계정으로 `npm run test:customers`, 브라우저 설치 후 `npm run test:customer-ui` 실행. 기존 DB 권한·로그인·초대·매물·사진 회귀와 `test:property-migration`의 별도 DB 보존 검사도 수행한다. 실제 고객 개인정보·외부 연동·클라우드 배포·유료 서비스는 사용하지 않는다.
