# EstateMatch v2.0 전환 분석 및 개발 계획

> 후속 반영: 3단계 고객관리는 [고객관리 안내](customer-management.md)에 따라 구현했습니다. 이 문서의 초기 계약/당사자/업무 마이그레이션 번호 계획은 아래 수정 순서를 따릅니다. 006은 고객관리 확장으로 사용했고, 계약 확장·당사자·후속 업무는 007 이후에 진행합니다. 계약 연결은 다음 단계이며 기존 계약 데이터는 유지됩니다.

확인 기준: 2026-10-15, 기존 001~004 마이그레이션 및 현재 `src` 구현.
목표: 매물·계약·당사자·만기·재계약·이전 고객을 계속 관리하는 사무소 업무 시스템.
자동 매칭은 핵심 기능에서 제외한다. 기존 DB, API, RLS와 업무 데이터는 유지한다.

## 현재 구현과 재사용 범위

- Next.js App Router / TypeScript / Tailwind, Supabase Auth/PostgreSQL/비공개 Storage.
- 로그인, 서버 승인 직원 초대, owner/manager/agent 권한, 비활성 직원 차단.
- office_id로 격리한 14개 공개 업무 테이블과 RLS. 담당자 수정, 대표·관리자 사무소 전체 수정.
- 매물 등록·상세·수정·검색·소프트 삭제, 건물·단지 선택, 유형별 정보, 담당자 변경.
- 사진·도면 접근 보호, 가격·상태 변경 이력, 버전 충돌 검사.
- customers/contracts/tasks/appointments/consultations는 DB와 권한 테스트가 있지만 전용 업무 화면/API는 아직 없다.
- contracts.property_id에는 유일 제약이 없어 이미 매물 1:N 계약을 허용한다.
- contracts.customer_id는 한 명만 가리키므로 다수 당사자·역할을 표현하지 못한다.
- matches/customer_requirements는 스키마·샘플·테스트에 존재하고 현재 src에는 화면·API·자동 매칭 엔진이 없다. 비활성화할 메뉴가 없으며 데이터를 삭제하지 않는다.
- 이 클라우드 로컬 DB의 읽기 전용 확인: properties/customers/contracts/matches 각 3건. 사용자 PC DB를 확인하거나 변경한 결과는 아니다.

## 이번 매물 화면 수정

005 추가 마이그레이션으로 properties에 다음을 추가한다.

| 필드 | 저장 형식 | 기존 행 |
| --- | --- | --- |
| bathroom_count | nullable integer, 0~100 | NULL(미입력) |
| desired_transaction_date | nullable date | NULL(미정) |
| desired_transaction_note | text, 최대 500자 | 빈 문자열 |

아파트·오피스텔은 방 수 옆에 화장실 수를 표시하고 주소 입력란을 제거한다. 기존 주소는 수정 화면에서도 보존하며 기존 API의 주소 필드는 유지한다. 상가·사무실은 주소 입력을 유지한다.
매매·전세·월세 모두 거래 희망 날짜와 일정 메모를 표시한다. 희망 일정은 계약의 확정 잔금일과 구분한다.
아파트·오피스텔 중복 경고는 같은 건물 ID·동·호실 기준이며, 호실이 없으면 식별 가능한 중복 검사를 생략한다. 상가·사무실은 기존 주소·층 기준이다. 강제 중복 금지 제약은 추가하지 않는다.
신규 필드는 API에서 선택 사항이므로 이전 클라이언트의 요청을 계속 받는다. 기존 데이터를 임의의 날짜나 화장실 수로 채우지 않는다.

## 3단계 개발 범위와 화면

순서: 고객관리(3단계 완료, 계약 연결 제외) → 계약 등록/조회/수정 → 매물별 계약 이력 → 만기·잔금 목록 → 후속 업무.

| 메뉴 | 화면 및 동작 |
| --- | --- |
| 홈 | 예정 잔금·만기·미완료 업무 요약, 기존 직원 초대 유지 |
| 매물 | 기존 화면 유지, 상세에 현재·과거 계약 탭 추가 |
| 계약 | 매물 연결, 거래 방식, 금액, 기간, 잔금일, 다수 당사자, 담당자, 계약 상태 및 변경 이력 |
| 고객·당사자 | 기존 customers 기반 등록·수정·검색, 과거 계약·상담 이력, 비활성 고객 보존 |
| 만기·잔금 | 날짜 범위·담당자별 조회, 날짜 미입력 계약 별도 표시 |
| 후속 업무 | 갱신·재계약·퇴거·이전 업무, 담당자·기한·진행 상태 및 이전/후속 계약 연결 |

미구현 메뉴를 작동하는 기능처럼 먼저 노출하지 않는다. 기존 로그인·매물 URL과 API 응답의 기존 필드를 유지한다.

## 추가 테이블 제안

### contract_parties

