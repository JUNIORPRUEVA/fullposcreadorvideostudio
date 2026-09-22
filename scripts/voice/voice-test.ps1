# Pruebas del motor de voz (pytest). No necesita modelo descargado: el motor se
# prueba con un proveedor falso, asi que corre en segundos.
[CmdletBinding()]
param(
  [string]$TestPath = "tests"
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

Push-Location $EngineDir
try {
  & $VenvPython -m pytest $TestPath @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
