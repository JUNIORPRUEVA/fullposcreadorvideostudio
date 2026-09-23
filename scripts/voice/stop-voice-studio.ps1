# FullPOS Voice Studio - detiene SOLO los procesos que arranco el estudio de voz.
#
#   Stop-Voice-Studio.cmd            -> detiene motor + API + web arrancados por el estudio
#   powershell -File stop-voice-studio.ps1 -Force  -> ademas barre el motor si quedo huerfano
#
# Nunca mata procesos ajenos: cada candidato se comprueba contra el repositorio
# (marca de ruta del workspace) o contra su linea de comandos exacta.
# Nunca toca la base de datos ni produccion.
[CmdletBinding()]
param(
  [int]$EnginePort = 4310,
  [int]$ApiPort = 4000,
  [int]$WebPort = 3000,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\dev\studio-common.ps1")

$Root = Get-StudioRoot -ScriptRoot $PSScriptRoot
$Prefix = "[Voz]"
$LogsDir = Get-StudioLogsDir -Root $Root
$PidFile = Join-Path $LogsDir "voice-studio.pids.json"
$EngineDir = Join-Path $Root "voice-engine"
$VenvPython = Join-Path $EngineDir ".venv\Scripts\python.exe"
$Stopped = New-Object System.Collections.ArrayList
$Skipped = 0

function Stop-VoiceProcess {
  param([int]$ProcessId, [string]$Label, [string]$ExpectedName = "")

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-StudioInfo $Prefix "$Label (pid $ProcessId) ya no estaba en marcha."
    return
  }

  $commandLine = [string]$process.CommandLine
  $owned = Test-StudioOwnedByWorkspace -Owner ([pscustomobject]@{ CommandLine = $commandLine }) -Root $Root
  $expected = $ExpectedName -ne "" -and ([string]$process.Name) -eq $ExpectedName

  if (-not ($owned -or $expected)) {
    $script:Skipped++
    Write-StudioWarn $Prefix "No se detiene $Label (pid $ProcessId): no parece un proceso de este estudio. Nada se cerro."
    return
  }

  & taskkill.exe /PID $ProcessId /T /F 2>&1 | Out-Null
  [void]$Stopped.Add($Label)
  Write-StudioOk $Prefix "Detenido: $Label (pid $ProcessId)."
}

Write-Host "FullPOS Voice Studio - detener" -ForegroundColor White

# 1. Lo que arranco start-voice-studio.ps1 (pids guardados).
if (Test-Path -LiteralPath $PidFile) {
  $state = Get-Content -Raw -LiteralPath $PidFile | ConvertFrom-Json
  if ($state.components) {
    foreach ($component in $state.components) {
      Stop-VoiceProcess -ProcessId ([int]$component.pid) -Label "$($component.name) (puerto $($component.port))"
    }
  }
  if ($script:Skipped -eq 0) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-StudioWarn $Prefix "Se conservo $PidFile porque hubo procesos que no se tocaron."
  }
} else {
  Write-StudioInfo $Prefix "No hay pids guardados: el estudio no arranco nada en esta sesion."
}

# 2. Motor de voz: proceso Python del venv del repo con `-m voice_engine`.
#    Solo con -Force (por si quedo huerfano tras cerrar la consola a lo bruto).
if ($Force) {
  $engineProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.Name -match "^python(w)?\.exe$" -and $_.CommandLine -match "voice_engine" -and (
      $_.CommandLine -match [regex]::Escape($EngineDir) -or $_.ExecutablePath -match [regex]::Escape($EngineDir)
    )
  }
  foreach ($process in $engineProcesses) {
    if ($Stopped -contains "motor (puerto $EnginePort)") { continue }
    & taskkill.exe /PID $process.ProcessId /T /F 2>&1 | Out-Null
    [void]$Stopped.Add("motor de voz (pid $($process.ProcessId))")
    Write-StudioOk $Prefix "Detenido: motor de voz (pid $($process.ProcessId))."
  }

  # 3. Con -Force, ademas los puertos del estudio si los ocupa este workspace.
  foreach ($port in @($EnginePort, $ApiPort, $WebPort)) {
    if (-not (Test-StudioTcpPort -Port $port)) { continue }
    $owner = Get-StudioPortOwner -Port $port
    if (Test-StudioOwnedByWorkspace -Owner $owner -Root $Root) {
      $treePid = Get-StudioProcessRoot -ProcessId $owner.Pid -Root $Root
      & taskkill.exe /PID $treePid /T /F 2>&1 | Out-Null
      [void]$Stopped.Add("proceso del estudio en el puerto $port")
      Write-StudioOk $Prefix "Detenido: proceso del estudio en el puerto $port (pid raiz $treePid)."
    } else {
      Write-StudioWarn $Prefix "El puerto $port lo usa pid $($owner.Pid) ($($owner.Name)) y no es de este estudio: no se toca."
    }
  }
}

Start-Sleep -Milliseconds 800

if ($Stopped.Count -eq 0) {
  Write-StudioInfo $Prefix "No habia nada que detener."
} else {
  Write-StudioOk $Prefix "Procesos detenidos: $($Stopped.Count)."
}

Write-StudioInfo $Prefix "Verificacion de puertos:"
$engineFree = -not (Test-StudioTcpPort -Port $EnginePort)
$apiFree = -not (Test-StudioTcpPort -Port $ApiPort)
$webFree = -not (Test-StudioTcpPort -Port $WebPort)
foreach ($entry in @(
    [pscustomobject]@{ Name = "motor de voz"; Port = $EnginePort; Free = $engineFree },
    [pscustomobject]@{ Name = "API"; Port = $ApiPort; Free = $apiFree },
    [pscustomobject]@{ Name = "interfaz web"; Port = $WebPort; Free = $webFree }
  )) {
  if ($entry.Free) {
    Write-StudioOk $Prefix "$($entry.Name): puerto $($entry.Port) libre."
  } else {
    $owner = Get-StudioPortOwner -Port $entry.Port
    Write-StudioWarn $Prefix "$($entry.Name): el puerto $($entry.Port) sigue ocupado por pid $($owner.Pid) ($($owner.Name))."
    Write-StudioWarn $Prefix "Si es un proceso de este estudio que quedo huerfano, repite con:  Stop-Voice-Studio.cmd -Force"
  }
}
