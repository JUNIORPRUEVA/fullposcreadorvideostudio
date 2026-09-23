# FullPOS Voice Studio - crea un acceso directo en el escritorio (opcional).
#
# NO se ejecuta automaticamente: es una ayuda para quien quiera el icono en el escritorio.
#
#   powershell -ExecutionPolicy Bypass -File scripts\voice\create-desktop-shortcut.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\voice\create-desktop-shortcut.ps1 -Remove
#
# No instala nada, no toca el registro y no necesita permisos de administrador.
[CmdletBinding()]
param(
  [string]$Name = "FullPOS Voice Studio",
  [string]$Target = "",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Launcher = Join-Path $Root "Open-Voice-Studio.cmd"
$Desktop = [Environment]::GetFolderPath("Desktop")
$LinkPath = Join-Path $Desktop "$Name.lnk"

if ($Remove) {
  if (Test-Path -LiteralPath $LinkPath) {
    Remove-Item -LiteralPath $LinkPath -Force
    Write-Host "Acceso directo eliminado: $LinkPath" -ForegroundColor Green
  } else {
    Write-Host "No existia ningun acceso directo en $LinkPath" -ForegroundColor Yellow
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "No se encontro $Launcher. Este script debe vivir en scripts\voice dentro del repositorio."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($LinkPath)
$shortcut.TargetPath = $Launcher
$shortcut.WorkingDirectory = $Root
$shortcut.Description = "Arranca FullPOS Voice Studio (motor de voz + API + web)"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,138"
$shortcut.Save()

Write-Host "Acceso directo creado: $LinkPath" -ForegroundColor Green
Write-Host "Apunta a: $Launcher" -ForegroundColor DarkGray
Write-Host "El acceso directo NO abre una consola aparte: abre el launcher del estudio." -ForegroundColor DarkGray
