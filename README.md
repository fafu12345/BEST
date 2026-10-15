# EstateMatch

공인중개사무소별 데이터 격리·직원 권한과 2단계 매물관리를 구현한 프로젝트입니다. Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage를 사용합니다. 외부 이메일·매물 연동이나 실제 개인정보, 유료 서비스는 사용하지 않습니다.

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

`/login`에서 로그인하고 `/dashboard`에서 사무소 매물과 관리자용 초대 화면을 확인합니다. `/join`은 승인된 토큰으로 가입하는 화면입니다. 로그인 후 **매물관리 열기**에서 매물 등록·검색·수정·사진/도면·이력·소프트 삭제를 사용할 수 있습니다. 등록은 **유형 → 직접 추가한 건물·단지 보기 → 호실(상가는 상호 추가)** 순서입니다. 매매는 매매가격·보증금·월세, 전세·월세는 보증금·월세를 입력합니다. 고객 CRUD UI는 후속 단계입니다. [2단계 사용·업데이트 안내](docs/property-management.md)를 확인하세요.

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

## DB 명세와 마이그레이션

기존 12개 테이블 명세가 대화에 없어 사용자 동의에 따라 새 초안을 설계했습니다. [설계 개요](docs/schema.md)와 다음 SQL이 정확한 필드 명세입니다.

- `supabase/migrations/202610150001_estatematch.sql`: 업무 테이블 12개, FK/CHECK/UNIQUE/INDEX, updated_at, office_id 변경 방지, RLS, 서버 전용 초대 소비 함수
- `supabase/migrations/202610150002_storage.sql`: 비공개 이미지 버킷과 Storage 정책
- `supabase/migrations/202610150003_property_management.sql`: 매물 확장 필드, 이력 테이블, RLS를 유지한 소프트 삭제·파일 보호
- `supabase/migrations/202610150004_property_buildings.sql`: 사무소·유형별 건물/단지 보기, 상호·호실, 거래금액 확장과 기존 자료 호환
- `supabase/seed.sql`: 가상 사무소 두 곳, 직원 5명, 업무 데이터

SQL은 Supabase의 `auth.users`, `auth.uid()`, `storage` 스키마 및 기본 역할을 전제로 합니다. 일반 빈 PostgreSQL에 바로 적용하는 SQL이 아닙니다. 로컬 시작 스크립트 또는 Supabase CLI로 실행하면 Auth/Storage 스키마 준비 후 순서대로 실행됩니다. 원격 DB 적용·배포는 수행하지 않습니다.

기본 12개 테이블에 매물 이력과 유형별 건물·단지 보기 테이블을 추가해 업무 테이블은 총 14개입니다. 모든 업무 데이터의 FK는 office_id를 포함해 다른 사무소 데이터 연결을 차단합니다. 직원은 한 사무소에만 소속됩니다. 사무소마다 활성 대표는 최대 한 명입니다. 사진·고객 희망 조건의 담당자는 부모와 같으며 부모 담당자 변경 시 함께 갱신됩니다. 매물은 소프트 삭제만 제공하며 다른 테이블의 참조와 이력은 유지합니다. 고객 삭제는 FK가 막을 수 있습니다.

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
# 선택: 실제 브라우저 UI 회귀 검사
npx playwright install chromium
npm run test:property-ui
```

DB 테스트는 실제 PostgreSQL에서 authenticated/anon/service_role로 역할을 전환하고 JWT 사용자 식별자를 설정합니다. 각 테이블의 조회·수정 범위, 위조·권한 상승, 복합 FK, CHECK/UNIQUE, 삭제, updated_at, 비활성 직원, 초대 승인·재사용을 검사하며 모든 변경은 롤백합니다. Supabase 전용 Auth 테이블을 가짜 fixture로 대체하지 않습니다.

통합 테스트는 실제 Auth 로그인·공개 가입 차단, PostgREST 격리, 로그인 후 대시보드, Next 초대·승인·가입 API, Storage 업로드·다운로드를 검증합니다. `.env.local`의 **로컬** 주소만 허용합니다. 신규 가상 사용자·초대와 파일은 테스트 후 정리합니다.

경량 구성을 중단하려면 `docker compose --env-file local/.env -f local/compose.yml stop`을 실행합니다. 재시작은 `bash scripts/start-local.sh`입니다. 데이터는 Docker 볼륨에 보존됩니다. 표준 CLI 모드에서만 `npx supabase db reset --local`(로컬 데이터 삭제 후 재적용), `npx supabase stop`을 사용합니다. 실행 결과와 남은 제한은 `docs/validation.md`를 확인하세요.
