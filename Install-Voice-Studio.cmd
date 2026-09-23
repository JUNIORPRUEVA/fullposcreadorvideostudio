@echo off
rem FullPOS Voice Studio - instalacion con doble clic (Windows).
rem
rem Que hace, en orden:
rem   1. Comprueba que exista Node.js.
rem   2. Ejecuta "npm install" si falta node_modules.
rem   3. Llama a scripts\voice\voice-setup.ps1, que crea el entorno de Python del motor
rem      (CPython 3.12 con uv, sin permisos de administrador), instala kokoro + piper
rem      y descarga los modelos (Kokoro y las voces latinas de Piper).
rem
rem Es idempotente: si ya esta instalado, solo verifica y termina rapido.
rem Tarda varios minutos la primera vez (~1 GB de descargas).
rem No toca produccion, no registra servicios, no necesita admin.

setlocal
set "ROOT=%~dp0"
set "SETUP=%ROOT%scripts\voice\voice-setup.ps1"

if not exist "package.json" (
  echo.
  echo Este archivo debe estar en la RAIZ del repositorio FullPOS-Ad-Studio.
  echo Ruta actual: %ROOT%
  echo.
  pause
  exit /b 1
)

if not exist "%SETUP%" (
  echo.
  echo No se encontro: %SETUP%
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No hay Node.js en el PATH.
  echo Instala Node.js 20 o superior desde https://nodejs.org y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo.
  echo [1/2] Instalando dependencias de JavaScript ^(npm install^)...
  pushd "%ROOT%"
  call npm.cmd install
  set "NPM_CODE=%ERRORLEVEL%"
  popd
  if not "%NPM_CODE%"=="0" (
    echo.
    echo Fallo "npm install". Revisa los mensajes de arriba y vuelve a intentar.
    echo.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [1/2] Dependencias de JavaScript ya instaladas ^(node_modules^).
)

echo.
echo [2/2] Instalando el motor de voz ^(Python 3.12 + Kokoro + Piper + modelos^)...
echo      La primera vez tarda varios minutos: no cierres esta ventana.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SETUP%" %*
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
  echo Instalacion terminada.
  echo Para usarlo: doble clic en Open-Voice-Studio.cmd
) else (
  echo La instalacion no termino bien ^(codigo %CODE%^). Lee los mensajes de arriba.
  echo Si el problema es de red, vuelve a ejecutar este archivo: continua donde quedo.
)
echo.
pause
exit /b %CODE%
