# VS Code task entry point: "Studio: Web Dev".
# Runs the Next.js studio with Fast Refresh pointing at the LOCAL API.
# Reuses a healthy Next dev server started from this workspace; refuses to touch a foreign process.

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev\studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio Web]"
$port = 3000
$apiPort = 4000

Write-StudioInfo $prefix "Starting Next.js dev server on http://localhost:$port (Fast Refresh)."

if (Test-StudioTcpPort -Port $port) {
  $owner = Get-StudioPortOwner -Port $port
  $ownerText = "pid $($owner.Pid) ($($owner.Name))"
  $owned = Test-StudioOwnedByWorkspace -Owner $owner -Root $root

  if (-not $owned) {
    Write-StudioError $prefix "PORT $port ALREADY IN USE BY UNKNOWN PROCESS: $ownerText was not started from this workspace."
    Write-StudioError $prefix "Command line: $($owner.CommandLine)"
    Write-StudioError $prefix "Stop that process (or change the web port) and press F5 again. Nothing was killed."
    exit 1
  }

  if (Test-StudioWebReady -Port $port) {
    Write-StudioOk $prefix "Reusing the web server already listening on http://localhost:$port ($ownerText)."
    Write-Host "STUDIO_WEB_READY"
    Wait-StudioServiceAlive -Label "the reused web server" -Prefix $prefix -Probe { Test-StudioWebReady -Port $port }
    exit 0
  }

  Write-StudioWarn $prefix "A web server from this workspace is listening on port $port but does not answer HTTP 200 ($ownerText). Restarting it."
  Stop-StudioProcessTree -ProcessId $owner.Pid | Out-Null
  $releaseDeadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $releaseDeadline -and (Test-StudioTcpPort -Port $port)) { Start-Sleep -Milliseconds 300 }
  if (Test-StudioTcpPort -Port $port) {
    Write-StudioError $prefix "Port $port is still busy after stopping pid $($owner.Pid)."
    exit 1
  }
}

# Local development always talks to the local API, never to a cloud backend.
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:$apiPort"
npm.cmd run dev --workspace @fullpos-ad-studio/web
exit $LASTEXITCODE
