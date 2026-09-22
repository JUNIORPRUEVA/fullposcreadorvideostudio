# Instala el motor TTS local de FullPOS Voice Studio (Fase 1).
#
# Que hace:
#   1. Comprueba que exista un CPython compatible (kokoro exige >=3.10,<3.13).
#   2. Se apoya en `uv` para obtener CPython 3.12 en el perfil del usuario
#      (sin permisos de administrador y sin instaladores MSI silenciosos).
#   3. Crea voice-engine\.venv e instala torch (indice CPU), kokoro, fastapi y
#      espeakng-loader (espeak-ng como rueda: sin MSI del sistema).
#   4. Verifica imports y espeak-ng.
#   5. Descarga los pesos de Kokoro para que la generacion sea offline.
#
# No toca produccion, no registra servicios, no instala nada a nivel de sistema.
[CmdletBinding()]
param(
  [switch]$SkipModelDownload,
  [switch]$Recreate,
  [string]$PythonVersion = "3.12"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EngineDir = Join-Path $Root "voice-engine"
$VenvDir = Join-Path $EngineDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$RuntimeRequirements = Join-Path $EngineDir "requirements.txt"
$DevRequirements = Join-Path $EngineDir "requirements-dev.txt"
# Indice CPU: evita bajar la distribucion CUDA completa (~2.5 GB).
$TorchCpuIndex = "https://download.pytorch.org/whl/cpu"

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "    !   $Message" -ForegroundColor Yellow }

Write-Host "FullPOS Voice Studio - instalacion del motor de voz" -ForegroundColor White

Write-Step "Comprobando herramientas base"
if (-not (Test-Path -LiteralPath $RuntimeRequirements)) { throw "No se encontro $RuntimeRequirements" }
$BasePython = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $BasePython) { throw "No hay ningun Python en el PATH. Instala Python 3.12 y vuelve a intentar." }
$BaseVersion = (& $BasePython.Source --version) 2>&1
Write-Ok "Interprete base: $BaseVersion"

Write-Step "Asegurando uv (gestor de interpretes y paquetes)"
$Uv = (Get-Command uv -ErrorAction SilentlyContinue)
if (-not $Uv) {
  Write-Warn "uv no esta instalado; se instala con pip en el Python del usuario."
  & $BasePython.Source -m pip install --quiet --disable-pip-version-check uv
  $Uv = (Get-Command uv -ErrorAction SilentlyContinue)
  if (-not $Uv) { throw "No se pudo instalar uv. Instalalo manualmente: python -m pip install uv" }
}
Write-Ok "uv $(& $Uv.Source --version)"

Write-Step "Obteniendo CPython $PythonVersion (perfil del usuario, sin admin)"
& $Uv.Source python install $PythonVersion
if ($LASTEXITCODE -ne 0) { throw "uv no pudo instalar CPython $PythonVersion" }

if ($Recreate -and (Test-Path -LiteralPath $VenvDir)) {
  Write-Warn "Eliminando el entorno anterior (-Recreate)."
  Remove-Item -LiteralPath $VenvDir -Recurse -Force
}

Write-Step "Creando el entorno virtual voice-engine\.venv"
& $Uv.Source venv $VenvDir --python $PythonVersion --allow-existing
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el entorno virtual." }
$VenvVersion = (& $VenvPython --version) 2>&1
Write-Ok "Entorno listo: $VenvVersion ($VenvPython)"

Write-Step "Instalando PyTorch (CPU) desde el indice oficial"
& $Uv.Source pip install --python $VenvPython torch --index-url $TorchCpuIndex
if ($LASTEXITCODE -ne 0) {
  Write-Warn "Fallo el indice CPU; se intenta PyPI (puede incluir CUDA y pesar mucho mas)."
  & $Uv.Source pip install --python $VenvPython torch
  if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar torch." }
}

Write-Step "Instalando el resto de dependencias (kokoro, fastapi, espeakng-loader...)"
& $Uv.Source pip install --python $VenvPython -r $DevRequirements
if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las dependencias del motor." }

Write-Step "Verificando imports y versiones reales"
$Verify = @'
import json, sys
from importlib.metadata import version
report = {"python": sys.version.split()[0]}
for name in ("torch", "kokoro", "numpy", "soundfile", "fastapi", "uvicorn", "espeakng-loader"):
    try:
        report[name] = version(name)
    except Exception as error:
        report[name] = f"FALTA ({error})"
from voice_engine.espeak import configure_espeak
status = configure_espeak()
report["espeak"] = status.as_dict()
print("VOICE_SETUP_REPORT " + json.dumps(report, ensure_ascii=False))
'@
$VerifyFile = Join-Path $env:TEMP "fullpos-voice-verify.py"
Set-Content -LiteralPath $VerifyFile -Value $Verify -Encoding UTF8
Push-Location $EngineDir
# El script de verificacion vive en %TEMP%: sin esto Python no ve el paquete voice_engine
# (para un archivo suelto, sys.path[0] es su carpeta, no el directorio actual).
$previousPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = $EngineDir
try {
  & $VenvPython $VerifyFile
  if ($LASTEXITCODE -ne 0) { throw "La verificacion del entorno fallo." }
} finally {
  $env:PYTHONPATH = $previousPythonPath
  Pop-Location
  Remove-Item -LiteralPath $VerifyFile -Force -ErrorAction SilentlyContinue
}

if (-not $SkipModelDownload) {
  Write-Step "Descargando los pesos de Kokoro (una sola vez; luego es 100% local)"
  Push-Location $EngineDir
  $previousPythonPath = $env:PYTHONPATH
  $env:PYTHONPATH = $EngineDir
  try {
    & $VenvPython -m voice_engine.prefetch
    if ($LASTEXITCODE -ne 0) { Write-Warn "La descarga no termino bien; la primera narracion la reintentara." }
  } finally {
    $env:PYTHONPATH = $previousPythonPath
    Pop-Location
  }
} else {
  Write-Warn "Se omitio la descarga de pesos (-SkipModelDownload)."
}

Write-Step "Listo"
Write-Host "    Arranca el motor con:  npm run voice:dev" -ForegroundColor White
Write-Host "    Prueba el motor con:   npm run voice:test" -ForegroundColor White
Write-Host "    Los audios se guardan en: storage\generated-audio" -ForegroundColor White
