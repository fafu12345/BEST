# 로컬 데이터 백업과 복구

## 포함 범위와 한계

`backup:local`은 PostgreSQL 전체 DB(업무·Auth·Storage 메타데이터·private 설정·권한), Storage 사진·도면·계약서 원본, `.env.local`과 `local/.env`를 **AES-256-GCM으로 암호화한 하나의 .embackup 파일**로 저장합니다. 비밀번호 키는 매번 다른 salt로 scrypt에서 유도하고 암호화 결과를 다시 복호화해 무결성을 확인한 뒤 완료 파일로 확정합니다. 원본 자료와 키를 GitHub에 올리지 않습니다.

백업 도구는 같은 PC의 로컬 Docker Compose 구성 전용입니다. 외부 Supabase/PITR/네트워크 저장소를 자동으로 생성하거나 전송하지 않습니다. 재해 대비를 위해 완료된 암호화 파일을 다른 물리 디스크나 별도 저장소에도 복사해야 합니다. 같은 PC의 폴더만으로 디스크 고장을 대비할 수 없습니다.

**아직 대표님 PC의 자동 실행은 등록하지 않았습니다.** 아래 Windows 등록을 직접 적용해야 매일 실행됩니다. 클라우드 실행 환경에서 검증한 것과 대표님 PC에 설치한 것은 다릅니다.

## 백업할 때 일어나는 일

DB와 파일 사이의 일관성을 위해 현재 실행 중인 Auth·REST·Storage·게이트웨이·상태 예약 작업을 잠시 중지합니다. 이 시간에는 앱 조회·로그인·업로드도 일시 중단될 수 있으므로 야간 등 업무 외 시간에 실행하세요. DB와 파일을 캡처하고 기존 서비스만 다시 시작한 후 암호화합니다. 원래 꺼져 있던 서비스를 임의로 시작하지 않습니다. 실패·일반 중단 신호에서도 서비스를 다시 시작하도록 처리했습니다. 전원 차단·강제 종료 후에는 `bash scripts/start-local.sh`로 정상 시작을 확인하세요.

완료 전 파일은 `.partial`이며 복구 대상으로 쓰지 않습니다. 성공 뒤에만 보관기간 정리를 실행하고, 전용 폴더의 EstateMatch-*.embackup 중 기간이 지난 백업을 제거합니다. 기본 보관기간은 30일입니다. 백업 과정의 임시 평문 파일은 접근을 제한한 임시 폴더에 생성하고 종료 시 제거합니다. PC 자체의 디스크 암호화와 사용자 접근 제한도 유지하세요.

중복 백업은 임시 폴더의 estatematch-local-backup.lock으로 차단합니다. 비정상 전원 종료로 잠금 파일이 남았다면 실행 중인 백업 프로세스가 없는지 먼저 확인한 다음 그 잠금 파일만 지우세요. DB·Docker 볼륨은 지우지 않습니다.

## Windows 매일 자동 실행 등록

프로젝트 경로가 바뀌지 않을 위치로 먼저 옮기세요. Node.js와 Docker Desktop이 설치되어 있어야 합니다. **PowerShell**에서 프로젝트 폴더로 이동하고 실행합니다.

```powershell
.\scripts\install-backup-task.ps1 -Destination 'D:\EstateMatch_Backups' -Time '02:00'
```

16자 이상의 백업 비밀번호를 입력합니다. **비밀번호는 별도 안전한 장소에 보관해야 다른 PC에서 복구할 수 있습니다.** 비밀번호를 잃으면 암호화 백업도 복구할 수 없습니다. 채팅·GitHub·프로젝트 .env 파일에 비밀번호를 넣지 마세요.

Windows DPAPI로 현재 사용자만 복호화할 수 있는 비밀번호 파일을 `%LOCALAPPDATA%\EstateMatch\backup-password.dpapi`에 저장합니다. 이 파일만 다른 PC에 복사해서는 백업을 열 수 없습니다. 예약 작업은 현재 Windows 사용자가 로그인한 상태에서 실행하며 Docker Desktop이 켜져 있어야 합니다. 예약 시간에 꺼져 있었다면 다음 가능한 시점에 시작하도록 설정하고 실패하면 15분 간격으로 최대 3회 재시도합니다.

처음 등록 후 즉시 시험해 보세요.

```powershell
.\scripts\backup-local.ps1 -Destination 'D:\EstateMatch_Backups'
Get-ScheduledTaskInfo -TaskName 'EstateMatch Daily Backup'
```

