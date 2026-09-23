# FullPOS Voice Studio - arranque simple en Windows (Fase 2).
#
# Un solo paso: comprueba dependencias y puertos, arranca SOLO lo que falta
# (motor de voz + API + web), espera con health checks reales y abre el navegador
# en http://localhost:<WebPort>/voice-studio.
#
# Reglas:
#   * Nunca duplica procesos: si un componente del estudio ya responde, se reutiliza.
#   * Nunca mata procesos ajenos: si un puerto esta ocupado por otra cosa, se informa
#     el pid/proceso y se aborta con codigo 1.
#   * No toca produccion, no despliega, no ejecuta migraciones ni seeds.
#   * Si algo falla, informa por componente y deja el log para revisarlo.
[CmdletBinding()]
param(
  [int]$EnginePort = 4310,
  [int]$ApiPort = 4000,
  [int]$WebPort = 3000,
  [int]$TimeoutSeconds = 240,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\dev\studio-common.ps1")

$Root = Get-StudioRoot -ScriptRoot $PSScriptRoot
$Prefix = "[Voz]"
$EngineDir = Join-Path $Root "voice-engine"
$VenvPython = Join-Path $EngineDir ".venv\Scripts\python.exe"
$LogsDir = Get-StudioLogsDir -Root $Root
$PidFile = Join-Path $LogsDir "voice-studio.pids.json"
$Url = "http://localhost:$WebPort/voice-studio"
$Started = New-Object System.Collections.ArrayList
$Failures = New-Object System.Collections.ArrayList

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

function Get-VoiceEngineReport {
  param([int]$Port = 4310)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$Port/health"
    if ($response.StatusCode -ne 200) { return $null }
    return ($response.Content | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Test-VoiceEngineReady {
  param([int]$Port = 4310)
  $report = Get-VoiceEngineReport -Port $Port
  if (-not $report) { return $false }
  return ($report.usable -eq $true)
}

function Test-VoicePageReady {
  param([int]$Port = 3000)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri "http://localhost:$Port/voice-studio"
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Add-Started {
  param([string]$Name, [int]$ProcessId, [int]$Port, [string]$Log)
  [void]$Started.Add([pscustomobject]@{ name = $Name; pid = $ProcessId; port = $Port; log = $Log })
}

function Add-Failure {
  param([string]$Name, [string]$Message)
  [void]$Failures.Add([pscustomobject]@{ name = $Name; message = $Message })
}

# ---------------------------------------------------------------- dependencias

Write-Host "FullPOS Voice Studio - arranque local" -ForegroundColor White
Write-Step "Comprobando dependencias"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-StudioError $Prefix "No hay Node.js en el PATH. Instala Node.js 20+ y vuelve a intentar."
  exit 1
}
Write-StudioOk $Prefix "Node.js $(& $node.Source --version)"

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules"))) {
  Write-StudioError $Prefix "Faltan las dependencias de JavaScript. Ejecuta:  npm install"
  exit 1
}
Write-StudioOk $Prefix "Dependencias de JavaScript instaladas (node_modules)."

if (-not (Test-Path -LiteralPath $VenvPython)) {
  Write-StudioError $Prefix "No existe el entorno del motor de voz (voice-engine\.venv)."
  Write-StudioError $Prefix "Ejecuta primero:  npm run voice:setup"
  exit 1
}
Write-StudioOk $Prefix "Entorno del motor de voz listo."

$piperRoot = Join-Path $EngineDir "voices\piper\es"
if (Test-Path -LiteralPath $piperRoot) {
  Write-StudioOk $Prefix "Voces latinas de Piper descargadas (espanol latinoamericano)."
} else {
  Write-StudioWarn $Prefix "No hay voces de Piper en voice-engine\voices\piper."
  Write-StudioWarn $Prefix "Kokoro funciona igual; para bajar las latinas:  npm run voice:setup"
}

# ------------------------------------------------------------------- motor TTS

Write-Step "Motor de voz (Kokoro + Piper) en 127.0.0.1:$EnginePort"
$engineState = "reutilizado"
if (Test-StudioTcpPort -Port $EnginePort) {
  if (Test-VoiceEngineReady -Port $EnginePort) {
    $report = Get-VoiceEngineReport -Port $EnginePort
    $engines = @($report.engines | ForEach-Object { $_.id }) -join " + "
    Write-StudioOk $Prefix "Ya estaba en marcha y responde /health (motores: $engines). No se arranca otro."
  } else {
    $owner = Get-StudioPortOwner -Port $EnginePort
    Write-StudioError $Prefix "El puerto $EnginePort esta ocupado por pid $($owner.Pid) ($($owner.Name)) y no responde como motor de este estudio."
    Write-StudioError $Prefix "Linea de comandos: $($owner.CommandLine)"
    Write-StudioError $Prefix "Cierra ese proceso y vuelve a intentar. No se ha tocado nada."
    exit 1
  }
} else {
  $engineLog = Join-Path $LogsDir "voice-engine.out.log"
  $enginePid = Start-StudioDetachedProcess -Root $Root -Command "Set-Location '$EngineDir'; & '$VenvPython' -m voice_engine *> '$engineLog'"
  Add-Started -Name "motor" -ProcessId $enginePid -Port $EnginePort -Log $engineLog
  $engineState = "arrancado"
  Write-StudioOk $Prefix "Arrancado (pid $enginePid). Log: $engineLog"
}

# --------------------------------------------------------- base de datos (opcional)

$dbPlan = $null
try { $dbPlan = Get-StudioDbTunnelPlan -Root $Root } catch { $dbPlan = $null }

# -------------------------------------------------------------------- API

Write-Step "API del estudio en http://localhost:$ApiPort"
$apiState = "reutilizada"
if (Test-StudioApiReady -Port $ApiPort) {
  Write-StudioOk $Prefix "Ya estaba en marcha y responde /health con el marcador del estudio. No se arranca otra."
} else {
  if ($dbPlan -and $dbPlan.NeedsTunnel -and -not (Test-StudioTcpPort -Port $dbPlan.Port)) {
    Write-StudioWarn $Prefix "La API necesita el tunel SSH de la base de datos (puerto $($dbPlan.Port)). Se arranca sin tocar datos."
    $tunnelLog = Join-Path $LogsDir "voice-db-tunnel.out.log"
    $tunnelPid = Start-StudioDetachedProcess -Root $Root -Command "& '$Root\scripts\dev\db-tunnel.ps1' *> '$tunnelLog'"
    Add-Started -Name "tunel-bd" -ProcessId $tunnelPid -Port ([int]$dbPlan.Port) -Log $tunnelLog
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline -and -not (Test-StudioTcpPort -Port $dbPlan.Port)) { Start-Sleep -Milliseconds 500 }
  }

  $apiLog = Join-Path $LogsDir "voice-api.out.log"
  $apiPid = Start-StudioDetachedProcess -Root $Root -Command "& '$Root\scripts\vscode-dev-api.ps1' *> '$apiLog'"
  Add-Started -Name "api" -ProcessId $apiPid -Port $ApiPort -Log $apiLog
  $apiState = "arrancada"
  Write-StudioOk $Prefix "Arrancada (pid $apiPid). Log: $apiLog"
}

# -------------------------------------------------------------------- web

Write-Step "Interfaz web en $Url"
$webState = "reutilizada"
if (Test-StudioWebReady -Port $WebPort) {
  Write-StudioOk $Prefix "Ya estaba en marcha y responde HTTP 200. No se arranca otra."
} else {
  $webLog = Join-Path $LogsDir "voice-web.out.log"
  $webPid = Start-StudioDetachedProcess -Root $Root -Command "& '$Root\scripts\vscode-dev-web.ps1' *> '$webLog'"
  Add-Started -Name "web" -ProcessId $webPid -Port $WebPort -Log $webLog
  $webState = "arrancada"
  Write-StudioOk $Prefix "Arrancada (pid $webPid). Log: $webLog"
}

# ------------------------------------------------- guardar pids de lo arrancado

if ($Started.Count -gt 0) {
  $state = [pscustomobject]@{ startedAt = (Get-Date).ToString("o"); root = $Root; script = "scripts/voice/start-voice-studio.ps1"; components = @($Started) }
  $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $PidFile -Encoding UTF8
  Write-StudioInfo $Prefix "Se guardaron los pids de lo arrancado en $PidFile (para 'Stop-Voice-Studio.cmd')."
} else {
  Write-StudioInfo $Prefix "No se arranco ningun proceso nuevo: todo el estudio ya estaba en marcha."
}

# --------------------------------------------------------- espera con health checks

Write-Step "Esperando a que los componentes respondan (maximo $TimeoutSeconds s)"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$engineOk = Test-VoiceEngineReady -Port $EnginePort
$apiOk = Test-StudioApiReady -Port $ApiPort
$webOk = Test-StudioWebReady -Port $WebPort
$pageOk = $false

while ((Get-Date) -lt $deadline) {
  if (-not $engineOk) { $engineOk = Test-VoiceEngineReady -Port $EnginePort }
  if (-not $apiOk) { $apiOk = Test-StudioApiReady -Port $ApiPort }
  if (-not $webOk) { $webOk = Test-StudioWebReady -Port $WebPort }
  if ($webOk -and -not $pageOk) { $pageOk = Test-VoicePageReady -Port $WebPort }
  if ($engineOk -and $apiOk -and $pageOk) { break }
  Start-Sleep -Seconds 2
}

if (-not $engineOk) { Add-Failure -Name "motor" -Message "El motor no responde /health en 127.0.0.1:$EnginePort con 'usable: true'." }
if (-not $apiOk) { Add-Failure -Name "API" -Message "http://localhost:$ApiPort/health no responde con el marcador del estudio." }
if (-not $webOk) { Add-Failure -Name "web" -Message "http://localhost:$WebPort/ no responde HTTP 200." }
elseif (-not $pageOk) { Add-Failure -Name "web" -Message "http://localhost:$WebPort/voice-studio no responde HTTP 200." }

# -------------------------------------------------------------------- resumen

Write-Step "Resumen"
$engineReport = Get-VoiceEngineReport -Port $EnginePort

$engineDetail = "sin respuesta"
if ($engineReport) {
  $engineNames = @($engineReport.engines | ForEach-Object { "$($_.id) $($_.version)" }) -join " + "
  $engineDetail = "$engineNames | motores locales registrados"
}
$engineLabel = "FALLO"
if ($engineOk) { $engineLabel = "OK ($engineState)" }
$apiLabel = "FALLO"
if ($apiOk) { $apiLabel = "OK ($apiState)" }
$webLabel = "FALLO"
if ($pageOk) { $webLabel = "OK ($webState)" }

$dbPort = 0
if ($dbPlan) { $dbPort = [int]$dbPlan.Port }
$dbLabel = "no necesario"
$dbDetail = "la 'Voz FullPOS' funciona igual (queda en este navegador)"
if ($dbPlan -and $dbPlan.NeedsTunnel) {
  $dbDetail = "solo para guardar la 'Voz FullPOS' en la base de datos"
  if (Test-StudioTcpPort -Port $dbPort) { $dbLabel = "OK" } else { $dbLabel = "FALLO" }
}

$rows = @(
  [pscustomobject]@{ Componente = "Motor de voz"; Puerto = $EnginePort; Estado = $engineLabel; Detalle = $engineDetail },
  [pscustomobject]@{ Componente = "API del estudio"; Puerto = $ApiPort; Estado = $apiLabel; Detalle = "http://localhost:$ApiPort/health" },
  [pscustomobject]@{ Componente = "Interfaz web"; Puerto = $WebPort; Estado = $webLabel; Detalle = $Url },
  [pscustomobject]@{ Componente = "Tunel base de datos"; Puerto = $dbPort; Estado = $dbLabel; Detalle = $dbDetail }
)
$rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

if ($Failures.Count -gt 0) {
  Write-StudioError $Prefix "El estudio NO arranco completo. Detalle:"
  foreach ($failure in $Failures) { Write-StudioError $Prefix "$($failure.name): $($failure.message)" }
  Write-Host ""
  Write-Host "Revisa los logs en: $LogsDir" -ForegroundColor Yellow
  foreach ($component in $Started) { Write-Host "  $($component.name): $($component.log)" -ForegroundColor DarkGray }
  Write-Host ""
  Write-Host "Nada se cerro automaticamente. Vuelve a intentar cuando el error este resuelto." -ForegroundColor Yellow
  exit 1
}

Write-StudioOk $Prefix "FullPOS Voice Studio esta listo."
Write-Host "    Interfaz:      $Url" -ForegroundColor White
Write-Host "    Audios en:     storage\generated-audio" -ForegroundColor White
Write-Host "    Para cerrarlo: doble clic en Stop-Voice-Studio.cmd" -ForegroundColor White
Write-Host "    Esta ventana se puede cerrar: el estudio sigue funcionando." -ForegroundColor DarkGray

if (-not $NoBrowser) {
  try {
    Start-Process $Url | Out-Null
    Write-StudioOk $Prefix "Navegador abierto en $Url"
  } catch {
    Write-StudioWarn $Prefix "No se pudo abrir el navegador automaticamente. Abre $Url manualmente."
  }
}
