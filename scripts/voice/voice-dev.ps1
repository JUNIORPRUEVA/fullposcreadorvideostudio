# Arranca el motor TTS local (se queda en primer plano: Ctrl+C para detenerlo).
#
# No hace `reload`: el modelo Kokoro se carga UNA sola vez por proceso, que es
# justo lo que se necesita para narrar varios fragmentos sin recargar pesos.
[CmdletBinding()]
param(
  [int]$Port = 4310,
  [string]$BindHost = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EngineDir = Join-Path $Root "voice-engine"
$VenvPython = Join-Path $EngineDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $VenvPython)) {
  Write-Host "No existe el entorno del motor de voz." -ForegroundColor Yellow
  Write-Host "Ejecuta primero:  npm run voice:setup" -ForegroundColor Yellow
  exit 1
}

$env:VOICE_ENGINE_PORT = "$Port"
if ($BindHost) { $env:VOICE_ENGINE_HOST = $BindHost }

Write-Host "FullPOS Voice Engine -> http://${BindHost}:${Port} (solo local)" -ForegroundColor Cyan
Write-Host "Health: http://${BindHost}:${Port}/health" -ForegroundColor DarkGray
Write-Host "Detener: Ctrl+C" -ForegroundColor DarkGray

Push-Location $EngineDir
try {
  & $VenvPython -m voice_engine
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
