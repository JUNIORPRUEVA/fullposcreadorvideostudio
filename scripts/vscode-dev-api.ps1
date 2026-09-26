# VS Code task entry point: "Studio: API Dev".
# Runs the API in watch mode with the Node inspector enabled so backend breakpoints work.
# Reuses a healthy API started from this workspace; refuses to touch a foreign process on the port.

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "dev\studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio API]"
$port = 4000
$inspectorPort = 9229

Write-StudioInfo $prefix "Starting the API in watch mode (Node inspector on 127.0.0.1:$inspectorPort)."

if (Test-StudioTcpPort -Port $port) {
  $owner = Get-StudioPortOwner -Port $port
  $ownerText = "pid $($owner.Pid) ($($owner.Name))"

  if (-not (Test-StudioApiReady -Port $port)) {
    Write-StudioError $prefix "PORT $port ALREADY IN USE BY UNKNOWN PROCESS: $ownerText does not answer /health with the FullPOS Video Studio API marker."
    Write-StudioError $prefix "Command line: $($owner.CommandLine)"
    Write-StudioError $prefix "Stop that process (or change PORT in apps/api/.env) and press F5 again. Nothing was killed."
    exit 1
  }

  $inspector = Get-StudioInspectorStatus -Port $inspectorPort
  if ($inspector -ne "listening" -and (Test-StudioOwnedByWorkspace -Owner $owner -Root $root)) {
    Write-StudioWarn $prefix "An API from this workspace is running without the Node inspector ($ownerText). Restarting it so backend breakpoints work."
    Stop-StudioProcessTree -ProcessId $owner.Pid | Out-Null
    $releaseDeadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $releaseDeadline -and (Test-StudioTcpPort -Port $port)) { Start-Sleep -Milliseconds 300 }
    if (Test-StudioTcpPort -Port $port) {
      Write-StudioError $prefix "Port $port is still busy after stopping pid $($owner.Pid)."
      exit 1
    }
  } else {
    Write-StudioOk $prefix "Reusing the API already listening on http://localhost:$port ($ownerText)."
    if ($inspector -eq "listening") {
      Write-StudioOk $prefix "Node inspector already listening on 127.0.0.1:$inspectorPort."
    } else {
      Write-StudioWarn $prefix "Node inspector is not listening on 127.0.0.1:${inspectorPort}: backend breakpoints are unavailable for this reused process."
    }
    Write-Host "STUDIO_API_READY"
    Wait-StudioServiceAlive -Label "the reused API" -Prefix $prefix -Probe { Test-StudioApiReady -Port $port }
    exit 0
  }
}

$env:PORT = "$port"
npm.cmd run dev:debug --workspace @fullpos-ad-studio/api
exit $LASTEXITCODE
