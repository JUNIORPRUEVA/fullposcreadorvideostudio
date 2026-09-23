@echo off
rem FullPOS Voice Studio - arranque con doble clic (Windows).
rem Comprueba dependencias y puertos, arranca motor + API + web, y abre el navegador.
rem No duplica procesos ya en marcha y no cierra esta ventana si algo falla.

setlocal
set "SCRIPT=%~dp0scripts\voice\start-voice-studio.ps1"

if not exist "%SCRIPT%" (
  echo.
  echo No se encontro: %SCRIPT%
  echo Copia Open-Voice-Studio.cmd en la raiz del repositorio FullPOS-Ad-Studio.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
  echo Listo. Puedes cerrar esta ventana: el estudio sigue funcionando.
  echo Para cerrarlo: doble clic en Stop-Voice-Studio.cmd
) else (
  echo El estudio no arranco completo. Lee los mensajes de arriba y los logs indicados.
)
echo.
pause
exit /b %CODE%
