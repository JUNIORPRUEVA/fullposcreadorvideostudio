# Shared helpers for the FULLPOS VIDEO STUDIO local development environment.
# Targets Windows PowerShell 5.1 (the version VS Code tasks spawn) and PowerShell 7+.

function Get-StudioRoot {
  param([string]$ScriptRoot = $PSScriptRoot)
  return (Resolve-Path (Join-Path $ScriptRoot "..\..")).Path
}

function Read-StudioEnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$") {
      $values[$Matches[1]] = $Matches[2]
    }
  }
  return $values
}

function Get-StudioApiEnv {
  param([Parameter(Mandatory = $true)][string]$Root)
  return (Read-StudioEnvFile -Path (Join-Path $Root "apps\api\.env"))
}

# Sanitized view of DATABASE_URL. Never returns user, password or query secrets.
function Get-StudioDatabaseReport {
  param([string]$DatabaseUrl)
  $report = [ordered]@{
    Provider = "(none)"
    Host     = "(none)"
    Port     = 0
    Name     = "(none)"
    Schema   = "(none)"
    Present  = $false
  }
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) { return [pscustomobject]$report }
  $match = [regex]::Match($DatabaseUrl, "^(?<scheme>[A-Za-z0-9+]+)://(?:[^@/]*@)?(?<host>[^:/?]+)(?::(?<port>\d+))?/(?<name>[^?]*)")
  if (-not $match.Success) {
    $report.Provider = "unknown"
    $report.Present = $true
    return [pscustomobject]$report
  }
  $scheme = $match.Groups["scheme"].Value.ToLowerInvariant()
  $report.Provider = switch ($scheme) { "postgresql" { "postgresql" } "postgres" { "postgresql" } "file" { "sqlite" } default { $scheme } }
  $report.Host = $match.Groups["host"].Value
  $port = 0
  if ($match.Groups["port"].Success) { $port = [int]$match.Groups["port"].Value }
  $report.Port = $port
  $report.Name = $match.Groups["name"].Value
  $report.Present = $true
  $schemaMatch = [regex]::Match($DatabaseUrl, "[?&]schema=(?<schema>[^&]+)")
  if ($schemaMatch.Success) { $report.Schema = $schemaMatch.Groups["schema"].Value }
  return [pscustomobject]$report
}

function Test-StudioTcpPort {
  param([Parameter(Mandatory = $true)][int]$Port, [int]$TimeoutMs = 500, [string]$Server = "127.0.0.1")
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($Server, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# Keeps a VS Code background task alive while its service is up, and returns on its own once the
# service is gone (so ending the debug session never leaves idle task shells behind).
function Wait-StudioServiceAlive {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Probe,
    [string]$Prefix = "[Studio]",
    [int]$GraceSeconds = 15,
    [int]$PollSeconds = 3
  )
  $failingSince = $null
  while ($true) {
    Start-Sleep -Seconds $PollSeconds
    $alive = $false
    try { $alive = [bool](& $Probe) } catch { $alive = $false }
    if ($alive) {
      $failingSince = $null
      continue
    }
    if (-not $failingSince) { $failingSince = Get-Date; continue }
    if (((Get-Date) - $failingSince).TotalSeconds -ge $GraceSeconds) {
      Write-StudioWarn $Prefix "$Label is no longer running: closing this task."
      return
    }
  }
}

function Get-StudioPortOwner {
  param([Parameter(Mandatory = $true)][int]$Port)
  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return $null }
  $ownerPid = [int]$listener.OwningProcess
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
  $name = "unknown"
  $commandLine = ""
  if ($process) {
    $name = [string]$process.Name
    $commandLine = [string]$process.CommandLine
  }
  return [pscustomobject]@{
    Port        = $Port
    Pid         = $ownerPid
    Name        = $name
    CommandLine = $commandLine
  }
}

# Markers that identify a process as belonging to this studio workspace: the repository path,
# the npm workspace names of apps/*, and the dev script names of this folder.
function Get-StudioProcessMarkers {
  param([Parameter(Mandatory = $true)][string]$Root)
  $markers = @($Root)
  foreach ($workspace in @("api", "web")) {
    $packagePath = Join-Path $Root "apps\$workspace\package.json"
    if (Test-Path -LiteralPath $packagePath) {
      try {
        $package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
        if ($package.name) { $markers += [string]$package.name }
      } catch {
        # package.json unreadable: the repository path marker still applies
      }
    }
  }
  foreach ($script in @("vscode-dev-api.ps1", "vscode-dev-web.ps1", "start-studio.ps1", "wait-for-studio.ps1", "db-tunnel.ps1", "dev\\studio-common.ps1")) {
    $markers += $script
  }
  return $markers
}