id, office_id, contract_id, customer_id, role(landlord/tenant/seller/buyer), name_snapshot, created_at, updated_at.
계약·고객은 각각 (office_id,id) 복합 FK. (office_id,contract_id,customer_id,role) UNIQUE로 중복 연결 방지. 공동 소유자 등 동일 역할의 여러 명 허용.
고객 이름 수정 후에도 과거 계약 표시를 보존할 이름 스냅샷. 연락처 등 개인정보 스냅샷은 필요성과 보존 정책을 확인하기 전 수집하지 않는다.

### contract_events

id, office_id, contract_id, actor_staff_id, event, old_values(jsonb), new_values(jsonb), created_at.
계약 변경의 서버/DB 파생 감사 기록. 같은 사무소 SELECT, 일반 클라이언트 INSERT/UPDATE/DELETE 금지. 당사자 변경도 기록하며 날짜·금액·상태 변경을 추적한다.

후속 업무는 기존 tasks를 재사용하므로 별도 비슷한 테이블을 중복 생성하지 않는다.

## 추가 마이그레이션 계획

1. **005 (이번 적용):** 매물 화장실 수·거래 희망 일정만 추가. 기존 정책·주소·금액·계약 행 무변경.
2. **007 (다음 단계 예정):** contracts에 transaction_type, deposit, monthly_rent, starts_on, ends_on, balance_due_on, previous_contract_id, version 추가. 기존 signed_at/amount/customer_id/contract_number 유지. 기존 상태 draft/signed/cancelled 유지하면서 종료 상태 추가. 날짜 순서·비음수 금액 CHECK, office/date 및 office/assignee 인덱스.
3. **008 (다음 단계 예정):** contract_parties와 contract_events 및 복합 FK·UNIQUE·RLS·updated_at/감사 트리거. 이전 계약 연결은 같은 사무소로 제한하고 자기 참조·순환 연결 방지. 계약과 당사자 저장은 SECURITY INVOKER 트랜잭션으로 원자 처리한다.
4. **009 (후속 단계 예정):** tasks에 contract_id, followup_type(renewal/recontract/moveout/relocation/other), result_contract_id, version 추가. 기존 property_id/customer_id/due_at/status/담당자 보존. 이전 업무는 other로 호환한다.

기존 계약 금액만으로 보증금·월세를 추정하지 않는다. 거래 유형도 현재 매물의 유형을 과거 계약에 무조건 대입하지 않는다. 미확인 값은 nullable로 남기고 화면에서 보완 대상으로 표시한다. 기존 customer_id를 보존하되 임대인/임차인 등의 역할을 임의로 지정하지 않는다.
신규 계약에서는 buyer/tenant를 기존 customer_id 대표 연결에 기록하여 구 API와의 호환을 유지한다. 공동 당사자는 contract_parties에 모두 기록한다.
당사자 전체 역할 검증은 거래 유형에 맞게 수행하되, 아직 보완하지 않은 기존 계약의 단순 조회·일반 메모 수정을 막지 않는다.
종료는 행 삭제가 아니라 상태 전환이다. 계약과 고객에 대한 기존 직접 DELETE 권한/FK 영향을 점검하고 보존 정책을 강화한다. 계약 이력이 있는 매물은 소프트 삭제 후에도 계약 화면에서 과거 정보를 볼 수 있도록 보관 조회를 별도 설계한다. 기존 공개 매물·파일 경로의 삭제 후 접근 차단은 유지한다.

## 권한 및 검증 계획

모든 신규 테이블에 office_id, 같은 사무소 SELECT와 계약 담당자/대표·관리자에 따른 변경 정책을 적용한다. 당사자 편집 권한은 연결 계약으로부터 판단한다. office_id·담당자 위조 및 사무소 간 계약/고객/이전 계약 연결을 DB에서 차단한다. 일반 업무 API에 service_role을 사용하지 않는다.

- 대표·관리자·직원 2명 및 두 번째 사무소 계정으로 실제 CRUD/RLS 검사.
- 동일 매물에 다수 계약, 다수 당사자, 고객 이름 변경 뒤 계약 이름 보존.
- 기존 단일 고객 계약 호환, 날짜 미입력 계약 표시, 계약 종료 후 이력 유지.
- 원자 저장 실패 시 부분 계약·당사자 생성 방지, 동시 수정 충돌.
- 만기/잔금 날짜 경계, 갱신·이전 연결, 과거 계약과 후속 업무 보존.
- 기존 로그인·초대·매물·파일 회귀 테스트, 빈 DB 전체 적용 및 기존 DB 업그레이드 보존 검사.

## 영향과 현재 완료 범위

전체 재생성·테이블 삭제·기존 마이그레이션 수정은 하지 않는다. 매칭 테이블 및 기존 RLS는 유지한다. 매물 입력 개선과 전환 분석에 이어 고객관리 006 구현을 완료했다. 007~009 및 계약 업무 화면은 계획 상태다. 외부 알림·메일·자동 연동과 실제 개인정보는 사용하지 않으며 클라우드 배포나 유료 서비스는 생성하지 않는다.
