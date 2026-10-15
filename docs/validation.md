# 검증 결과

2026-10-15, 현재 클라우드 인스턴스에서 검증했습니다. 신규 작업 복원이나 클라우드 배포를 검증한 기록은 아닙니다.

| 검사 | 결과 |
| --- | --- |
| npm ci | 성공 (잠금 파일 기반 설치) |
| npm run lint | 통과 |
| npm run typecheck | 통과 |
| npm run build | 통과 (Next.js 16.4.1) |
| PostgreSQL 마이그레이션 2개 | 실제 PostgreSQL 17에서 적용 성공 |
| npm run test:db | 91개 assertion 통과, 트랜잭션 롤백 |
| npm run test:integration | 36개 검사 통과 |
| bash scripts/start-local.sh 재실행 | 성공, 기존 5명과 가상 업무 데이터 유지 |

통합 검사는 로그인 화면의 실제 Server Action 성공/비밀번호 실패, Auth 계정 5명의 로그인, 역할별 대시보드, 사무소별 PostgREST 조회, 공개 가입 차단, 초대·별도 서버 승인·가입·재사용 차단, 입력 role/office_id 위조 차단, 실제 파일 업로드와 같은 사무소 다운로드, 다른 담당자 업로드 및 다른 사무소 다운로드 차단을 포함합니다.

DB 검사는 모든 공개 업무 테이블의 RLS, 9개 담당자 업무 테이블에 대한 직원·대표·관리자 수정 범위, 두 사무소 격리, 직원 소속/역할 직접 변경 차단, 복합 FK/CHECK/UNIQUE, 삭제, updated_at, 비활성/익명 계정 접근 차단, 승인 없는 초대 소비 차단과 승인된 초대 재사용 차단을 검증합니다.

로컬 구성은 공식 Supabase GoTrue v2.197.0, PostgREST v16.4, Storage v1.82.1, Kong 2.8.1과 PostgreSQL 17을 실행합니다. Storage의 공식 Docker 이미지는 VFS 디스크 중복 문제 때문에 검증된 다운로드의 내용을 유지한 로컬 단일 계층 이미지로 변환했습니다. 이 구성에서 실제 인증·DB·파일 서비스를 사용했으며 Auth/Storage를 가짜 fixture로 대체하지 않았습니다.

전체 Supabase CLI DB 이미지는 디스크 공간 부족으로 실행하지 못했습니다. 따라서 표준 CLI 모드는 미검증이며, 검증된 실행 경로는 README의 경량 구성입니다. 외부 메일·매물 연동, 실제 개인정보, 원격 DB 적용, 클라우드 배포 및 유료 서비스 생성은 수행하지 않았습니다.

환경 설정 초안에 install_script와 start_skill을 저장했습니다. 초안 저장은 배포·게시 또는 신규 작업 복원 검증을 의미하지 않습니다. 재사용 환경을 게시하려면 사용자가 환경 설정에서 변경 사항을 검토·저장한 다음 환경을 게시해야 합니다.
