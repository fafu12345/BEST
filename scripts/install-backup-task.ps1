param([string]$Destination = "$env:USERPROFILE\EstateMatchBackups", [string]$Time = '02:00')
$ErrorActionPreference = 'Stop'
$secretDir = Join-Path $env:LOCALAPPDATA 'EstateMatch'
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
$secret = Read-Host 'Backup password (16+ characters; keep an offline copy)' -AsSecureString
if ($secret.Length -lt 16) { throw 'Use at least 16 characters.' }
$secret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $secretDir 'backup-password.dpapi')
$script = Join-Path $PSScriptRoot 'backup-local.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -File `"$script`" -Destination `"$Destination`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'EstateMatch Daily Backup' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Encrypted local DB + file backup; Docker Desktop must be running.' -Force | Out-Null
Write-Output "Daily backup registered for $Time. Windows user must be logged in and Docker Desktop running."
Write-Output 'Keep the password offline; the DPAPI file alone cannot recover backups on another PC.'
