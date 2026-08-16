@echo off
rem Halcyon Video - click-to-start (Windows).
rem
rem Double-click this file after cloning. It installs dependencies if they're
rem missing, builds, serves on :1420, and opens your browser at it. Everything
rem it does is a documented npm command; this file only saves you from running
rem them in the right order.
rem
rem   start.cmd          build + serve, open the browser at your store
rem   start.cmd demo     ...at the built-in demo catalog instead (no media server)
rem   start.cmd dev      vite dev server (hot reload) instead of a built bundle
rem
rem Env: HALCYON_PORT (default 1420), NO_BROWSER=1 to skip opening one.
rem
rem Note: every `npm` call is prefixed with `call`. npm on Windows IS a batch
rem file, so without it control never returns here and the script stops after
rem the first npm command with no error to explain why.
setlocal EnableExtensions
cd /d "%~dp0"

if "%HALCYON_PORT%"=="" set "HALCYON_PORT=1420"
set "MODE=build"
set "QUERY="
:parseargs
if "%~1"=="" goto argsdone
if /i "%~1"=="demo" set "QUERY=?demo=1"& shift & goto parseargs
if /i "%~1"=="dev"  set "MODE=dev"&      shift & goto parseargs
echo start.cmd: unknown option "%~1"  (try: demo, dev)
exit /b 2
:argsdone
set "URL=http://localhost:%HALCYON_PORT%/%QUERY%"

rem --- Node ------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js isn't installed, or isn't on your PATH.
  echo   Get the LTS build from https://nodejs.org - version 20 or newer -
  echo   then run this again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -p "process.versions.node.split(\".\")[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
  echo.
  echo   Node is too old for this app - it needs 20 or newer ^(22 is what CI
  echo   and the Docker image use^). https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem --- Dependencies ----------------------------------------------------------
if not exist "node_modules\" (
  echo.
  echo ==^> Installing dependencies ^(first run takes a couple of minutes^)...
  call npm install || goto failed
)

rem --- Serve -----------------------------------------------------------------
rem Opening the browser is handed to a background PowerShell that waits for the
rem port to actually answer first - opening it immediately lands on a connection
rem error, which reads as "the app is broken" rather than "it's still starting".
if not "%NO_BROWSER%"=="1" (
  start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "for($i=0;$i -lt 240;$i++){try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',%HALCYON_PORT%);$c.Close();Start-Process '%URL%';break}catch{Start-Sleep -Milliseconds 500}}"
)

echo.
echo ==^> Halcyon Video will be at %URL%
echo     On another device on your network, use this machine's IP or hostname.
echo     Press Ctrl-C in this window to stop it.
echo.

if /i "%MODE%"=="dev" (
  call npx vite --port %HALCYON_PORT% --strictPort --host || goto failed
) else (
  echo ==^> Building...
  call npm run build || goto failed
  echo ==^> Starting the server...
  call npx vite preview --port %HALCYON_PORT% --strictPort --host || goto failed
)
exit /b 0

:failed
echo.
echo   Something above failed - the error is in the output just before this.
echo.
pause
exit /b 1
