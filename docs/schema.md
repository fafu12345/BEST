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