# True when the listening process was started from this repository (safe to touch).
function Test-StudioOwnedByWorkspace {
  param($Owner, [Parameter(Mandatory = $true)][string]$Root)
  if (-not $Owner) { return $false }
  $commandLine = [string]$Owner.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
  $haystack = $commandLine.Replace("\", "/").ToLowerInvariant()
  foreach ($marker in (Get-StudioProcessMarkers -Root $Root)) {
    if ([string]::IsNullOrWhiteSpace($marker)) { continue }
    $needle = ([string]$marker).Replace("\", "/").ToLowerInvariant()
    if ($haystack.Contains($needle)) { return $true }
  }
  return $false
}

function Get-StudioApiHealth {
  param([int]$Port = 4000)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri "http://localhost:$Port/health"
    if ($response.StatusCode -ne 200) { return $null }
    return ($response.Content | ConvertFrom-Json)
  } catch {
    return $null
  }
}

# The API is confirmed to be THIS project (service marker in /health), not just any listener on the port.
function Test-StudioApiReady {
  param([int]$Port = 4000)
  $health = Get-StudioApiHealth -Port $Port
  if (-not $health) { return $false }
  if ($health.service -ne "fullpos-video-studio-api") { return $false }
  return [bool]$health.ok
}

function Test-StudioWebReady {
  param([int]$Port = 3000)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri "http://localhost:$Port/"
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-StudioInspectorStatus {
  param([int]$Port = 9229)
  if (-not (Test-StudioTcpPort -Port $Port -TimeoutMs 300)) { return "not-listening" }
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$Port/json/list"
    if ($response.StatusCode -eq 200) { return "listening" }
    return "listening"
  } catch {
    return "listening"
  }
}

function Write-StudioInfo {
  param([string]$Prefix, [string]$Message)
  Write-Host "$Prefix $Message" -ForegroundColor Gray
}

# Starts a fully detached background process (no console/stdio inheritance), so the terminal that
# ran the command gets its prompt back immediately while the service keeps running.
function Start-StudioDetachedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $inner = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$Root'; $Command`""
  $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $inner }
  if ($result.ReturnValue -ne 0 -or -not $result.ProcessId) {
    throw "Could not start a detached process (WMI return code $($result.ReturnValue))."
  }
  return [int]$result.ProcessId
}

function Write-StudioOk {
  param([string]$Prefix, [string]$Message)
  Write-Host "$Prefix $Message" -ForegroundColor Green
}

function Write-StudioWarn {
  param([string]$Prefix, [string]$Message)
  Write-Host "$Prefix $Message" -ForegroundColor Yellow
}

function Write-StudioError {
  param([string]$Prefix, [string]$Message)
  Write-Host "$Prefix $Message" -ForegroundColor Red
}

function Get-StudioLogsDir {
  param([Parameter(Mandatory = $true)][string]$Root)
  $logsDir = Join-Path $Root "storage\temp\logs"
  New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
  return $logsDir
}

function Get-StudioPidFile {
  param([Parameter(Mandatory = $true)][string]$Root)
  return (Join-Path (Get-StudioLogsDir -Root $Root) "studio-dev.pids.json")
}

# The API loads DATABASE_URL from apps/api/.env. When that URL points at 127.0.0.1:<port>
# the connection only works through the SSH forward defined by STUDIO_DB_SSH_* variables.
function Get-StudioDbTunnelPlan {
  param([Parameter(Mandatory = $true)][string]$Root)
  $env = Get-StudioApiEnv -Root $Root
  $report = Get-StudioDatabaseReport -DatabaseUrl ([string]$env["DATABASE_URL"])
  $sshHost = [string]$env["STUDIO_DB_SSH_HOST"]
  $sshKey = [string]$env["STUDIO_DB_SSH_KEY"]
  $localHosts = @("127.0.0.1", "localhost", "::1")
  $needsTunnel = $report.Present -and ($localHosts -contains $report.Host) -and $report.Port -gt 0 -and -not [string]::IsNullOrWhiteSpace($sshHost) -and -not [string]::IsNullOrWhiteSpace($sshKey)
  return [pscustomobject]@{
    NeedsTunnel = $needsTunnel
    Port        = $report.Port
    SshHost     = $sshHost
    SshKey      = $sshKey
    Report      = $report
  }
}