- 완료된 `.embackup` 파일과 `last-success.json` 생성 날짜를 확인합니다.
- Windows 작업 스케줄러에서 마지막 실행 결과 0과 성공 시각을 확인합니다.
- D가 C와 같은 물리 디스크라면 외장 SSD 등 별도 장치에도 복사합니다.
- 이 Windows 작업 등록 스크립트는 Linux 클라우드에서 직접 실행하지 못했습니다. 암호화/DB·파일 복구 코어는 실제 Docker로 검증했으며 Windows 등록 동작은 설치 PC에서 위 절차로 확인해야 합니다.
- 스크립트 실행 정책으로 차단되면 회사 정책에 맞게 검토·허용하세요. 시스템 전체 실행 정책을 끄는 절차는 제공하지 않습니다.

외부 실패 알림은 아직 없습니다. last-success.json/작업 스케줄러 상태를 정기 확인해야 하며, 백업 파일이 생겼다는 사실만으로 외부 복사나 정기 복구 시험까지 완료된 것은 아닙니다.

## 수동 실행과 복구 시험

PowerShell에서 비밀번호를 화면에 보이지 않게 입력하고 프로세스 환경에 잠시 전달합니다.

```powershell
$secret = Read-Host '백업 비밀번호' -AsSecureString
try {
  $env:ESTATEMATCH_BACKUP_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
  npm run backup:local -- --output 'D:\EstateMatch_Backups' --retain-days 30
  npm run restore:rehearse -- --file 'D:\EstateMatch_Backups\EstateMatch-백업파일명.embackup' --cleanup
} finally {
  Remove-Item Env:ESTATEMATCH_BACKUP_PASSWORD -ErrorAction SilentlyContinue
}
```

Git Bash/Linux에서도 같은 Node 명령을 사용하되 비밀번호는 안전한 환경 변수 입력 방식으로 설정하세요. 셸 이력에 비밀번호를 직접 쓰지 마세요. 출력 폴더는 프로젝트 폴더 밖이어야 합니다. Docker 볼륨 파일 자체를 OneDrive로 동기화하지 말고 **완료된 암호화 백업 파일**을 복사하세요.

복구 도구는 현재 DB/파일을 덮어쓰지 않습니다. `estatematch_restore_*`라는 새 DB와 새 Storage 볼륨에만 복원하고 백업 당시 업무·Auth·Storage·private·로컬 설정 테이블의 행 수를 비교합니다. 현재 DB인 postgres를 대상으로 지정하면 거절합니다. 잘못된 비밀번호나 변조된 파일도 DB 생성 전에 거절합니다.

`--cleanup`은 성공한 시험 자원을 제거합니다. 옵션을 생략하면 조사할 수 있게 시험 DB와 파일 볼륨 이름을 출력하고 남깁니다. 복구 실패 시에도 해당 새 자원은 조사 목적으로 남을 수 있습니다. 운영 DB를 초기화하지 말고 출력된 **시험 이름만** 확인해 정리하세요.

이 시험은 앱 연결을 복구 DB로 전환하지 않습니다. env 설정도 현재 앱에 덮어쓰지 않습니다. 테스트에서는 원본 사진·비공개 PDF 바이트, 수납 원장, RLS까지 추가 검증합니다.

## 실제 장애 시 운영 복구 절차

1. 앱 쓰기를 멈추고 원본 디스크/볼륨을 보존합니다. 원인을 확인하기 전에 초기화하거나 Docker 데이터를 정리하지 않습니다.
2. 별도 보관한 완료 백업과 비밀번호를 확보합니다. 현재 장애 상태도 가능하면 별도 복사합니다.
3. 호환되는 PostgreSQL 17과 Supabase 구성/역할을 준비하고 먼저 위 격리 복구 시험을 실행합니다. 사용자·업무·파일·권한·최근 계약을 확인합니다.
4. 복구된 설정의 JWT/DB 키와 Storage 구성이 일치하는지 신뢰하는 운영자가 안전한 장소에서 확인합니다. 평문 키를 채팅이나 로그로 보내지 않습니다.
5. **검증된 복구 DB와 파일 볼륨으로 운영 연결을 전환하는 작업은 별도의 운영 변경**입니다. 담당자 승인·중단 일정·되돌리기 계획을 확인하고 수행합니다. 이 도구가 자동으로 현재 볼륨을 교체하지 않습니다.
6. 대표/직원 권한, 로그인, 사진·계약서 다운로드, 계약·고객·만기, 수납을 확인하고 앱을 재개합니다. 복구 지점 이후 자료의 손실 범위를 기록합니다.

매일 백업이면 최대 약 하루의 입력을 잃을 수 있고, 백업이 실패하면 그보다 길어질 수 있습니다. 복구 시간은 자료량/장비에 따라 달라지므로 실제 시험 시간을 운영 기준으로 정해야 합니다. 몇 시간치 자료도 잃을 수 없는 운영이라면 별도 서버/PITR과 더 짧은 파일 백업 주기를 검토하세요. 원격 서비스의 DB 백업이 파일 원본도 포함하는지는 따로 확인해야 합니다.
