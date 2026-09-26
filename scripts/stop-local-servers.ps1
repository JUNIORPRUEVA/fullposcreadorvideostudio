$ErrorActionPreference = "SilentlyContinue"

$Root = (Resolve-Path ".").Path
$LogsDir = Join-Path $Root "storage\temp\logs"
$TunnelPidFile = Join-Path $LogsDir "studio-db-tunnel.pid"
if (Test-Path $TunnelPidFile) {
  $TunnelPid = (Get-Content -Raw $TunnelPidFile).Trim()
  taskkill.exe /PID $TunnelPid /T /F | Out-Null
  Remove-Item -LiteralPath $TunnelPidFile -Force
  Write-Output "Stopped studio-db tunnel pid $TunnelPid"
}

$PidFile = Join-Path $LogsDir "local-servers.pids.json"
if (!(Test-Path $PidFile)) {
  Write-Output "No managed local server PID file found."
  exit 0
}

$Servers = Get-Content -Raw $PidFile | ConvertFrom-Json
foreach ($Server in $Servers) {
  taskkill.exe /PID $Server.pid /T /F | Out-Null
  Write-Output "Stopped $($Server.name) pid $($Server.pid)"
}
