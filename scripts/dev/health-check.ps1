# FullPOS Video Studio - local dev health report (VS Code task: "Studio: Health Check").
# Read-only: never changes the database or the running services.

[CmdletBinding()]
param(
  [int]$ApiPort = 4000,
  [int]$WebPort = 3000,
  [int]$InspectorPort = 9229,
  [int]$TunnelPort = 15432
)

. (Join-Path $PSScriptRoot "studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio]"
$apiUrl = "http://localhost:$ApiPort"
$healthUrl = "$apiUrl/health"
$webUrl = "http://localhost:$WebPort"

Write-Host ""
Write-Host "FULLPOS VIDEO STUDIO - LOCAL DEV HEALTH" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

$apiOwner = Get-StudioPortOwner -Port $ApiPort
$apiReady = Test-StudioApiReady -Port $ApiPort
$webOwner = Get-StudioPortOwner -Port $WebPort
$webReady = Test-StudioWebReady -Port $WebPort
$tunnelOwner = Get-StudioPortOwner -Port $TunnelPort
$inspector = Get-StudioInspectorStatus -Port $InspectorPort

Write-Host ""
Write-Host "Services"
Write-Host "--------"
if ($apiReady) {
  $health = Get-StudioApiHealth -Port $ApiPort
  Write-StudioOk $prefix "API        : PASS  $apiUrl  (pid $($apiOwner.Pid), service '$($health.service)')"
} elseif ($apiOwner) {
  Write-StudioError $prefix "API        : FAIL  port $ApiPort is owned by pid $($apiOwner.Pid) ($($apiOwner.Name)) which is not the studio API"
} else {
  Write-StudioError $prefix "API        : FAIL  nothing listening on $apiUrl"
}
Write-Host "             health   : $healthUrl"

if ($webReady) {
  Write-StudioOk $prefix "WEB        : PASS  $webUrl  (pid $($webOwner.Pid))"
} elseif ($webOwner) {
  Write-StudioError $prefix "WEB        : FAIL  port $WebPort is owned by pid $($webOwner.Pid) ($($webOwner.Name)) and does not answer HTTP 200"
} else {
  Write-StudioError $prefix "WEB        : FAIL  nothing listening on $webUrl"
}

if ($tunnelOwner) {
  Write-StudioOk $prefix "DB TUNNEL  : UP    127.0.0.1:$TunnelPort (pid $($tunnelOwner.Pid), $($tunnelOwner.Name))"
} else {
  Write-StudioWarn $prefix "DB TUNNEL  : DOWN  127.0.0.1:$TunnelPort"
}

if ($inspector -eq "listening") {
  Write-StudioOk $prefix "INSPECTOR  : UP    127.0.0.1:$InspectorPort (backend breakpoints)"
} else {
  Write-StudioWarn $prefix "INSPECTOR  : DOWN  127.0.0.1:$InspectorPort (backend breakpoints unavailable)"
}

Write-Host ""
Write-Host "Database (sanitized from apps/api/.env, secrets never printed)"
Write-Host "--------"
$apiEnv = Get-StudioApiEnv -Root $root
$dbReport = Get-StudioDatabaseReport -DatabaseUrl ([string]$apiEnv["DATABASE_URL"])
Write-Host "  DB_PROVIDER            : $($dbReport.Provider)"
Write-Host "  DB_HOST                : $($dbReport.Host):$($dbReport.Port)"
Write-Host "  DB_NAME                : $($dbReport.Name)"
Write-Host "  DB_SCHEMA              : $($dbReport.Schema)"
Write-Host "  DB_SOURCE_ENV_FILE     : apps/api/.env"
Write-Host "  DB_CONNECTION_PRESENT  : $(if ($dbReport.Present) { 'YES' } else { 'NO' })"
Write-Host "  RAW DATABASE URL       : (hidden)"

Write-Host ""
Write-Host "Toolchain"
Write-Host "--------"
$ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
$ffprobe = Get-Command ffprobe.exe -ErrorAction SilentlyContinue
if ($ffmpeg) {
  $version = (& ffmpeg.exe -version 2>&1 | Select-Object -First 1)
  Write-StudioOk $prefix "FFMPEG     : FOUND  $($ffmpeg.Source)"
  Write-Host "             $version"
} else {
  Write-StudioError $prefix "FFMPEG     : NOT FOUND"
}
if ($ffprobe) {
  $version = (& ffprobe.exe -version 2>&1 | Select-Object -First 1)
  Write-StudioOk $prefix "FFPROBE    : FOUND  $($ffprobe.Source)"
  Write-Host "             $version"
} else {
  Write-StudioError $prefix "FFPROBE    : NOT FOUND"
}

Write-Host ""
Write-Host "Repository"
Write-Host "--------"
Write-Host "  ROOT      : $root"
Write-Host "  BRANCH    : $(& git.exe -C $root rev-parse --abbrev-ref HEAD 2>$null)"
Write-Host "  HEAD      : $(& git.exe -C $root rev-parse --short HEAD 2>$null)"
Write-Host "  LOGS      : storage/temp/logs"
Write-Host ""

if ($apiReady -and $webReady) { exit 0 }
exit 1
