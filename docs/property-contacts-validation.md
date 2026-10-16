# 015 — 매물 관련 고객과 직원 표시 이름

2026-10-16 로컬 Docker Supabase와 Next.js production 서버에서 합성 데이터만 사용했다. 실제 고객 전송·배포는 수행하지 않았다.

## DB 변경

- customers.phone2: 선택 전화번호. 이름은 빈 문자열을 허용하되 이름이 없으면 최소 7자리 전화번호가 있어야 한다. 기존 고객 데이터와 ID는 수정하지 않는다.
- property_contacts: office_id, property_id, customer_id, access_code, version, created_at, updated_at. 동일 사무소 복합 FK, 매물·고객 연결 UNIQUE, 고객 역조회 인덱스, RLS, 수정시각·버전 트리거.
- save_property_contact: security invoker. 매물 수정 권한과 고객 RLS를 사용하고 고객 생성·연결 또는 두 레코드 수정을 하나의 트랜잭션으로 처리한다. 두 버전이 일치해야 수정한다.
- customer_property_links 및 property_related_customers는 신규 연결도 포함한다. 과거 상담·계약 연결을 보존한다.
- staff는 authenticated에 display_name 컬럼 수정만 허용한다. 같은 사무소 대표·관리자 정책을 추가하며 role, office_id, user_id, active 수정 권한은 추가하지 않는다. 화면/API는 updated_at으로 충돌을 검사한다.
- 공개 업무 테이블 총 26개 모두 RLS 적용. 비인증 사용자는 관련 연락처·출입 비밀번호를 읽을 수 없다. 같은 사무소 직원의 읽기 범위는 기존 정책을 유지한다.

## 검증 결과

- 관련 고객·직원 API/직접 REST 권한 검사: 19개 통과. 전화번호 필수, 다른 사무소 조회·연결 차단, 타 담당자 수정 차단, 관리자 수정, office_id 주입 차단, 두 레코드 동시 수정 충돌, 고객을 보존하는 연결 해제, 직원 이름 수정과 역할·소속 변경 차단.
- 실제 Chromium PC/390px 모바일 화면: 7개 통과. 새 브랜드·문서 제목, 이름 없는 고객 등록, 두 전화번호와 비밀번호 표시, 인라인 수정, 고객 상세 관련 매물, 모바일 오버플로 검사, 직원 권한별 화면 및 대표의 이름 저장. `docs/screenshots/property-contacts-mobile.png`에 가상 정보 화면을 저장했다.
- 기존 고객 API/RLS: 71개 통과. 이름 필수였던 검증은 이름·전화번호 모두 없는 입력을 거부하도록 변경하고 전화번호만 있는 고객 검증을 추가했다.
- 기존 매물 CRUD/보안: 87개 통과.
- 기존 로그인·직원 소속·Storage 접근 통합 검사: 36개 통과. 위 API·브라우저·회귀 검사 합계 220개이며, 마이그레이션 검증은 별도다.
- 추가 마이그레이션 리허설: 별도 일회용 DB에서 기존 매물·고객·상담·계약·매칭 값과 이력을 보존하는 업그레이드 및 전체 공개 테이블 RLS 회귀 검증 통과.
- TypeScript, ESLint, production build 통과.

## 적용

최신 코드로 교체하되 두 환경 설정 파일과 Docker 볼륨을 보존한다. `bash scripts/start-local.sh`가 미적용 015를 적용한 후 Next.js 서버를 재시작한다. 기존 DB를 reset하지 않는다. 출입 비밀번호는 해당 매물과 고객 연결의 메모이며 로그인 인증정보로 사용하지 않는다. 등록한 고객을 계약 당사자로 연결할 때 확인된 실명 등 필요한 정보를 보완할 수 있다.
