$ErrorActionPreference = "Stop"

$Root = (Resolve-Path ".").Path
$LogsDir = Join-Path $Root "storage\temp\logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$Servers = @(
  @{ Name = "backend"; Workspace = "@fullpos-ad-studio/api"; Url = "http://localhost:4000/projects" },
  @{ Name = "frontend"; Workspace = "@fullpos-ad-studio/web"; Url = "http://localhost:3000" }
)

$Started = @()

foreach ($Server in $Servers) {
  $Out = Join-Path $LogsDir "$($Server.Name).out.log"
  $Err = Join-Path $LogsDir "$($Server.Name).err.log"
  $Process = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--workspace", $Server.Workspace) `
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
