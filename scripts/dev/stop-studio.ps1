# FullPOS Video Studio - stops ONLY the local processes this dev environment started.
#
#   npm run dev:studio:stop            -> stops what scripts/dev/start-studio.ps1 started
#   npm run dev:studio:stop -- -Force  -> also sweeps workspace-owned listeners on the dev ports
#
# Never kills a process that does not belong to this workspace. The database is never touched.

[CmdletBinding()]
param(
  [int]$ApiPort = 4000,
  [int]$WebPort = 3000,
  [int]$TunnelPort = 15432,
  [switch]$Force
)

. (Join-Path $PSScriptRoot "studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio]"
$logsDir = Get-StudioLogsDir -Root $root
$pidFile = Get-StudioPidFile -Root $root
$stopped = @()
$skipped = 0

function Stop-StudioRecordedProcess {
  param([int]$ProcessId, [string]$Label, [string]$ExpectedName = "")

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-StudioInfo $prefix "$Label (pid $ProcessId) is no longer running."
    return
  }
  $commandLine = [string]$process.CommandLine
  $isWorkspace = Test-StudioOwnedByWorkspace -Owner ([pscustomobject]@{ CommandLine = $commandLine }) -Root $root
  $isExpected = $ExpectedName -ne "" -and ([string]$process.Name) -eq $ExpectedName

  if (-not ($isWorkspace -or $isExpected)) {
    $script:skipped++
    Write-StudioWarn $prefix "Skipping $Label (pid $ProcessId): it does not look like a process from this workspace (pid reuse?). Nothing was killed."
    return
  }

  & taskkill.exe /PID $ProcessId /T /F | Out-Null
  $script:stopped += $Label
  Write-StudioOk $prefix "Stopped $Label (pid $ProcessId)."
}

if (Test-Path -LiteralPath $pidFile) {
  $state = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
  if ($state.services) {
    foreach ($service in $state.services) {
      Stop-StudioRecordedProcess -ProcessId ([int]$service.pid) -Label "$($service.name) dev server"
    }
  }
  if ($state.tunnel -and [int]$state.tunnel.pid -gt 0) {
    Stop-StudioRecordedProcess -ProcessId ([int]$state.tunnel.pid) -Label "database SSH tunnel" -ExpectedName "ssh.exe"
  }
  if ($skipped -eq 0) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-StudioWarn $prefix "Kept $($pidFile) because $skipped recorded process(es) were skipped."
  }
} else {
  Write-StudioInfo $prefix "No studio dev pid file found (nothing was started by 'npm run dev:studio')."
}

# Tunnel pid file kept in sync with scripts/start-local-servers.ps1.
$tunnelPidFile = Join-Path $logsDir "studio-db-tunnel.pid"
if (Test-Path -LiteralPath $tunnelPidFile) {
  $tunnelPid = 0
  $rawPid = (Get-Content -Raw -LiteralPath $tunnelPidFile).Trim()
  if ([int]::TryParse($rawPid, [ref]$tunnelPid) -and $tunnelPid -gt 0 -and -not ($stopped -contains "database SSH tunnel")) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelPid" -ErrorAction SilentlyContinue
    if ($process -and [string]$process.Name -eq "ssh.exe") {
      & taskkill.exe /PID $tunnelPid /T /F | Out-Null
      Write-StudioOk $prefix "Stopped database SSH tunnel (pid $tunnelPid)."
    }
  }
  Remove-Item -LiteralPath $tunnelPidFile -Force -ErrorAction SilentlyContinue
}

# Sweep what unambiguously belongs to this studio dev environment. Always runs (the stop must be
# complete and idempotent); it only matches this repository's own dev scripts, so foreign
# processes are never touched.
foreach ($pattern in @('vscode-dev-api\.ps1', 'vscode-dev-web\.ps1', 'db-tunnel\.ps1', 'wait-for-studio\.ps1', 'start-studio\.ps1')) {
  $studioShells = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -match $pattern
  }
  foreach ($shell in $studioShells) {
    & taskkill.exe /PID $shell.ProcessId /T /F 2>&1 | Out-Null
    $stopped += "studio task shell (pid $($shell.ProcessId))"
    Write-StudioOk $prefix "Stopped studio task shell (pid $($shell.ProcessId))."
  }
}

foreach ($port in @($ApiPort, $WebPort)) {
  if (-not (Test-StudioTcpPort -Port $port)) { continue }
  $owner = Get-StudioPortOwner -Port $port
  if (Test-StudioOwnedByWorkspace -Owner $owner -Root $root) {
    # Stop the whole workspace tree (task shell -> npm -> cmd -> node), not only the listener.
    $treePid = Get-StudioProcessRoot -ProcessId $owner.Pid -Root $root
    & taskkill.exe /PID $treePid /T /F 2>&1 | Out-Null
    $stopped += "workspace process tree on port $port (root pid $treePid)"
    Write-StudioOk $prefix "Stopped the workspace process tree on port $port (root pid $treePid, listener pid $($owner.Pid))."
  } else {
    Write-StudioWarn $prefix "Port $port is used by pid $($owner.Pid) ($($owner.Name)) and was NOT started by this workspace: left untouched."
  }
}

if ($stopped.Count -eq 0 -and $skipped -eq 0) {
  Write-StudioInfo $prefix "Nothing to stop: the studio dev environment is already clean."
}

Start-Sleep -Milliseconds 700

Write-StudioInfo $prefix "Verification:"
foreach ($entry in @(
    [pscustomobject]@{ Name = "API"; Port = $ApiPort },
    [pscustomobject]@{ Name = "WEB"; Port = $WebPort },
    [pscustomobject]@{ Name = "DB tunnel"; Port = $TunnelPort }
  )) {
  if (Test-StudioTcpPort -Port $entry.Port) {
    $owner = Get-StudioPortOwner -Port $entry.Port
    Write-StudioWarn $prefix "$($entry.Name) port $($entry.Port) is still listening (pid $($owner.Pid), name $($owner.Name))."
  } else {
    Write-StudioOk $prefix "$($entry.Name) port $($entry.Port) is free."
  }
}
