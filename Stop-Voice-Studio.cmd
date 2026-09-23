@echo off
rem FullPOS Voice Studio - cierre seguro con doble clic (Windows).
rem Detiene SOLO los procesos del estudio de voz (motor, API y web).
rem Nunca cierra procesos ajenos ni toca la base de datos.
rem
rem Uso avanzado:  Stop-Voice-Studio.cmd -Force   (barre tambien el motor si quedo huerfano)

setlocal
set "SCRIPT=%~dp0scripts\voice\stop-voice-studio.ps1"

if not exist "%SCRIPT%" (
  echo.
  echo No se encontro: %SCRIPT%
  echo Copia Stop-Voice-Studio.cmd en la raiz del repositorio FullPOS-Ad-Studio.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "CODE=%ERRORLEVEL%"

echo.
pause
exit /b %CODE%
