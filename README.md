# EstateMatch

공인중개사무소별 데이터 격리·직원 권한과 매물·고객·계약·만기·갱신·이전관리, 통합 업무 대시보드, 7단계 앱 알림·통계·감사·암호화 백업 도구를 구현한 프로젝트입니다. Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage를 사용합니다. 외부 이메일·매물 연동이나 실제 개인정보, 유료 서비스는 사용하지 않습니다.

## 실행

Node.js 24, npm 11, Docker가 필요합니다. 이 환경은 이미 격리된 작업 공간이므로 `/workspace/BEST`의 기존 체크아웃을 사용하고 별도 worktree를 만들지 않습니다.

```bash
npm ci
bash scripts/start-local.sh
npm run dev
```

`start-local.sh`는 경량 PostgreSQL 17과 실제 Supabase Auth·PostgREST·Storage·Kong 컨테이너를 시작하고 마이그레이션과 가상 seed를 적용합니다. 외부 서비스 생성은 없습니다. 키와 DB 비밀번호는 로컬에서 생성해 무시되는 `local/.env`, `.env.local`에만 저장하며 기존 설정은 덮어쓰지 않습니다. API 포트는 루프백에만 열립니다.

이 환경의 Docker VFS 드라이버는 이미지 계층을 중복 저장합니다. 시작 스크립트는 VFS에서만 공식 Storage 이미지를 Docker 검증 후 내려받아 한 계층의 로컬 이미지로 변환합니다(`scripts/flatten-storage.py`). 공식 원본 태그는 변환 중 저장한 아카이브에서 내용을 보존한 뒤 제거해 공간을 확보합니다. 일반 overlay 드라이버에서는 공식 이미지를 그대로 사용합니다. 디스크가 제한된 환경에서 전체 Supabase CLI DB 이미지는 실행되지 않아 경량 구성을 기본으로 제공합니다.

표준 Supabase CLI도 `supabase/config.toml`에 구성되어 있습니다. 충분한 디스크가 있는 별도 환경에서는 `npx supabase start`와 `node scripts/local-env.mjs`를 사용할 수 있습니다. 두 구성을 같은 포트에서 동시에 실행하지 마세요. CLI 전체 구성은 이 환경에서 검증하지 못했습니다. CLI 모드의 DB 테스트는 `ESTATEMATCH_DB_CONTAINER=supabase_db_BEST npm run test:db`로 실행합니다.

`/login`에서 로그인하고 `/dashboard`에서 사무소 매물과 관리자용 초대 화면을 확인합니다. `/join`은 승인된 토큰으로 가입하는 화면입니다. 로그인 후 **매물관리 열기**에서 매물 등록·검색·수정·사진/도면·이력·소프트 삭제를 사용할 수 있습니다. 등록은 **유형 → 직접 추가한 건물·단지 보기 → 호실(상가는 상호 추가)** 순서입니다. 매매는 매매가격·보증금·월세, 전세·월세는 보증금·월세를 입력합니다. 상단 **고객관리** 또는 대시보드 **고객관리 열기**에서 개인·법인 고객, 상담·연락 이력, 다음 연락 일정을 관리합니다. 개인정보 처리 기록 입력·표시는 사용자 요청에 따라 제거했습니다. [3단계 고객관리 안내](docs/customer-management.md)를 확인하세요. [2단계 사용·업데이트 안내](docs/property-management.md)를 확인하세요.

## 통합 업무 대시보드

로그인 후 매물·계약·만기·고객의 실제 DB 수치, 오늘 연락, 담당자별 우선순위와 만기 캘린더를 확인합니다.
직원은 본인 담당, 대표·관리자는 사무소 전체가 기본이며 담당자 필터를 제공합니다.
매물 등록·수정에서 다음 재확인일을 지정하고, 매물/고객 상세에서 관련 계약·고객·이전 이력으로 이동합니다.
가짜 수치와 자동 매칭을 사용하지 않습니다. 조회 실패는 0건 대신 ‘조회 불가’로 표시합니다.
집계 기준·실행·오류 복구는 [6단계 안내](docs/dashboard.md)를 확인하세요.

