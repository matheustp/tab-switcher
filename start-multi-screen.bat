@echo off
cd /d "%~dp0"
title Tab Rotator - Multi-Screen Dual Launcher

echo ========================================================
echo   Chrome and Edge Auto Tab Rotator (Dual-Screen)
echo ========================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH.
    echo Please install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

echo Starting Screen 1 Instance (Profile: Screen1, Port: 3000)...
start "Tab Rotator - Screen 1" node server.js --profile=Screen1 --port=3000 --autostart --no-open

timeout /t 2 /nobreak >nul

echo Starting Screen 2 Instance (Profile: Screen2, Port: 3001)...
start "Tab Rotator - Screen 2" node server.js --profile=Screen2 --port=3001 --autostart --no-open

echo.
echo ========================================================
echo Both screen instances have been launched successfully!
echo   Screen 1 Control Panel: http://localhost:3000
echo   Screen 2 Control Panel: http://localhost:3001
echo ========================================================
echo.
pause
