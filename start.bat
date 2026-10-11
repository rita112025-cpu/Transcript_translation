@echo off
rem Meeting Transcriber TW - Windows launcher (no administrator rights needed).
rem Checks tools, prepares a project-local venv and node_modules, picks free ports
rem (never stops other processes), then starts the FastAPI backend and the Vite frontend
rem and verifies that each chosen port is served by this project.
setlocal EnableExtensions
cd /d "%~dp0"

set "BACKEND_PORT="
set "FRONTEND_PORT="
set "LOG_DIR=%~dp0logs"
set "VENV_PY=%~dp0backend\.venv\Scripts\python.exe"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo [%date% %time%] start.bat begin>>"%LOG_DIR%\launcher.log"

echo.
echo === [1/7] Checking Python 3.10+ ===
where python >nul 2>&1
if errorlevel 1 goto :no_python
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto :old_python
python --version

echo.
echo === [2/7] Checking Node.js and npm ===
where node >nul 2>&1
if errorlevel 1 goto :no_node
where npm >nul 2>&1
if errorlevel 1 goto :no_node
node --version

echo.
echo === [3/7] Checking FFmpeg (required for transcription) ===
if exist "%~dp0tools\ffmpeg\bin\ffmpeg.exe" (
  "%~dp0tools\ffmpeg\bin\ffmpeg.exe" -version 2>nul | findstr /i /c:"ffmpeg version"
) else (
  where ffmpeg >nul 2>&1
  if errorlevel 1 (
    echo WARNING: ffmpeg not found in tools\ffmpeg\bin or on PATH. The backend will start, but every transcription
    echo          will fail until FFmpeg is installed or FFMPEG_PATH / FFPROBE_PATH is set in .env.
    echo WARNING: ffmpeg not found.>>"%LOG_DIR%\launcher.log"
  ) else (
    ffmpeg -version 2>nul | findstr /i /c:"ffmpeg version"
  )
)

echo.
echo === [4/7] Preparing Python virtual environment ===
if not exist "%VENV_PY%" (
  echo Creating backend\.venv ...
  python -m venv "%~dp0backend\.venv" >>"%LOG_DIR%\launcher.log" 2>&1
  if errorlevel 1 goto :venv_failed
)
"%VENV_PY%" -c "import fastapi, uvicorn, httpx, multipart, dotenv, riva.client" >nul 2>&1
if errorlevel 1 (
  echo Installing Python dependencies into backend\.venv ^(log: logs\pip-install.log^) ...
  "%VENV_PY%" -m pip install -r "%~dp0backend\requirements.txt" > "%LOG_DIR%\pip-install.log" 2>&1
  if errorlevel 1 goto :pip_failed
)
echo Python dependencies OK.

echo.
echo === [5/7] Preparing frontend dependencies ===
if not exist "%~dp0node_modules\vite\package.json" (
  echo Installing frontend dependencies ^(log: logs\npm-install.log^) ...
  if exist "%~dp0package-lock.json" (
    call npm ci > "%LOG_DIR%\npm-install.log" 2>&1
  ) else (
    call npm install > "%LOG_DIR%\npm-install.log" 2>&1
  )
  if errorlevel 1 goto :npm_failed
)
echo Frontend dependencies OK.

echo.
echo === [6/7] Configuration and port selection ===
if not exist "%~dp0.env" (
  copy /y "%~dp0.env.example" "%~dp0.env" >nul
  echo Created .env from .env.example. Edit .env to set cloud settings if needed.
)
rem First free port in each range. Busy ports are skipped, never stopped.
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "foreach ($p in 8000..8009) { if (-not (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) { $p; break } }"`) do set "BACKEND_PORT=%%P"
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "foreach ($p in 3000..3009) { if (-not (Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue)) { $p; break } }"`) do set "FRONTEND_PORT=%%P"
if not defined BACKEND_PORT goto :no_backend_port
if not defined FRONTEND_PORT goto :no_frontend_port
echo Backend  port: %BACKEND_PORT%
echo Frontend port: %FRONTEND_PORT%
echo [%date% %time%] ports backend=%BACKEND_PORT% frontend=%FRONTEND_PORT%>>"%LOG_DIR%\launcher.log"

echo.
echo === [7/7] Starting services ===
powershell -NoProfile -Command "Start-Process -FilePath '%VENV_PY%' -ArgumentList '-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','%BACKEND_PORT%' -WorkingDirectory '%~dp0' -RedirectStandardOutput '%LOG_DIR%\backend.log' -RedirectStandardError '%LOG_DIR%\backend.err.log' -WindowStyle Minimized"

