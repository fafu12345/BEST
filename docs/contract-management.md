# 4단계 — 매물별 계약관리

## 사용 흐름

1. 로그인하고 **매물 상세 → 계약 등록**으로 진입한다. 대시보드·상단의 계약관리 메뉴는 사무소 계약 목록이다.
2. 매매/전세/월세, 상태, 계약일·잔금일·입주일·임대차 기간과 체결 금액을 입력한다. 금액은 만 원으로 입력하고 DB에는 원 단위로 저장한다.
3. 고객을 이름·법인명·전화번호로 검색하고 역할을 골라 추가한다. 계약 화면에서 신규 개인·법인 고객을 등록해 바로 당사자로 추가할 수도 있다. 신규 고객은 별도로 저장되므로 계약 저장 취소/실패 시에도 고객 자료는 유지된다.
4. 작성 중·취소 외 상태에는 매매의 매도인/매수인, 임대차의 임대인/임차인이 필요하다. 공동 당사자 여러 명과 기타 역할을 지원한다. 같은 사람이 양쪽 역할을 맡는 입력은 차단한다.
5. 계약을 저장하면 매물 상세와 모든 당사자의 고객 상세에 계약이 표시된다. 고객은 다른 계약에서 다른 역할을 가질 수 있다. 고객 자체에 역할을 고정하지 않는다.
6. 상세에서 PDF/이미지 계약서와 관련 서류를 올린다. 원본은 덮어쓰거나 지울 수 없고 정정본은 이전 파일을 선택해 새 파일로 추가한다.
7. 계약 수정에서 금액·기간·당사자·메모·상태를 관리한다. 대표·관리자는 담당 직원을 변경할 수 있다. 상태와 담당자 변경, 당사자 추가/제외, 서류 추가·다운로드 접근 승인은 기록된다.

계약과 매물·고객의 목록은 PC 표/모바일 카드다. 계약 목록은 20건씩 조회하며 계약번호·매물명·현재 고객명·체결 당시 고객명, 거래 유형·상태·담당자·계약일 범위·매물·고객으로 검색한다. 선택 목록은 최근 매물·고객 각 200건이고, 검색 텍스트와 각 상세의 계약 조회는 전체 계약을 대상으로 한다. 매물·고객 상세에는 최근 계약 20건과 전체 목록 링크를 제공한다.

## 체결·종료·중복 기간

상태는 draft(작성 중), signed(체결), active(진행 중), completed(정상 종료), terminated(중도 종료), cancelled(취소)로 구분한다. 종료·취소가 행 삭제를 의미하지 않는다. 계약 하드 삭제는 직원에게 허용하지 않으며 삭제 UI는 제공하지 않는다.

체결/진행 상태의 계약, 또는 정상·중도 종료·취소로 변경한 계약에는 매물 상태 검토 표시를 남긴다. 임대차 종료일이 지났는데 여전히 체결/진행인 계약도 검토 대상으로 표시한다. 계약 수정에서 실제 매물 상태를 확인해 거래 가능/계약 진행/거래 완료/보류를 명시적으로 선택한다. 계약과 매물 모두 수정 가능한 직원 또는 대표·관리자만 함께 변경할 수 있다. 매물 버전이 바뀌었거나 권한이 없으면 계약 저장도 롤백한다. 종료만으로 매물을 자동 재등록하지 않는다.

signed/active 계약의 기간이 겹치면 UI가 후보를 표시한다. 5자 이상의 예외 사유를 남기면 공동 임대 등의 합법적인 예외를 저장할 수 있다. 사유는 법률 검증을 대체하지 않으며 업무상의 확인 기록이다. DB도 같은 검사를 하고 매물별 트랜잭션 잠금으로 동시 생성 경쟁을 제어한다. 시작/종료일이 없는 기존 계약은 미확정 범위로 경고한다.

임대차 구간은 [시작일, 종료일)로 계산하므로 종료일에 이어지는 갱신은 중복으로 보지 않는다. 매매 잔금일은 해당 날짜를 포함해 계산하여 당일 계약/당일 잔금의 중복도 경고한다. 이전 계약은 같은 매물·사무소의 기존 계약으로 연결하며 자기 참조·순환 연결을 차단한다. 매물과 갱신 원본 연결은 저장 후 변경하지 않는다.

## DB 마이그레이션

기존 001~007은 수정하지 않는다. 기존 contracts를 확장하는 008과 문서 보안 정책 009를 순서대로 적용한다. 기존 업무 테이블 14개에서 3개가 추가되어 17개이며 모두 RLS다.

### contracts 재사용

