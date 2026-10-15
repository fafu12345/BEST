# 2단계 매물관리

로그인 후 **매물관리 열기**에서 사용합니다. 주소 경로는 `/dashboard/properties`입니다.

## 사용 흐름

1. **매물 등록**에서 상가·사무실·아파트·오피스텔과 매매·전세·월세를 선택합니다.
2. 등록자는 자동으로 담당 직원이 됩니다. 대표·관리자는 저장 후 수정 화면에서 같은 사무소의 활성 직원으로 변경할 수 있습니다.
3. 금액 입력은 **만 원** 단위입니다. 예: `10000`은 1억 원, `123.4567`은 123만 4,567원입니다. DB에는 정수 원 단위로 저장합니다. 매매·전세는 price에 전체 금액, 월세는 price에 월 납입액, deposit에 보증금을 저장합니다. 권리금은 premium입니다.
4. 면적 입력은 **㎡**, 목록과 상세에서는 **평과 ㎡를 함께 표시**합니다. 1평 = 3.305785㎡이며 저장은 소수점 두 자리 ㎡입니다. 검색 면적은 평 단위입니다.
5. 상가의 권리금·업종·시설, 아파트의 단지명·동·호수·방 수, 오피스텔의 방 수를 입력할 수 있습니다. 유형을 변경하면 다른 유형 전용 필드는 서버에서 정리합니다.
6. 같은 주소·층에 활성 매물이 있으면 저장 전 중복 후보를 표시합니다. 다른 호수나 거래 조건으로 별도 등록할 수 있으므로 확인 후 저장할 수 있습니다. 같은 사무소 후보만 표시하고 삭제된 매물은 제외합니다. 중복 경고는 주소 기반 참고 기능이며 실제 중복을 확정하지 않습니다.
7. 상세에서 사진(JPEG/PNG/WebP)과 도면(이미지/PDF)을 파일당 10MiB까지 올립니다. 등록 후에만 업로드할 수 있습니다.
8. 거래 상태는 거래 가능·계약 진행·거래 완료·보류입니다. 가격·보증금·권리금·상태·담당자 변경은 DB에서 자동 이력으로 기록합니다. 화면은 최신 100건을 표시하고 DB는 전체 이력을 보존합니다.
9. **현재 정보로 확인 완료 처리**를 선택해 저장하면 서버 시각으로 최종 확인일을 갱신합니다. 이전 버전에서 만든 매물은 자동으로 확인한 것으로 간주하지 않고 ‘미확인’으로 표시합니다.
10. 삭제는 소프트 삭제입니다. 앱 목록·상세·중복 후보에서 제외되고 첨부파일 접근도 차단됩니다. 파일과 이력은 보존하며 복원·영구 삭제 화면은 제공하지 않습니다.

## 검색과 화면

매물명·건물명·주소·단지명 검색어, 유형, 거래 방식, 상태, 가격 범위, 평 범위, 층수 범위를 함께 적용할 수 있습니다. 가격 검색은 매매가·전세금·월세액 기준이며 보증금 검색은 아닙니다. 페이지당 20건입니다. PC는 표, 모바일은 카드로 표시하고 모바일 상세 조건은 필요할 때 펼칩니다.

## DB와 권한

마이그레이션: `supabase/migrations/202610150003_property_management.sql`.

기본 12개 테이블을 유지하고 `properties`, `property_images`에 열을 추가하며 **추가 1개** 테이블 `property_change_history`를 만듭니다. 기존 house/land/other 유형은 데이터 보존을 위해 DB에서 유지하지만 신규 입력은 지정한 4개 유형만 지원합니다.