echo Waiting for backend health check on port %BACKEND_PORT% ...
powershell -NoProfile -Command "$ok = $false; for ($i = 0; $i -lt 40 -and -not $ok; $i++) { try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:%BACKEND_PORT%/api/health' -TimeoutSec 2; if ($h.status -eq 'ok') { $ok = $true } } catch { Start-Sleep -Milliseconds 750 } }; if ($ok) { exit 0 } else { exit 1 }"
if errorlevel 1 goto :backend_failed
call :verify_owner %BACKEND_PORT% "backend.main:app"
if errorlevel 1 goto :owner_mismatch
echo Backend is healthy and owned by this project.

powershell -NoProfile -Command "$env:FRONTEND_PORT='%FRONTEND_PORT%'; $env:API_TARGET='http://127.0.0.1:%BACKEND_PORT%'; Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev' -WorkingDirectory '%~dp0' -RedirectStandardOutput '%LOG_DIR%\frontend.log' -RedirectStandardError '%LOG_DIR%\frontend.err.log' -WindowStyle Minimized"

echo Waiting for frontend on port %FRONTEND_PORT% ...
powershell -NoProfile -Command "$ok = $false; for ($i = 0; $i -lt 40 -and -not $ok; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%FRONTEND_PORT%/' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true } } catch { Start-Sleep -Milliseconds 750 } }; if ($ok) { exit 0 } else { exit 1 }"
if errorlevel 1 goto :frontend_failed
call :verify_owner %FRONTEND_PORT% "%~dp0"
if errorlevel 1 goto :owner_mismatch

echo.
echo ==================================================
echo  Frontend UI : http://127.0.0.1:%FRONTEND_PORT%
echo  Backend API : http://127.0.0.1:%BACKEND_PORT%/api/health
echo  Logs        : %LOG_DIR%
echo  Stop        : netstat -ano ^| findstr :%BACKEND_PORT%  and  netstat -ano ^| findstr :%FRONTEND_PORT%  then taskkill /F /PID ^<pid^>
echo  Use 127.0.0.1 in the browser, not localhost.
echo ==================================================
echo [%date% %time%] services started backend=%BACKEND_PORT% frontend=%FRONTEND_PORT%>>"%LOG_DIR%\launcher.log"
start "" "http://127.0.0.1:%FRONTEND_PORT%/"
exit /b 0

rem ---- helpers -------------------------------------------------------------------

rem :verify_owner <port> <marker>  -> errorlevel 0 when a listener on the port has the marker in its command line
:verify_owner
powershell -NoProfile -Command "$pids = Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { $cl = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p)).CommandLine; if ($cl -and $cl.Contains('%~2')) { exit 0 } }; exit 1"
exit /b %errorlevel%

rem ---- failures ------------------------------------------------------------------

:no_python
echo ERROR: Python was not found on PATH. Install Python 3.10+ from python.org and tick "Add to PATH".
goto :fail

:old_python
echo ERROR: Python 3.10 or newer is required.
goto :fail

:no_node
echo ERROR: Node.js/npm was not found on PATH. Install the LTS version from nodejs.org.
goto :fail

:venv_failed
echo ERROR: Could not create backend\.venv. See logs\launcher.log.
goto :fail

:pip_failed
echo ERROR: pip install failed. See logs\pip-install.log.
goto :fail

:npm_failed
echo ERROR: npm install failed. See logs\npm-install.log.
goto :fail

:no_backend_port
echo ERROR: Ports 8000-8009 are all in use. Stop an old backend or free one of these ports.
goto :fail

:no_frontend_port
echo ERROR: Ports 3000-3009 are all in use. Stop an old frontend or free one of these ports.
goto :fail

:backend_failed
echo ERROR: Backend did not become healthy within 30 seconds. It is NOT running.
echo        See the "MT Backend %BACKEND_PORT%" window and logs\backend.log for the cause.
goto :fail

:frontend_failed
echo ERROR: Frontend did not answer on port %FRONTEND_PORT% within 30 seconds.
echo        See the "MT Frontend %FRONTEND_PORT%" window and logs\frontend.log.
goto :fail

:owner_mismatch
echo ERROR: The process on the chosen port is not this project's service. Nothing was stopped.
echo        Close the windows started by this launcher, then run start.bat again.
goto :fail

:fail
echo.
echo [%date% %time%] start.bat failed>>"%LOG_DIR%\launcher.log"
pause
exit /b 1
