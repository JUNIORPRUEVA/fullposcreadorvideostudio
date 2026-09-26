$ErrorActionPreference = "Stop"

$Root = (Resolve-Path ".").Path
$LogsDir = Join-Path $Root "storage\temp\logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$ApiEnvPath = Join-Path $Root "apps\api\.env"
$ApiEnv = @{}
if (Test-Path $ApiEnvPath) {
  foreach ($Line in Get-Content -LiteralPath $ApiEnvPath) {
    if ($Line -match "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$") {
      $ApiEnv[$Matches[1]] = $Matches[2]
    }
  }
}

if (($ApiEnv["DATABASE_URL"] -match "127\.0\.0\.1:15432") -and $ApiEnv["STUDIO_DB_SSH_KEY"] -and $ApiEnv["STUDIO_DB_SSH_HOST"]) {
  $TunnelOk = (Test-NetConnection 127.0.0.1 -Port 15432 -WarningAction SilentlyContinue).TcpTestSucceeded
  if (!$TunnelOk) {
    $TunnelOut = Join-Path $LogsDir "studio-db-tunnel.out.log"
    $TunnelErr = Join-Path $LogsDir "studio-db-tunnel.err.log"
    $Tunnel = Start-Process -FilePath "ssh.exe" `
      -ArgumentList @(
        "-i", $ApiEnv["STUDIO_DB_SSH_KEY"],
        "-o", "StrictHostKeyChecking=no",
        "-N",
        "-L", "127.0.0.1:15432:127.0.0.1:15432",
        $ApiEnv["STUDIO_DB_SSH_HOST"]
      ) `
      -WindowStyle Hidden `
      -RedirectStandardOutput $TunnelOut `
      -RedirectStandardError $TunnelErr `
      -PassThru
    Set-Content -Encoding UTF8 -Path (Join-Path $LogsDir "studio-db-tunnel.pid") -Value $Tunnel.Id
    Start-Sleep -Seconds 2
  }
}

$Servers = @(
  @{
    Name = "backend"
    Workspace = "@fullpos-ad-studio/api"
    Url = "http://localhost:4000/health"
    Env = @{
      PORT = "4000"
    }
  },
  @{
    Name = "frontend"
    Workspace = "@fullpos-ad-studio/web"
    Url = "http://localhost:3000"
    Env = @{
      NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000"
    }
  }
)

$Started = @()

foreach ($Server in $Servers) {
  $Out = Join-Path $LogsDir "$($Server.Name).out.log"
  $Err = Join-Path $LogsDir "$($Server.Name).err.log"
  $EnvBlock = ""
  foreach ($Name in $Server.Env.Keys) {
    $Value = [string]$Server.Env[$Name]
    $EnvBlock += "`$env:$Name = '$($Value.Replace("'", "''"))'; "
  }
  $Command = "$EnvBlock npm.cmd run dev --workspace $($Server.Workspace)"
  $Process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", $Command) `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $Out `
    -RedirectStandardError $Err `
    -WindowStyle Hidden `
    -PassThru
  $Started += [pscustomobject]@{
    name = $Server.Name
    workspace = $Server.Workspace
    url = $Server.Url
    pid = $Process.Id
  }
}

$PidFile = Join-Path $LogsDir "local-servers.pids.json"
$Started | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $PidFile

foreach ($Server in $Started) {
  $Deadline = (Get-Date).AddSeconds(60)
  $LastError = ""
  while ((Get-Date) -lt $Deadline) {
    try {
      $Status = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $Server.url).StatusCode
      if ($Status -eq 200) {
        $LastError = ""
        break
      }
      $LastError = "HTTP $Status"
    } catch {
      $LastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 1
  }

  if ($LastError) {
    Get-Content -Tail 80 (Join-Path $LogsDir "$($Server.name).out.log") -ErrorAction SilentlyContinue
    Get-Content -Tail 80 (Join-Path $LogsDir "$($Server.name).err.log") -ErrorAction SilentlyContinue
    throw "$($Server.name) failed health check: $LastError"
  }
}

$Started | ConvertTo-Json -Depth 4