- properties 추가 열: building_name, floor, total_floors, premium, business_type, facilities, complex_name, building_dong, unit_number, room_count, last_confirmed_at, deleted_at, version, search_text(생성 열), normalized_address(생성 열).
- property_images 추가 열: file_kind(photo/floorplan), original_name, mime_type.
- property_change_history: id, office_id, property_id, actor_staff_id, event(created/updated/deleted), old_values, new_values, created_at. append-only 이력이므로 updated_at은 없습니다.
- 사무소 복합 FK, 활성 담당자 검사, 층수·금액 CHECK, 검색/필터/중복 탐지 인덱스를 적용합니다.
- 모든 업무 요청은 **로그인 세션의 Supabase 클라이언트**를 사용합니다. 매물 API에서 service_role을 사용하지 않습니다. 직원은 자기 담당만 변경하고 대표·관리자는 같은 사무소 전체를 변경합니다. office_id는 서버에서 결정하고 일반 입력으로 받지 않습니다.
- version을 DB 트리거에서 증가시키며 수정·삭제 때 같은 버전을 요구해 다른 사용자의 변경을 덮어쓰지 않습니다.
- 일반 사용자의 properties DELETE 권한을 제거했습니다. 소프트 삭제 RPC는 SECURITY INVOKER로 동일 RLS 안에서 UPDATE합니다. 삭제한 행의 재수정·복원은 직원·관리자·대표 모두 차단됩니다.
- **보존된 삭제 행은 같은 사무소가 DB/API의 직접 SELECT로 감사 목적으로 읽을 수 있습니다.** 앱의 모든 활성 매물 조회는 deleted_at IS NULL을 적용합니다. 다른 사무소에는 삭제 여부와 관계없이 공개하지 않습니다. 이는 RLS를 우회하는 삭제 함수를 쓰지 않으면서 기록을 보존하기 위한 정책입니다.
- 이력 트리거만 파생 이력을 쓰기 위해 SECURITY DEFINER입니다. 업무 행 변경 권한을 높이지 않으며 사용자는 이력 INSERT/UPDATE/DELETE 권한이 없습니다. 실제 변경자와 office_id는 DB에서 계산합니다. 적용 전 이력은 소급 생성하지 않습니다.
- Storage 버킷은 비공개입니다. 같은 사무소의 활성 직원만 읽고, 담당자·대표·관리자만 올리거나 지웁니다. 삭제한 매물은 Storage 정책과 메타데이터 정책에서도 차단합니다.
- 앱 파일 경로는 사용자 세션으로 파일을 전달하며 공개 URL·서명 URL을 만들지 않습니다. private/no-store, nosniff, sandbox CSP를 적용합니다. 업로드 크기·확장 형식과 실제 파일 헤더를 검사하고 경로는 서버 UUID로 생성합니다.

DB와 Storage는 하나의 트랜잭션을 공유하지 않습니다. 업로드 후 메타데이터 저장 실패 시 사용자 권한으로 파일 정리를 시도합니다. 동시 담당자 변경 등으로 정리 권한까지 사라지면 관리자 확인이 필요할 수 있습니다. 파일 삭제 도중 메타데이터 정리가 실패한 경우에도 오류를 반환합니다.

## 기존 설치에서 업데이트 (Windows Git Bash 포함)

실행 중인 Next 창에서 Ctrl+C를 누르고 최신 소스를 받습니다. ZIP으로 받았다면 기존 폴더의 `.env.local`, `local/.env`를 보존하세요. Docker 볼륨이나 DB를 초기화하지 않습니다.

```bash
npm ci
bash scripts/start-local.sh
npm run dev
```

시작 스크립트가 아직 적용하지 않은 003 마이그레이션만 적용합니다. 기존 가상 계정과 데이터는 보존됩니다. 표준 Supabase CLI 구성에서는 실행 중인 로컬 프로젝트에서 `npx supabase migration up --local`로 추가 마이그레이션을 적용합니다. 개발 데이터 초기화 명령은 이 업데이트에 필요하지 않습니다.

## 검사

로컬 Supabase와 Next 서버가 실행 중이어야 합니다.

```bash
npm run test:db
npm run test:integration
npm run test:properties
npx playwright install chromium
npm run test:property-ui
```

브라우저가 별도로 설치된 환경에서는 CHROME_EXECUTABLE_PATH로 실행 파일 경로를 지정할 수 있습니다. 클라우드 검증에는 공식 Google Chrome을 사용했습니다. 테스트는 `.env.local`의 로컬 주소만 허용하고 가상 데이터를 만듭니다. CRUD 요청은 직원 세션으로 수행하며 service_role은 해당 실행에서 만든 가상 데이터 정리에만 사용합니다. DB 테스트는 롤백합니다. 테스트를 진행 중인 다른 로컬 업무 세션과 동시에 실행하지 않는 것이 좋습니다.
