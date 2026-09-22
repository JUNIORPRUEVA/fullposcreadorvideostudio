# Smoke test REAL del motor de voz.
#
#   npm run voice:smoke            (o: powershell -File scripts/voice/voice-smoke.ps1)
#
# Comprueba, contra el motor de verdad (no mocks):
#   1. /health usable y voz disponible.
#   2. El mismo texto + la misma voz produce 3 archivos WAV validos, con la misma
#      configuracion (asi se demuestra la consistencia dia a dia).
#   3. Un guion de varios parrafos se trocea y se vuelve a unir en orden.
#   4. (Si hay FFmpeg) el MP3 tambien se genera.
# Si el motor no esta arrancado, este script lo arranca y lo detiene al terminar.
[CmdletBinding()]
param(
  [int]$Port = 4310,
  [string]$Voice = "ef_dora",
  [switch]$KeepAlive
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EngineDir = Join-Path $Root "voice-engine"
$VenvPython = Join-Path $EngineDir ".venv\Scripts\python.exe"
$BaseUrl = "http://127.0.0.1:$Port"

$Failures = New-Object System.Collections.Generic.List[string]
$StartedHere = $false
$EngineProcess = $null

function Say([string]$Message, [string]$Color = "Gray") { Write-Host $Message -ForegroundColor $Color }
function Pass([string]$Message) { Write-Host "  PASS  $Message" -ForegroundColor Green }
function Fail([string]$Message) {
  Write-Host "  FAIL  $Message" -ForegroundColor Red
  $Failures.Add($Message) | Out-Null
}

function Test-EngineUp {
  try {
    Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 4 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-JsonPath([string]$RelativePath) {
  # El motor devuelve rutas relativas a la raiz de storage
  # (p. ej. "generated-audio/2026-09-22/ef_dora-xxxx.wav").
  return (Join-Path $Root ("storage\" + ($RelativePath -replace "/", "\")))
}

function Invoke-Synthesis {
  param([string]$Text, [string]$Format = "wav", [int]$PauseMs = 300)
  $payload = '{"text":' + (ConvertTo-Json -InputObject $Text -Compress) +
             ',"voice":"' + $Voice + '","speed":1.0,"pauseMs":' + $PauseMs + ',"format":"' + $Format + '"}'
  return Invoke-RestMethod -Uri "$BaseUrl/synthesize" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 900
}

function Assert-AudioFile {
  param([string]$Label, $Result)
  $file = Get-JsonPath $Result.relativePath
  if (-not (Test-Path -LiteralPath $file)) { Fail "$Label : el archivo no existe ($file)"; return $null }
  $size = (Get-Item -LiteralPath $file).Length
  if ($size -le 1024) { Fail "$Label : el archivo es sospechosamente pequeno ($size bytes)"; return $null }
  $probe = & ffprobe -v error -show_entries format=duration,format_name -of json $file 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "$Label : ffprobe no pudo leer el archivo (posible corrupcion)"; return $null }
  $info = $probe | ConvertFrom-Json
  $duration = [double]$info.format.duration
  if ($duration -le 0) { Fail "$Label : duracion $duration (debe ser mayor que cero)"; return $null }
  Pass "$Label : $([System.IO.Path]::GetFileName($file)) · $duration s · $([math]::Round($size/1024)) KB · $($info.format.format_name)"
  return [pscustomobject]@{ File = $file; Duration = $duration; Size = $size; Result = $Result }
}

Say "`n=== FullPOS Voice Studio · smoke test real del motor de voz ===" "Cyan"
if (-not (Test-Path -LiteralPath $VenvPython)) {
  Say "No existe el entorno del motor. Ejecuta primero: npm run voice:setup" "Yellow"
  exit 1
}

# ---------------------------------------------------------------- arranque
if (Test-EngineUp) {
  Say "El motor ya estaba activo en $BaseUrl" "DarkGray"
} else {
  Say "Arrancando el motor en $BaseUrl ..." "DarkGray"
  $env:VOICE_ENGINE_PORT = "$Port"
  $EngineProcess = Start-Process -FilePath $VenvPython -ArgumentList "-m", "voice_engine" -WorkingDirectory $EngineDir -PassThru -WindowStyle Hidden
  $StartedHere = $true
  $deadline = (Get-Date).AddSeconds(240)
  while (-not (Test-EngineUp)) {
    if ((Get-Date) -gt $deadline) {
      # No dejamos un proceso a medias si nunca llego a responder.
      Stop-Process -Id $EngineProcess.Id -Force -ErrorAction SilentlyContinue
      Say "El motor no respondio en 240 s." "Red"
      exit 1
    }
    Start-Sleep -Milliseconds 800
  }
  Say "Motor arrancado (pid $($EngineProcess.Id))" "DarkGray"
}

try {
  # ------------------------------------------------------------- 1) health
  Say "`n[1] Estado del motor" "Cyan"
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 30
  if ($health.usable) { Pass "status=$($health.status) · motor $($health.engine.version) · espeak=$($health.espeak.source)" }
  else { Fail "El motor no esta usable: $($health.reason)" }
  Pass "formatos disponibles: $($health.formats -join ', ')"
  Say "       modelo: $($health.model) · device: $($health.device) · python: $($health.python)" "DarkGray"

  # -------------------------------------------------------------- 2) voces
  Say "`n[2] Voces en espanol" "Cyan"
  $voicesResponse = Invoke-RestMethod -Uri "$BaseUrl/voices" -TimeoutSec 60
  $voiceIds = @($voicesResponse.voices | ForEach-Object { $_.id })
  Pass "detectadas ($($voicesResponse.source)): $($voiceIds -join ', ')"
  if ($voiceIds -contains $Voice) { Pass "la voz de prueba '$Voice' esta disponible" }
  else { Fail "la voz '$Voice' no esta en la lista" }

  # ----------------------------------------------- 3) misma voz, 3 veces
  Say "`n[3] Consistencia: el mismo texto, 3 veces, con la misma voz" "Cyan"
  $fixedText = "Bienvenido a FullPOS Cloud. Esta es una prueba del nuevo estudio de voz."
  $runs = @()
  for ($index = 1; $index -le 3; $index++) {
    $assignment = Invoke-Synthesis -Text $fixedText
    $checked = Assert-AudioFile -Label "generacion $index" -Result $assignment
    if ($checked) { $runs += $checked }
  }
  if ($runs.Count -eq 3) {
    $durations = @($runs | ForEach-Object { [math]::Round($_.Duration, 2) } | Select-Object -Unique)
    if ($durations.Count -eq 1) { Pass "las 3 generaciones duran exactamente lo mismo ($($durations[0]) s)" }
    else { Fail "las 3 generaciones no coinciden en duracion: $($durations -join ', ')" }
    $configs = @($runs | ForEach-Object {
      $manifestPath = [System.IO.Path]::ChangeExtension($_.File, ".json")
      if (-not (Test-Path -LiteralPath $manifestPath)) { return "sin-manifiesto" }
      $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      "$($manifest.result.voice)|$($manifest.result.speed)|$($manifest.result.pauseMs)|$($manifest.result.engine)"
    } | Select-Object -Unique)
    if ($configs.Count -eq 1) { Pass "las 3 usan la misma configuracion: $($configs[0])" }
    else { Fail "configuraciones distintas entre generaciones: $($configs -join ' / ')" }

    $distinct = @($runs | ForEach-Object { $_.Result.generationId } | Select-Object -Unique).Count
    if ($distinct -eq 3) { Pass "se crearon 3 archivos distintos (no se sobrescribieron)" }
    else { Fail "se esperaban 3 archivos distintos y hay $distinct" }
  }

  # ----------------------------------------------- 4) guion de parrafos
  Say "`n[4] Chunking: guion de 3 parrafos" "Cyan"
  $paragraphs = @(
    "Bienvenido a FullPOS Cloud. En este tutorial aprenderas a configurar tu negocio.",
    "Primero registra tu empresa y tus productos. Despues podras facturar en segundos.",
    "Al terminar, revisa tus ventas del dia y comparte el resumen con tu equipo."
  )
  $longText = ($paragraphs -join "`n`n")
  $long = Invoke-Synthesis -Text $longText
  $checked = Assert-AudioFile -Label "guion largo" -Result $long
  $chunkCount = @($long.chunks).Count
  if ($chunkCount -ge 3) { Pass "se narraron $chunkCount fragmentos (troceo activo)" }
  else { Fail "se esperaban al menos 3 fragmentos y hubo $chunkCount" }

  if (-not $checked) {
    Fail "no se pudo verificar el audio del guion largo"
  } else {
    $manifest = Get-Content -LiteralPath ([System.IO.Path]::ChangeExtension($checked.File, ".json")) -Raw | ConvertFrom-Json
    $expectedOrder = @($paragraphs | ForEach-Object { $_.Length })
    $actualOrder = @($manifest.result.chunks | ForEach-Object { $_.characters })
    if (($expectedOrder -join ",") -eq ($actualOrder -join ",")) { Pass "los fragmentos conservan el orden y el texto del guion" }
    else { Fail "orden/tamano de fragmentos inesperado: $($actualOrder -join ',') vs $($expectedOrder -join ',')" }

    if ($runs.Count -ge 1 -and $checked.Duration -gt $runs[0].Duration) { Pass "el guion largo dura mas que el texto corto ($($checked.Duration) s > $($runs[0].Duration) s)" }
    else { Fail "el guion largo no duro mas que el corto" }
  }

  # ------------------------------------------------------------ 5) MP3
  Say "`n[5] MP3 (solo si hay FFmpeg)" "Cyan"
  if ($health.formats -contains "mp3") {
    $mp3 = Invoke-Synthesis -Text "Prueba de formato MP3 desde el estudio de voz." -Format "mp3" -PauseMs 0
    $mp3Checked = Assert-AudioFile -Label "mp3" -Result $mp3
    if ($mp3Checked) { Pass "MP3 validado (FFmpeg reutilizado del sistema)" }
  } else {
    Say "  SKIP  FFmpeg no disponible: el WAV funciona igual." "Yellow"
  }
} finally {
  if ($StartedHere -and -not $KeepAlive -and $EngineProcess) {
    Say "`nDeteniendo el motor (pid $($EngineProcess.Id))..." "DarkGray"
    Stop-Process -Id $EngineProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

Say ""
if ($Failures.Count -eq 0) {
  Say "SMOKE TEST: PASS" "Green"
  Say "Los audios quedaron en storage\generated-audio" "DarkGray"
  exit 0
}
Say "SMOKE TEST: FAIL ($($Failures.Count) problema(s))" "Red"
$Failures | ForEach-Object { Say "  - $_" "Red" }
exit 1