- 기존 id/office_id/property_id/assigned_staff_id/contract_number/customer_id/amount/signed_at/notes/created_at/updated_at 유지. assigned_staff_id를 요청한 assigned_to로 사용하며 중복 담당자 컬럼을 만들지 않는다.
- contract_type(sale/jeonse/monthly_rent), contract_date, occupancy_start_date, lease_start_date, lease_end_date, closing_date 추가.
- sale_price_krw/deposit_krw/rent_krw/maintenance_fee_krw/brokerage_fee_krw: 원 단위 numeric(16,0), 음수·범위 CHECK. 새 계약에는 모든 금액을 명시하며 해당 없는 값은 0이다.
- previous_contract_id: (office_id,property_id,previous_contract_id) 복합 FK. 같은 사무소·매물 연결만 허용하며 원본 변경·순환 연결 금지.
- overlap_override_reason, property_review_required, deleted_at, version 추가. version은 DB가 증가시켜 동시 수정 덮어쓰기를 막는다.
- 날짜 순서, 계약번호의 사무소별 UNIQUE, 활성 담당자, 업무 FK/인덱스/기존 updated_at 트리거를 유지·확장한다.

과거 계약의 유형·역할·개별 금액은 현재 매물의 값으로 추정하지 않는다. 기존 amount/signed_at/customer_id는 그대로 남는다. 화면은 미확인 자료로 표시하고 기존 금액·알려진 계약일·기존 고객 계약 조회를 지원한다. 수정할 때 확인해 유형·당사자·금액을 보완한다. 신규 계약은 buyer/tenant를 우선해 기존 customer_id 대표 연결도 저장하여 구 구조와의 호환을 유지한다. 모든 당사자는 별도 연결 테이블에서 조회한다.

### contract_parties

id, office_id, contract_id, customer_id, role(landlord/tenant/seller/buyer/other), created_at 및 name_snapshot/company_name_snapshot. 고객·계약은 office_id 복합 FK이며 동일 계약·고객·역할 UNIQUE. 체결 당시 이름은 고객 이름 변경 뒤에도 보존한다. 새 연결은 활성 고객만 허용하고 이미 연결된 고객이 보관되더라도 해당 계약을 수정할 때 기존 연결·이름을 보존한다. 당사자 변경도 계약 버전을 증가시킨다.

### contract_events

id, office_id, contract_id, event_type, event_date(timestamptz), description, actor_id(직원 ID), created_at, old_values/new_values(jsonb). 역할·금액·기간·담당자·상태·메모 변경과 서류 이력을 기록한다. 직원에게 SELECT만 허용하고 생성/수정/삭제를 금지한다. 파생 감사 INSERT만 좁은 SECURITY DEFINER 트리거/Storage 접근 함수가 수행하며 실제 업무 변경은 사용자 RLS로 실행한다. 화면은 최신순 20건씩 과거 전체를 조회한다.

### contract_documents

id, office_id, contract_id, storage_path, document_type, uploaded_by(직원 ID), created_at 외 original_name/mime_type/byte_size/sha256/previous_document_id. 이전 파일도 같은 계약·사무소여야 한다. DB가 업로더와 실제 Storage 소유자·크기·형식을 검증한다. 메타데이터 UPDATE/DELETE는 직원에게 허용하지 않는다. 정정본도 원본 파일을 참조하는 새 행이다.

contract_directory는 **security_invoker 뷰**로 원래 계약·매물·고객·당사자의 RLS를 그대로 적용한다. 다수 계약의 고객 연결을 UUID 배열로 검색해 중간 ID 목록의 행 제한에 의한 누락을 피한다. 기존 signed_at은 effective_contract_date로 조회해 날짜 검색을 지원한다. 조회 응답은 private/no-store다.

## 문서 보호와 접근 기록