## 만기·갱신·이전관리

상단 **만기관리**에서 임박·경과 미처리 계약과 직원별 업무 일정을 확인합니다.
**계약 상세 → 만기·연락·퇴거 관리**에서 연락 결과, 다음 연락, 퇴거·정산·재임대 검토를 기록하고
갱신 계약 또는 이전 희망 건을 생성합니다. 갱신 조건 비교와 차기 만기는 새 계약에서 확인합니다.
180·90·60·30일 업무는 DB 트리거로 중복 없이 생성·재계산하므로 별도 cron 설정이 필요하지 않습니다.
만기 경과만으로 계약을 종료하거나 매물을 재등록하지 않습니다. 알림은 웹앱 내부 업무 목록으로 제공합니다.
자세한 화면·스키마·실패 재처리는 [5단계 안내](docs/expiration-management.md)를 확인하세요.

## 가상 테스트 계정

모든 계정의 로컬 전용 비밀번호: `EstateMatch-Test-2026!`

| 사무소 | 계정 | 역할 |
| --- | --- | --- |
| A | owner@estatematch.test | owner |
| A | manager@estatematch.test | manager |
| A | agent1@estatematch.test | agent |
| A | agent2@estatematch.test | agent |
| B | other-owner@estatematch.test | owner |

seed는 로컬 개발 전용입니다. 실제 서비스에 적용하지 마세요. 최초 대표 계정은 신뢰하는 운영자가 서버/DB에서 부트스트랩하며 공개 가입으로 생성하지 않습니다.

## 7단계 알림·통계·운영 준비

헤더의 **알림**, **통계**, **감사기록**을 사용합니다. 계약 상세에서 실제 수납·환불을 기록하고, 이전 상세에서 다른 매물의 신규 계약을 연결합니다. 만기 상세에는 개별 계약의 법률·통지·갱신·퇴거 확인 항목을 제공합니다. [7단계 기능·집계 기준](docs/operations.md)을 확인하세요.

**최신 코드의 014 마이그레이션을 적용해야 합니다.** 신규 공개 테이블 4개에도 RLS가 적용되어 공개 업무 테이블은 총 25개입니다. 기존 데이터와 3개 직원 역할은 유지합니다. 조회 전용 직원 역할은 아직 추가하지 않았습니다.

암호화 백업·격리 복구 도구는 [백업 안내](docs/backup-recovery.md)에 있습니다. **Windows 자동 백업 작업은 직접 등록하기 전에는 동작하지 않습니다.** 외부 저장소 복사·운영 배포도 자동 수행하지 않습니다. [배포 전 체크리스트](docs/deployment-checklist.md)를 먼저 확인하세요.

가상 매물 1,000개·고객 500명·계약 1,500건·만기 업무 6,000건으로 검증했습니다. [검증 결과](docs/validation.md), [전체 시험 보고서](docs/release-test-results.json), [성능 측정](docs/performance-results.json)을 제공합니다. 테스트는 로컬 가상 환경에서 순서대로 실행하며, UI 테스트는 설치된 Playwright Chromium 또는 CHROME_EXECUTABLE_PATH가 필요합니다.

```bash
npm run build
# 다른 터미널에서 npm run start 실행 후:
npm run test:release
```

## 계약 일정 자동 반영

계약일부터 잔금일까지 매물은 **계약 진행**, 잔금일 다음 날부터 **거래 완료**로 자동 반영됩니다. 전월세는 입주일·시작일을 잔금일로 저장하고, 12·24개월 선택으로 종료일을 채운 뒤 직접 수정할 수 있습니다. **013 마이그레이션과 로컬 예약 컨테이너**를 위해 최신 코드에서 `bash scripts/start-local.sh`를 실행하세요. Docker 실행 중 1분마다 갱신합니다. [일정 규칙·예약 실행·실패 재처리](docs/contract-schedule.md)를 확인하세요.

