param([string]$Destination = "$env:USERPROFILE\EstateMatchBackups", [int]$RetainDays = 30)
$ErrorActionPreference = 'Stop'
$secretPath = Join-Path $env:LOCALAPPDATA 'EstateMatch\backup-password.dpapi'
if (!(Test-Path $secretPath)) { throw 'Run install-backup-task.ps1 first. Keep your backup password offline for disaster recovery.' }
$secure = Get-Content -LiteralPath $secretPath | ConvertTo-SecureString
try {
    $env:ESTATEMATCH_BACKUP_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
    & node (Join-Path $PSScriptRoot 'backup-local.mjs') --output $Destination --retain-days $RetainDays
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Check Docker and available disk space.' }
} finally { Remove-Item Env:ESTATEMATCH_BACKUP_PASSWORD -ErrorAction SilentlyContinue }