# Ensures the SSH database forward is up. Reuses an existing ssh tunnel, never kills unknown processes.
function Start-StudioDbTunnel {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$Prefix = "[Studio DB]"
  )
  $plan = Get-StudioDbTunnelPlan -Root $Root
  if (-not $plan.NeedsTunnel) {
    Write-StudioInfo $Prefix "No SSH tunnel required for the configured DATABASE_URL (host $($plan.Report.Host))."
    return [pscustomobject]@{ Started = $false; Reused = $false; Pid = 0; Port = $plan.Port; NeedsTunnel = $false; Report = $plan.Report }
  }

  $logsDir = Get-StudioLogsDir -Root $Root
  $pidFile = Join-Path $logsDir "studio-db-tunnel.pid"

  if (Test-StudioTcpPort -Port $plan.Port) {
    $owner = Get-StudioPortOwner -Port $plan.Port
    if ($owner -and $owner.Name -eq "ssh.exe") {
      Write-StudioOk $Prefix "Reusing the SSH tunnel already listening on 127.0.0.1:$($plan.Port) (pid $($owner.Pid))."
      return [pscustomobject]@{ Started = $false; Reused = $true; Pid = $owner.Pid; Port = $plan.Port; NeedsTunnel = $true; Report = $plan.Report }
    }
    $name = "unknown"
    $ownerPid = 0
    if ($owner) {
      $name = $owner.Name
      $ownerPid = $owner.Pid
    }
    throw "PORT $($plan.Port) ALREADY IN USE BY UNKNOWN PROCESS (pid $ownerPid, name $name). It is not an SSH tunnel for the studio database. Stop that process and press F5 again."
  }

  if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
    throw "ssh.exe was not found in PATH. The studio database is reached through an SSH tunnel."
  }
  if (-not (Test-Path -LiteralPath $plan.SshKey)) {
    throw "SSH key not found: $($plan.SshKey) (STUDIO_DB_SSH_KEY in apps/api/.env)."
  }

  $stdout = Join-Path $logsDir "studio-db-tunnel.out.log"
  $stderr = Join-Path $logsDir "studio-db-tunnel.err.log"
  $tunnel = Start-Process -FilePath "ssh.exe" `
    -ArgumentList @(
      "-i", $plan.SshKey,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-N",
      "-L", "127.0.0.1:$($plan.Port):127.0.0.1:$($plan.Port)",
      $plan.SshHost
    ) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru
  Set-Content -Encoding ASCII -Path $pidFile -Value $tunnel.Id

  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    if (Test-StudioTcpPort -Port $plan.Port) {
      Write-StudioOk $Prefix "SSH tunnel to the studio database is up on 127.0.0.1:$($plan.Port) (pid $($tunnel.Id))."
      return [pscustomobject]@{ Started = $true; Reused = $false; Pid = $tunnel.Id; Port = $plan.Port; NeedsTunnel = $true; Report = $plan.Report }
    }
    if ($tunnel.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }

  $tail = ""
  if (Test-Path -LiteralPath $stderr) { $tail = (Get-Content -LiteralPath $stderr -Tail 5) -join " | " }
  throw "The SSH tunnel for the studio database did not come up on 127.0.0.1:$($plan.Port). $tail"
}

function Stop-StudioProcessTree {
  param([Parameter(Mandatory = $true)][int]$ProcessId, [string]$Root)
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  & taskkill.exe /PID $ProcessId /T /F | Out-Null
  return $true
}

# Walks up the process chain while ancestors still belong to this workspace, so callers can stop
# the whole dev tree (task shell -> npm -> cmd -> node) instead of a single child process.
function Get-StudioProcessRoot {
  param([Parameter(Mandatory = $true)][int]$ProcessId, [Parameter(Mandatory = $true)][string]$Root)
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $current) { return 0 }
  $top = $current
  $guard = 0
  while ($current -and $guard -lt 15) {
    $guard++
    $parentId = [int]$current.ParentProcessId
    if ($parentId -le 0) { break }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$parentId" -ErrorAction SilentlyContinue
    if (-not $parent) { break }
    if (-not (Test-StudioOwnedByWorkspace -Owner ([pscustomobject]@{ CommandLine = [string]$parent.CommandLine }) -Root $Root)) { break }
    $top = $parent
    $current = $parent
  }
  return [int]$top.ProcessId
}
