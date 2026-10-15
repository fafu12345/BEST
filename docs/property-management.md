# 2단계 매물관리

로그인 후 **매물관리 열기**에서 사용합니다. 주소 경로는 `/dashboard/properties`입니다.

## 사용 흐름

1. **매물 등록** 맨 앞에서 상가·사무실·아파트·오피스텔 유형을 선택합니다.
2. 유형에 맞는 건물·단지 보기를 선택합니다. 보기가 없다면 **새 건물·단지명 → 보기 추가**로 직접 등록하세요. 예: 오피스텔 유형의 ‘한솔2차 오피스텔’, ‘한솔3차 오피스텔’. 같은 사무소 직원끼리 공유하며 다른 사무소에는 보이지 않습니다. 같은 이름을 다시 추가하면 기존 보기를 선택합니다.
3. **호실**은 직접 입력합니다. 상가는 **상호**도 따로 입력합니다. 아파트·오피스텔은 필요하면 동·방 수도 기록할 수 있습니다. 매물명은 선택한 이름과 동·호실·상호로 자동 구성합니다. 이름 자체를 반복해서 타이핑하지 않아도 됩니다.
4. 거래 방식은 선택형입니다. **매매**일 때 매매가격·보증금·월세 세 항목을 입력하고, **전세·월세**일 때 보증금·월세 두 항목만 입력합니다. 매매 매물에 세입자가 있다면 현재 임대 보증금과 월세를 함께 기록하세요. 없는 금액은 0으로 두면 됩니다.
5. 금액 입력은 **만 원**, 저장은 정수 **원**입니다. 예: `10000`은 1억 원, `123.4567`은 123만 4,567원입니다. 화면에는 억·만 원으로 표시합니다.
6. 면적은 **전용면적 하나**를 ㎡로 입력하고 평과 ㎡를 함께 표시합니다. 1평 = 3.305785㎡입니다. 입력은 소수점 두 자리까지 지원합니다. 해당 층·전체 층은 개별 매물 정보로 유지하지만 최소·최대 면적, 최저·최고 층 검색 입력란은 제거했습니다.
7. 등록자는 자동으로 담당 직원이 됩니다. 대표·관리자는 저장 후 같은 사무소의 활성 직원으로 변경할 수 있습니다. 직원은 자기 담당 자료만 수정합니다.
8. 같은 주소·층에 다른 활성 매물이 있으면 중복 후보를 표시합니다. 다른 호실이나 별도 거래 조건이면 확인 후 등록할 수 있습니다. 같은 사무소 후보만 보입니다.
9. 상세에서 사진(JPEG/PNG/WebP)과 도면(이미지/PDF)을 파일당 10MiB까지 올릴 수 있습니다.
10. 거래 상태·매매가격·보증금·월세·권리금·담당자 변경은 DB에서 자동 기록합니다. 화면은 최신 100건을 표시하고 DB는 전체 이력을 보존합니다. 기존 형식의 가격 이력도 삭제하거나 변조하지 않습니다.
11. **현재 정보로 확인 완료 처리**로 저장하면 서버 시각으로 최종 확인일을 갱신합니다. 기존 미확인 자료는 ‘미확인’으로 표시합니다.
12. 매물 삭제는 소프트 삭제입니다. 앱 목록·상세·중복 후보에서 제외되고 파일 접근도 차단됩니다. 파일과 이력은 보존하며 복원·영구 삭제 화면은 제공하지 않습니다.

## 검색과 화면

맨 앞의 **매물 유형 → 건물·단지 선택**으로 특정 보기의 매물만 모아볼 수 있습니다. 주소·상호·호실 검색어, 거래 방식·상태, 가격 범위와 전용면적 하나를 함께 적용할 수 있습니다. 전용면적 검색은 입력한 ㎡ 값과 일치하는 매물을 찾습니다. 가격 범위는 매매가격·전세 보증금·월세액 기준입니다. 페이지당 20건이며 PC는 표, 모바일은 카드입니다. 모바일 상세 필터는 필요할 때 펼칩니다.

## DB와 권한

마이그레이션: `003_property_management`(기본 매물관리) 및 `004_property_buildings`(유형별 보기·금액 입력 개편).

기본 12개 테이블을 유지하고 `properties`, `property_images`에 열을 추가하며 **추가 2개** 테이블 `property_change_history`, `property_buildings`를 만듭니다. 전체 업무 테이블은 14개입니다. 기존 house/land/other 유형은 데이터 보존을 위해 DB에서 유지하지만 신규 입력은 지정한 4개 유형만 지원합니다.

- properties 추가 열: building_name, floor, total_floors, premium, business_type, facilities, complex_name, building_dong, unit_number, room_count, last_confirmed_at, deleted_at, version, search_text(생성 열), normalized_address(생성 열).
- 004에서 properties에 building_id, store_name, monthly_rent를 추가합니다. property_buildings는 id, office_id, property_type, name, normalized_name, created_by, created_at, updated_at을 갖습니다. office/type별 이름 중복을 막고 properties의 office_id·property_type·building_id 복합 FK로 다른 사무소·유형의 보기 연결을 차단합니다.
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

시작 스크립트가 아직 적용하지 않은 마이그레이션(이번 개편은 004)을 순서대로 적용합니다. 기존 가상 계정과 데이터는 보존됩니다. 표준 Supabase CLI 구성에서는 실행 중인 로컬 프로젝트에서 `npx supabase migration up --local`로 추가 마이그레이션을 적용합니다. 개발 데이터 초기화 명령은 이 업데이트에 필요하지 않습니다.

## 검사

로컬 Supabase와 Next 서버가 실행 중이어야 합니다.

```bash
npm run test:db
npm run test:integration
npm run test:properties
npm run test:property-buildings
npm run test:property-migration
npx playwright install chromium
npm run test:property-ui
```

브라우저가 별도로 설치된 환경에서는 CHROME_EXECUTABLE_PATH로 실행 파일 경로를 지정할 수 있습니다. 클라우드 검증에는 공식 Google Chrome을 사용했습니다. 테스트는 `.env.local`의 로컬 주소만 허용하고 가상 데이터를 만듭니다. CRUD 요청은 직원 세션으로 수행하며 service_role은 해당 실행에서 만든 가상 데이터 정리에만 사용합니다. DB 테스트는 롤백합니다. 테스트를 진행 중인 다른 로컬 업무 세션과 동시에 실행하지 않는 것이 좋습니다.

## 기존 자료 호환

기존에 저장된 가격과 금액 이력은 004에서 변경하지 않습니다. 기존 price 저장 규칙(매매=매매가격, 전세=전세 보증금, 월세=월세액)을 유지하고 monthly_rent를 별도로 확장합니다. 이전 월세·전세 자료의 monthly_rent가 NULL이면 기존 price에서 올바른 금액을 읽어 표시합니다. 새 입력은 deposit과 monthly_rent를 독립적으로 저장하며 전세·월세의 price는 기존 규칙에 맞춰 서버가 동기화합니다. 이전 API의 monthly_rent 없는 입력도 호환됩니다. 수정 요청에 새 필드가 빠졌다면 기존 건물 선택·상호·매매 임대 금액을 지우지 않으며, 전세의 별도 월세도 보존합니다.

기존 건물명·단지명이 있으면 사무소·유형별 보기로 가져오고 연결합니다. 이름이 비어 있는 자료에서 임의의 건물명을 만들지는 않습니다. 해당 자료를 수정할 때 새 보기를 추가·선택하면 됩니다. 보기는 현재 추가·선택을 지원하며 이름 변경·삭제 기능은 제공하지 않습니다.