## DB 명세와 마이그레이션

기존 12개 테이블 명세가 대화에 없어 사용자 동의에 따라 새 초안을 설계했습니다. [설계 개요](docs/schema.md)와 다음 SQL이 정확한 필드 명세입니다.

- `supabase/migrations/202610150001_estatematch.sql`: 업무 테이블 12개, FK/CHECK/UNIQUE/INDEX, updated_at, office_id 변경 방지, RLS, 서버 전용 초대 소비 함수
- `supabase/migrations/202610150002_storage.sql`: 비공개 이미지 버킷과 Storage 정책
- `supabase/migrations/202610150003_property_management.sql`: 매물 확장 필드, 이력 테이블, RLS를 유지한 소프트 삭제·파일 보호
- `supabase/migrations/202610150004_property_buildings.sql`: 사무소·유형별 건물/단지 보기, 상호·호실, 거래금액 확장과 기존 자료 호환
- `supabase/migrations/202610150008_contract_management.sql`: 기존 계약 확장, 당사자·감사·서류 테이블과 원자 저장
- `supabase/migrations/202610150009_contract_documents.sql`: 비공개 계약 서류·원본 보호·다운로드 접근 감사
- `supabase/migrations/202610150010_customer_address_contract_display.sql`: 고객 주소, 부동산명·동·호실 계약 표시
- `supabase/migrations/202610150011_expiration_management.sql`: 만기 업무·연락·퇴거·갱신·이전관리, 기존 임대차 업무 생성
- `supabase/migrations/202610160012_work_dashboard.sql`: 재확인 예정일, RLS를 적용한 실제 집계 및 상세 연결 RPC
- `supabase/migrations/202610160013_contract_property_schedule.sql`: 계약 일정에 따른 매물 상태, 전월세 시작일 통일, 비공개 예약 작업
- `supabase/migrations/202610160014_operations.sql`: 앱 알림·수납 원장·이전 계약 연결·감사·통계·개별 확인 항목·고객 버전 검사
- `supabase/seed.sql`: 가상 사무소 두 곳, 직원 5명, 업무 데이터

SQL은 Supabase의 `auth.users`, `auth.uid()`, `storage` 스키마 및 기본 역할을 전제로 합니다. 일반 빈 PostgreSQL에 바로 적용하는 SQL이 아닙니다. 로컬 시작 스크립트 또는 Supabase CLI로 실행하면 Auth/Storage 스키마 준비 후 순서대로 실행됩니다. 원격 DB 적용·배포는 수행하지 않습니다.

기본 12개 테이블에 매물 이력·건물 보기와 계약 당사자·이벤트·서류 테이블을 추가해 만기·후속 업무·갱신·이전 테이블 4개까지 더해 업무 테이블은 7단계의 알림·수납·이전 연결·감사 4개까지 총 25개입니다. 기존 contracts는 재사용합니다. 모든 업무 데이터의 FK는 office_id를 포함해 다른 사무소 데이터 연결을 차단합니다. 직원은 한 사무소에만 소속됩니다. 사무소마다 활성 대표는 최대 한 명입니다. 사진·고객 희망 조건의 담당자는 부모와 같으며 부모 담당자 변경 시 함께 갱신됩니다. 매물은 소프트 삭제만 제공하며 다른 테이블의 참조와 이력은 유지합니다. 고객은 소프트 보관하며 계약·상담을 보존합니다. 계약은 종료·취소 상태로 관리하고 하드 삭제하지 않습니다.

## 권한

