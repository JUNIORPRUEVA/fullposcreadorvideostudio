# Waits until the local FullPOS Video Studio stack (API + Web + Node inspector) is really usable.
# Prints STUDIO_DEV_READY as the last readiness line so VS Code tasks can gate on it.
# Never loops forever: exits 1 with diagnostics after -TimeoutSeconds.

[CmdletBinding()]
param(
  [int]$ApiPort = 4000,
  [int]$WebPort = 3000,
  [int]$InspectorPort = 9229,
  [int]$TimeoutSeconds = 240,
  [switch]$OpenBrowser,
  [switch]$RequireInspector,
  [switch]$StayAlive
)

. (Join-Path $PSScriptRoot "studio-common.ps1")

$root = Get-StudioRoot
$prefix = "[Studio]"
$apiUrl = "http://localhost:$ApiPort"
$webUrl = "http://localhost:$WebPort"
$healthUrl = "$apiUrl/health"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$apiReady = $false
$webReady = $false
$apiAnnounced = $false
$webAnnounced = $false

Write-StudioInfo $prefix "Waiting for API...  ($healthUrl)"

$lastHeartbeat = Get-Date
while ((Get-Date) -lt $deadline) {
  if (-not $apiReady) {
    if (-not $apiAnnounced) { $apiAnnounced = $true }
    $apiReady = Test-StudioApiReady -Port $ApiPort
    if ($apiReady) { Write-StudioOk $prefix "API ready" }
  }
  if (-not $webReady) {
    if (-not $webAnnounced) {
      Write-StudioInfo $prefix "Waiting for Web..."
      $webAnnounced = $true
    }
    $webReady = Test-StudioWebReady -Port $WebPort
    if ($webReady) { Write-StudioOk $prefix "Web ready" }
  }
  if ($apiReady -and $webReady) { break }
  if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 15) {
    $lastHeartbeat = Get-Date
    $apiState = if ($apiReady) { "ready" } else { "pending" }
    $webState = if ($webReady) { "ready" } else { "pending" }
    $remaining = [int][Math]::Max(0, ($deadline - (Get-Date)).TotalSeconds)
    Write-StudioInfo $prefix "Still starting (API: $apiState, WEB: $webState, timeout in ${remaining}s)..."
  }
  Start-Sleep -Milliseconds 1000
}

if (-not $apiReady) {
  Write-StudioError $prefix "API NOT READY after $TimeoutSeconds s ($healthUrl)."
  $owner = Get-StudioPortOwner -Port $ApiPort
  if ($owner) {
    Write-StudioError $prefix "Port $ApiPort is owned by pid $($owner.Pid) ($($owner.Name))."
  } else {
    Write-StudioError $prefix "Nothing is listening on port $ApiPort yet - check the 'Studio: API Dev' terminal for the compile error."
  }
  exit 1
}

if (-not $webReady) {
  Write-StudioError $prefix "WEB NOT READY after $TimeoutSeconds s ($webUrl)."
  $owner = Get-StudioPortOwner -Port $WebPort
  if ($owner) {
    Write-StudioError $prefix "Port $WebPort is owned by pid $($owner.Pid) ($($owner.Name))."
  } else {
    Write-StudioError $prefix "Nothing is listening on port $WebPort yet - check the 'Studio: Web Dev' terminal."
  }
  exit 1
}

$inspectorState = "not-listening"
$inspectorDeadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $inspectorDeadline) {
  $inspectorState = Get-StudioInspectorStatus -Port $InspectorPort
  if ($inspectorState -eq "listening") { break }
  Start-Sleep -Milliseconds 500
}

if ($inspectorState -eq "listening") {
  Write-StudioOk $prefix "Node inspector ready on 127.0.0.1:$InspectorPort (backend breakpoints)."
} elseif ($RequireInspector) {
  Write-StudioError $prefix "Node inspector NOT listening on 127.0.0.1:$InspectorPort. Backend breakpoints unavailable."
  exit 1
} else {
  Write-StudioWarn $prefix "Node inspector NOT listening on 127.0.0.1:${InspectorPort}: backend breakpoints will not work until the API restarts with 'dev:debug'."
}

if ($OpenBrowser) {
  Write-StudioInfo $prefix "Opening browser..."
  $chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
  if (Test-Path -LiteralPath $chrome) {
    Start-Process -FilePath $chrome -ArgumentList @($webUrl) | Out-Null
  } else {
    Start-Process $webUrl | Out-Null
  }
}

Write-StudioOk $prefix "FullPOS Video Studio local dev is ready."
Write-Host "  API   -> $apiUrl   (health: $healthUrl)"
Write-Host "  WEB   -> $webUrl"
Write-Host "  DEBUG -> 127.0.0.1:$InspectorPort (Node inspector)"
Write-Host "STUDIO_DEV_READY"

if ($StayAlive) {
  # Record what is running so "Studio: Stop Dev" can shut down exactly these processes.
  try {
    $pidFile = Get-StudioPidFile -Root $root
    $existing = $null
    if (Test-Path -LiteralPath $pidFile) {
      $existing = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
    }
    $tunnelPlan = Get-StudioDbTunnelPlan -Root $root
    $tunnelOwner = $null
    if ($tunnelPlan.NeedsTunnel) { $tunnelOwner = Get-StudioPortOwner -Port $tunnelPlan.Port }
    $tunnelStartedByUs = $false
    if ($existing -and $existing.tunnel) { $tunnelStartedByUs = [bool]$existing.tunnel.startedByUs }
    $apiOwner = Get-StudioPortOwner -Port $ApiPort
    $webOwner = Get-StudioPortOwner -Port $WebPort
    $apiPid = 0
    if ($apiOwner) { $apiPid = Get-StudioProcessRoot -ProcessId $apiOwner.Pid -Root $root }
    $webPid = 0
    if ($webOwner) { $webPid = Get-StudioProcessRoot -ProcessId $webOwner.Pid -Root $root }
    $state = [pscustomobject]@{
      startedAt = (Get-Date).ToString("o")
      root      = $root
      source    = "vscode-task"
      tunnel    = [pscustomobject]@{ pid = $(if ($tunnelOwner) { $tunnelOwner.Pid } else { 0 }); port = $tunnelPlan.Port; startedByUs = $tunnelStartedByUs }
      services  = @(
        [pscustomobject]@{ name = "api"; workspace = "@fullpos-ad-studio/api"; url = $healthUrl; port = $ApiPort; pid = $apiPid; reused = $true },
        [pscustomobject]@{ name = "web"; workspace = "@fullpos-ad-studio/web"; url = $webUrl; port = $WebPort; pid = $webPid; reused = $true }
      )
    }
    $state | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $pidFile
  } catch {
    Write-StudioWarn $prefix "Could not record the studio dev pid file: $($_.Exception.Message)"
  }

  Wait-StudioServiceAlive -Label "the API" -Prefix $prefix -GraceSeconds 20 -Probe { Test-StudioApiReady -Port $ApiPort }
}
