# EstateMatch 12개 테이블 초안

이 대화의 요구사항에서 도출한 신규 초안입니다. 기존 확정 명세를 복원한 것이 아닙니다. SQL이 정확한 필드·타입·제약조건의 기준입니다.

- `offices`
- `staff`
- `staff_invitations`
- `properties`
- `customers`
- `property_images`
- `customer_requirements`
- `matches`
- `appointments`
- `consultations`
- `contracts`
- `tasks`

모든 업무 테이블은 office_id, 담당자, 생성/수정 시각을 포함합니다. 사진과 희망 조건은 부모 담당자와 일치해야 합니다. 대표·관리자가 부모 담당자를 변경하면 사진·희망 조건의 담당자도 복합 FK를 통해 갱신됩니다. 직원은 사무소당 한 곳만 소속됩니다. 최초 대표는 신뢰하는 서버/DB 운영자가 등록합니다.

| 테이블 | 고유 필드 (공통 필드 제외) |
| --- | --- |
| offices | name |
| staff | user_id, display_name, role, active |
| staff_invitations | email, role, token_hash, invited_by, approved_by, approved_at, expires_at, accepted_at |
| properties | title, address, property_type, transaction_type, price, deposit, area_m2, status, description |
| customers | name, phone, email, status, notes |
| property_images | property_id, storage_path, caption, sort_order |
| customer_requirements | customer_id, transaction_type, preferred_area, min_price, max_price, min_area_m2, notes |
| matches | property_id, customer_id, score, status, notes |
| appointments | property_id, customer_id, title, starts_at, ends_at, status, notes |
| consultations | customer_id, property_id, consulted_at, summary |
| contracts | property_id, customer_id, contract_number, amount, signed_at, status, notes |
| tasks | customer_id, property_id, title, due_at, status, notes |

1단계 기본 테이블 공통: 모든 테이블은 UUID id, created_at, updated_at을 갖습니다. offices 외에는 office_id가 있고, 직원·초대 외의 업무 테이블에는 assigned_staff_id가 있습니다. 금액은 원 단위 numeric(16,0), 면적은 제곱미터 numeric(12,2), 날짜 시각은 timestamptz입니다. 계약일만 date입니다. 선택/필수 및 열거 값의 전체 정의는 마이그레이션 SQL을 참고하세요.

## 2단계 확장

기본 12개 테이블과 데이터를 유지하고 매물 변경 이력과 유형별 건물·단지 보기 테이블 2개를 추가했습니다. 현재 업무 테이블은 14개입니다. 전체 필드·권한·소프트 삭제 정책은 [2단계 명세](property-management.md)를 참고하세요.

## 005 매물 입력 확장

`properties.bathroom_count`는 nullable integer(0~100), `desired_transaction_date`는 nullable date, `desired_transaction_note`는 최대 500자 text(기본 빈 문자열)입니다. 기존 행의 날짜·화장실 수는 미입력 상태로 보존합니다. 기존 주소 컬럼과 RLS는 유지하며 아파트·오피스텔 화면에서 주소 입력만 생략합니다. 희망 일정은 확정 계약의 만기·잔금일과 별도입니다. v2.0 계약 구조는 [전환 분석서](v2-development-plan.md)의 3단계 계획을 참조하세요.

## 006 고객관리 확장

기존 customers의 id/office_id/assigned_staff_id와 연락처·상태·메모를 유지합니다. 개인·법인 구분, 법인명, 연락 동의 및 기록시각, 다음 연락일, 개인정보 처리 근거·목적·기한, 소프트 보관·버전과 검색용 생성 컬럼을 추가합니다. consultations는 contact_method를 추가하고 기존 FK·상담 내용을 보존합니다. 고객 역할을 고정하지 않으며 계약 연결은 다음 단계입니다. 상세 필드·인덱스·보관·RLS와 security_invoker 파생 뷰는 [고객관리 DB 안내](customer-management.md)를 참조하세요. 공개 업무 테이블 수는 14개로 동일하며 파생 뷰 1개가 추가됩니다.

## 007 변경 이력 삭제

기존 업무 테이블·데이터를 유지한다. property_change_history에 authenticated DELETE와 같은 사무소의 활성 매물 담당자/대표/관리자만 삭제할 수 있는 RLS를 추가한다. INSERT/UPDATE 권한은 계속 금지하며 이후 실제 변경은 기존 트리거로 기록된다. 고객 개인정보 처리 컬럼은 기존 값 보존·구 API 호환을 위해 유지하되 현재 화면·필수 입력·표시에서는 제거했다.

## 008~009 매물별 계약관리

기존 contracts를 재사용하며 과거 amount/signed_at/customer_id와 ID·담당자를 보존한다. 신규 계약의 체결 금액, 일정, 6개 상태, 이전 계약 연결, 버전과 매물 상태 검토를 확장했다. contract_parties/contract_events/contract_documents 3개 테이블이 추가되어 현재 공개 업무 테이블은 17개이며 모두 RLS다. contract_directory는 호출자 권한으로 검색·고객 연결·과거 날짜를 조회하는 security_invoker 뷰다.

정확한 필드·제약·권한·원자 저장·서류 감사 정책은 [4단계 계약관리 안내](contract-management.md)를 참조한다. 기존 001~007 마이그레이션은 변경하지 않는다. 계약 금액·당사자 역할을 현재 매물·고객 정보에서 소급 추정하지 않는다. 비공개 contract-documents 버킷은 인증 다운로드마다 DB 접근 승인을 기록하며 원본 덮어쓰기·삭제·서명 URL을 차단한다.

## 5단계 추가 (011)

기존 contracts와 contract_events를 유지하고 contract_followups, expiration_tasks,
contract_renewals, relocation_cases 4개를 더해 공개 업무 테이블은 총 21개입니다.
계약 기간·상태·담당자 변경 시 미완료 만기 업무를 동기화하고 완료/연락/갱신 이력은 유지합니다.
모든 새 테이블은 office_id 복합 FK, RLS, 인덱스와 불변/버전/담당자 검증을 포함합니다.
expiration_directory는 호출자 RLS를 적용하는 SECURITY INVOKER 뷰입니다.
정확한 필드는 011 SQL, 흐름과 제약은 [5단계 안내](expiration-management.md)를 참고하세요.