| 동작 | 직원(agent) | 대표·관리자 |
| --- | --- | --- |
| 사무소 업무 자료 조회 | 자기 사무소 전체 | 자기 사무소 전체 |
| 업무 자료 생성·수정·삭제 | 자기 담당 | 자기 사무소 전체 |
| 담당자 변경 | 불가 | 가능 |
| 사무소 이름 변경 | 불가 | 가능 |
| 직원 목록 조회 | 자기 사무소 | 자기 사무소 |
| 직원 office_id·role·active 직접 수정 | 불가 | 불가 |
| 직원 초대·승인 | 불가 | 서버 API를 통해 가능 |
| 다른 사무소 접근 | 불가 | 불가 |

권한은 편집 가능한 JWT 사용자 메타데이터가 아닌 보호된 `staff` 행에서 매번 확인합니다. 비활성 직원과 미등록 계정은 업무 데이터에 접근할 수 없습니다. RLS는 API·로그인 계정을 보호하고, DB 소유자·service_role은 의도적으로 우회하므로 서버 키는 서버 모듈에서만 사용합니다. 클라이언트가 보낸 office_id·role은 초대 가입 입력에서 허용하지 않습니다.

대표·관리자가 `/dashboard`에서 이메일과 역할로 초대를 생성하면 임의 토큰은 한 번 응답으로만 전달되고 DB에는 SHA-256 해시만 저장됩니다. 별도 승인 버튼이 서버 검증 후 승인합니다. 직원은 `/join`에서 토큰·일치하는 이메일·이름·비밀번호로 가입합니다. 서버가 Auth 계정을 만들고, 서버 전용 RPC가 초대를 잠금·재검증해 직원 소속을 확정합니다. 승인·기한·이메일·승인자 활성 상태·토큰 재사용을 검사합니다. 실패하면 이번 요청에서 만든 Auth 계정만 정리합니다. 외부 메일은 보내지 않습니다. 공개 Auth 가입도 로컬 설정에서 비활성화했습니다.

API: `POST /api/staff/invitations` (`email`, `role`), `POST /api/staff/approve` (`invitationId`), `POST /api/staff/join` (`token`, `email`, `password`, `displayName`). 변경 요청에는 동일 출처 Origin이 필요합니다.

