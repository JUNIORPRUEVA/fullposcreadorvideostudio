$ErrorActionPreference = "SilentlyContinue"

$PidFile = Join-Path (Resolve-Path ".").Path "storage\temp\logs\local-servers.pids.json"
if (!(Test-Path $PidFile)) {
  Write-Output "No managed local server PID file found."
  exit 0
}

$Servers = Get-Content -Raw $PidFile | ConvertFrom-Json
foreach ($Server in $Servers) {
  taskkill.exe /PID $Server.pid /T /F | Out-Null
  Write-Output "Stopped $($Server.name) pid $($Server.pid)"
}