- contract-documents 비공개 버킷, 최대 10MiB, PDF/JPEG/PNG/WebP. 내용의 실제 헤더와 MIME을 검사한다. 불필요한 고유식별정보는 수집하지 않는다.
- 경로는 `<office>/<contract>/<random UUID>.<extension>`. 일반 업무 API·Storage는 직원 세션을 사용하며 service_role로 우회하지 않는다.
- 원본 Storage UPDATE·덮어쓰기·이동·삭제는 금지한다. 업로드 후 등록하지 못한 파일만 업로더가 자기 권한으로 정리할 수 있다. 계약 담당자가 도중에 변경되면 이 정리가 막힐 수 있으며, 미등록 파일은 다운로드할 수 없다.
- Storage의 SELECT 정책은 `storage.operation()`이 인증 다운로드인 경우에만 등록된 계약 서류를 열고 **같은 트랜잭션에서 접근 이벤트를 먼저 INSERT**한다. 앱 경로를 우회해 Storage로 직접 다운로드해도 기록된다. 기록 저장 실패 시 읽기 권한 검사가 실패한다.
- 읽기·업로드 서명 URL·공개 URL·이미지 변환·파일 목록 경로를 통한 우회는 허용하지 않는다. Storage INSERT는 일반 인증 업로드 작업에만 허용한다. Storage v1.82.1의 operation 컨텍스트에서 실제 검증했다.
- 다운로드 API는 SHA-256을 재계산해 저장된 값과 비교하고 attachment/private/no-store/nosniff/sandbox 헤더로 전달한다.
- 기록은 **다운로드 접근 승인**이며 실제 사용자 기기에 저장이 완료됐다는 증명은 아니다. Storage 정책 평가에 따라 한 요청에 여러 접근 기록이 남을 수 있다. 다운로드 후 상세의 기록 새로고침 버튼으로 확인할 수 있다.
- 같은 사무소 활성 직원은 읽고, 계약 담당자·대표·관리자만 새 서류를 추가한다. 다른 사무소·비로그인·미등록·비활성 직원은 차단한다. DB 소유자/service_role 같은 운영 권한은 별도 신뢰 영역이며 앱 클라이언트에 키를 노출하지 않는다.
- 매물을 소프트 삭제해도 종료·과거 계약과 계약 서류는 계약 화면에서 유지한다. 기존 매물 사진의 삭제 후 접근 차단은 바꾸지 않는다. 고객이 보관되어도 체결 당시 당사자 이름은 계약에 남는다.

## API·파일 구조

```text
src/app/dashboard/contracts/{page,new,[id],[id]/edit}
src/app/api/contracts/{route,[id]/route,overlaps/route}
src/app/api/contracts/[id]/documents/{route,[documentId]/route}
src/components/contracts/{contract-form,contract-links,contract-documents}.tsx
src/lib/contracts/{shared,server,list}.ts
supabase/migrations/202610150008_contract_management.sql
supabase/migrations/202610150009_contract_documents.sql
scripts/test-contracts.mjs
scripts/test-contract-ui.mjs
```

POST /api/contracts, PATCH /api/contracts/[id]는 contract, parties, version, property_status, property_version을 받는다. 신규 version은 null이다. 계약·당사자·선택적 매물 상태 변경은 SECURITY INVOKER save_contract RPC에서 하나의 트랜잭션이다. 잘못된 FK·역할·중복 기간·버전·매물 수정 권한이 있으면 부분 저장하지 않는다.

GET /api/contracts는 목록 검색, GET /api/contracts/[id]는 계약/당사자, GET /api/contracts/overlaps는 중복 후보다. POST 문서 경로는 multipart 업로드, GET 문서 ID 경로는 감사되는 다운로드다. 개인정보 처리 기록 화면은 다시 추가하지 않았다.

## 기존 환경 업데이트

기존 서버를 종료하고 최신 소스를 받은 프로젝트 폴더의 Git Bash에서:

```bash
npm ci
bash scripts/start-local.sh
npm run dev
```

미적용 008·009만 추가 적용하고 기존 볼륨·데이터를 보존한다. DB reset이나 Docker 볼륨 삭제는 필요하지 않다. .env.example의 기존 Auth/Storage 설정을 그대로 사용하며 새 유료 서비스나 비밀 키는 필요하지 않다. 원격 DB 적용·클라우드 배포는 하지 않았다.

테스트는 모두 가상 데이터다. `test:contracts`와 `test:contract-ui`, 기존 Auth/직원 초대/Storage·매물·고객 회귀 및 별도 DB 마이그레이션 검사를 수행한다. exact seed 개수를 검사하는 test:integration은 다른 fixture 생성 테스트와 동시에 실행하지 않는다. 브라우저 실행 방법과 실제 결과는 validation.md를 참조한다.

### 계약 표시 변경 (010)

계약번호 입력과 주요 화면의 계약번호 표시를 제거했습니다. 목록·상세·고객/매물의 관련 계약·갱신 원본·기간 중복 경고는
단지명/건물명(없으면 매물명), 동·호실로 표시합니다. 갱신 원본과 중복 경고에는 계약일·상태도 함께 표시합니다.
기존 `contract_number` 필드와 API 호환성은 보존하고 신규 계약은 내부 번호를 자동 생성합니다.
`contract_directory`는 기존 컬럼을 유지한 SECURITY INVOKER 뷰로 갱신하며 동·호실 검색도 지원합니다.
기존 데이터와 RLS는 유지합니다. 로컬 적용: `bash scripts/start-local.sh` 후 앱을 다시 실행합니다.