Storage는 `property-images` 비공개 버킷을 사용합니다. 경로는 `<office UUID>/<property UUID>/<filename>`입니다. 같은 사무소만 다운로드할 수 있고, 담당자 또는 대표·관리자만 업로드·수정·삭제할 수 있습니다. 사진은 JPEG/PNG/WebP, 도면은 이미지/PDF를 지원하며 10 MiB 제한입니다. 상세 화면에서 업로드·파일 삭제를 지원하고 매물 소프트 삭제 후 파일 접근을 차단합니다. 파일 작업의 동시 변경 제한은 2단계 안내에 설명했습니다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
npm run test:db
# Next 서버와 로컬 Supabase가 실행 중인 별도 터미널에서
npm run test:integration
npm run test:properties
npm run test:property-buildings
npm run test:property-migration
npm run test:customers
npm run test:contracts
# 선택: 실제 브라우저 UI 회귀 검사
npx playwright install chromium
npm run test:property-ui
npm run test:customer-ui
npm run test:contract-ui
npm run test:photo-history-ui
```

DB 테스트는 실제 PostgreSQL에서 authenticated/anon/service_role로 역할을 전환하고 JWT 사용자 식별자를 설정합니다. 각 테이블의 조회·수정 범위, 위조·권한 상승, 복합 FK, CHECK/UNIQUE, 삭제, updated_at, 비활성 직원, 초대 승인·재사용을 검사하며 모든 변경은 롤백합니다. Supabase 전용 Auth 테이블을 가짜 fixture로 대체하지 않습니다.

통합 테스트는 실제 Auth 로그인·공개 가입 차단, PostgREST 격리, 로그인 후 대시보드, Next 초대·승인·가입 API, Storage 업로드·다운로드를 검증합니다. `.env.local`의 **로컬** 주소만 허용합니다. 신규 가상 사용자·초대와 파일은 테스트 후 정리합니다.

경량 구성을 중단하려면 `docker compose --env-file local/.env -f local/compose.yml stop`을 실행합니다. 재시작은 `bash scripts/start-local.sh`입니다. 데이터는 Docker 볼륨에 보존됩니다. 표준 CLI 모드에서만 `npx supabase db reset --local`(로컬 데이터 삭제 후 재적용), `npx supabase stop`을 사용합니다. 실행 결과와 남은 제한은 `docs/validation.md`를 확인하세요.

## v2.0 전환 방향

매물·계약·당사자·만기·재계약·이전 고객을 관리하는 업무 시스템으로 전환합니다. 현재 구현 분석, 추가 테이블, 화면 메뉴와 3단계 마이그레이션 계획은 [전환 분석서](docs/v2-development-plan.md)를 참고하세요. 계약 업무 화면은 아직 구현 전이며 기존 매칭 데이터는 보존합니다.

매물 등록은 아파트·오피스텔에 방 수/화장실 수를 제공하고 주소 입력을 생략합니다. 기존 주소는 유지됩니다. 모든 거래 유형에 희망 날짜와 일정 메모를 입력할 수 있습니다. 날짜 미정이면 메모만 기록하세요. 기존 DB에는 `bash scripts/start-local.sh`로 추가 마이그레이션 005를 적용한 뒤 Next 서버를 다시 실행하세요. 데이터 초기화는 필요하지 않습니다. 추가 검사는 `npm run test:property-schedule`입니다.

## 3단계 고객관리

기존 customers/consultations를 확장한 `202610150006_customer_management.sql`을 추가했습니다. ID·담당자·매칭·계약 데이터는 보존하며 고객의 계약별 역할은 다음 단계에서 연결합니다. 사업자등록번호·주민등록번호는 수집하지 않습니다. [기능·DB·권한·실행 안내](docs/customer-management.md)와 [검증 결과](docs/validation.md)를 참고하세요.

## 사진 및 변경 이력 개선 (007)

사진을 여러 장 선택해 한 번에 올리고 파일명 없이 표시합니다. 사진 클릭은 사이트 내 뷰어(이전·다음·방향키·Escape)로 열립니다. 웹에서 Windows 기본 사진 앱을 직접 실행하는 기능은 제공하지 않습니다. 담당자·대표·관리자는 매물 변경 이력을 개별·전체 삭제할 수 있습니다. 고객의 개인정보 처리 기록 화면과 필수 입력은 제거했으며 기존 DB 값은 보존합니다. 최신 코드에서 `bash scripts/start-local.sh`로 추가 정책 007을 적용하고 Next 서버를 재시작하세요.

## 4단계 계약관리

**매물 상세 → 계약 등록**에서 매매·전세·월세 계약을 작성하고 기존 또는 신규 고객을 계약별 임대인/임차인/매도인/매수인/기타 역할로 연결합니다. 한 매물·고객에 여러 계약을 보존하며 계약 금액은 매물 가격과 독립적으로 저장합니다. 상단 **계약관리**에서 계약번호·매물·고객 이름, 상태·직원·계약일로 검색합니다.

계약서 원본은 비공개로 보관하고 덮어쓰기·삭제를 금지합니다. 정정본은 새 파일로 추가하며 수정·다운로드 접근 승인을 기록합니다. 기간 중복은 예외 사유로 확인하고, 계약 체결·종료 후에는 실제 매물 상태를 직접 검토합니다. [기능·DB·권한·파일 구조](docs/contract-management.md), [검증 결과와 화면](docs/validation.md)를 참고하세요.

최신 코드에서 `bash scripts/start-local.sh`로 미적용 008·009를 추가 적용한 후 Next 서버를 다시 실행하세요. 기존 볼륨·DB를 초기화하지 마세요. .env.example의 기존 설정을 그대로 사용합니다. exact seed 개수를 검사하는 `test:integration`은 다른 데이터 생성 테스트가 끝난 뒤 별도로 실행하세요.
