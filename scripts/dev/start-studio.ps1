# FullPOS Video Studio - one command local dev stack (fallback for VS Code F5).
#
#   npm run dev:studio
#
# Starts the database tunnel (only if DATABASE_URL needs it), the API in watch mode with the
# Node inspector, and the Next.js dev server with Fast Refresh. Waits until both really answer,
# then opens the browser. Logs stay separated under storage/temp/logs.
#
# Database safety: this script never runs migrations, seeds, resets or schema pushes.

[CmdletBinding()]
param(
  [int]$ApiPort = 4000,
  [int]$WebPort = 3000,
  [int]$InspectorPort = 9229,
  [int]$TimeoutSeconds = 240,
  [switch]$NoBrowser,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio]"
$logsDir = Get-StudioLogsDir -Root $root

if (Test-StudioTcpPort -Port $ApiPort) {
  $owner = Get-StudioPortOwner -Port $ApiPort
  if (-not (Test-StudioApiReady -Port $ApiPort)) {
    Write-StudioError $prefix "PORT $ApiPort ALREADY IN USE BY UNKNOWN PROCESS (pid $($owner.Pid), name $($owner.Name))."
    Write-StudioError $prefix "Command line: $($owner.CommandLine)"
    exit 1
  }
}

if (Test-StudioTcpPort -Port $WebPort) {
  $owner = Get-StudioPortOwner -Port $WebPort
  if (-not (Test-StudioOwnedByWorkspace -Owner $owner -Root $root)) {
    Write-StudioError $prefix "PORT $WebPort ALREADY IN USE BY UNKNOWN PROCESS (pid $($owner.Pid), name $($owner.Name))."
    Write-StudioError $prefix "Command line: $($owner.CommandLine)"
    exit 1
  }
}

Write-StudioInfo $prefix "Ensuring the database tunnel (no migrations, no seeds, no resets)."
$tunnel = Start-StudioDbTunnel -Root $root -Prefix "[Studio DB]"

$services = @(
  [pscustomobject]@{
    Name      = "api"
    Workspace = "@fullpos-ad-studio/api"
    Url       = "http://localhost:$ApiPort/health"
    Port      = $ApiPort
    Env       = @{ PORT = "$ApiPort" }
    Ready     = (Test-StudioApiReady -Port $ApiPort)
  },
  [pscustomobject]@{
    Name      = "web"
    Workspace = "@fullpos-ad-studio/web"
    Url       = "http://localhost:$WebPort"
    Port      = $WebPort
    Env       = @{ NEXT_PUBLIC_API_BASE_URL = "http://localhost:$ApiPort" }
    Ready     = (Test-StudioWebReady -Port $WebPort)
  }
)

$started = @()

foreach ($service in $services) {
  if ($service.Ready) {
    Write-StudioOk $prefix "$($service.Name): reusing the instance already listening on port $($service.Port)."
    $owner = Get-StudioPortOwner -Port $service.Port
    $started += [pscustomobject]@{ name = $service.Name; workspace = $service.Workspace; url = $service.Url; port = $service.Port; pid = $owner.Pid; reused = $true }
    continue
  }

  $stdout = Join-Path $logsDir "$($service.Name).dev.out.log"
  $stderr = Join-Path $logsDir "$($service.Name).dev.err.log"
  $devScript = if ($service.Name -eq "api") { "dev:debug" } else { "dev" }
  $envBlock = ""
  foreach ($key in $service.Env.Keys) {
    $value = [string]$service.Env[$key]
    $envBlock += "Set-Item -Path Env:$key -Value '$($value.Replace("'", "''"))'; "
  }
  # Redirection happens inside the detached child so nothing holds this terminal's handles.
  $command = "$envBlock npm.cmd run $devScript --workspace $($service.Workspace) 1> '$stdout' 2> '$stderr'"

  $processId = Start-StudioDetachedProcess -Command $command -Root $root

  Write-StudioOk $prefix "Started $($service.Name) (pid $processId) -> log: storage/temp/logs/$($service.Name).dev.out.log"
  $started += [pscustomobject]@{ name = $service.Name; workspace = $service.Workspace; url = $service.Url; port = $service.Port; pid = $processId; reused = $false }
}

$state = [pscustomobject]@{
  startedAt = (Get-Date).ToString("o")
  root      = $root
  tunnel    = [pscustomobject]@{ pid = $tunnel.Pid; port = $tunnel.Port; startedByUs = [bool]$tunnel.Started }
  services  = $started
}
$state | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Get-StudioPidFile -Root $root)

$waitArgs = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "wait-for-studio.ps1"),
  "-ApiPort", "$ApiPort", "-WebPort", "$WebPort", "-InspectorPort", "$InspectorPort",
  "-TimeoutSeconds", "$TimeoutSeconds"
)
if (-not $NoBrowser) { $waitArgs += "-OpenBrowser" }

& powershell.exe @waitArgs
$waitExit = $LASTEXITCODE

if ($waitExit -ne 0) {
  Write-StudioError $prefix "The stack did not become ready. Review the logs:"
  foreach ($service in $started) {
    Write-Host "  $($service.name): storage/temp/logs/$($service.name).dev.out.log"
  }
  exit $waitExit
}

Write-StudioInfo $prefix "Stop everything with: npm run dev:studio:stop  (or the VS Code task 'Studio: Stop Dev')."

if ($Foreground) {
  Write-StudioInfo $prefix "Press Ctrl+C to stop watching; the servers keep running in the background."
  while ($true) { Start-Sleep -Seconds 3600 }
}
