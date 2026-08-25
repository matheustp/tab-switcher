@echo off
cd /d "%~dp0"
title Tab Rotator - Kiosk Mode

echo ========================================================
echo   Chrome and Edge Auto Tab Rotator - Kiosk Mode
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

echo [OK] Node.js detected:
node -v
echo.
echo Starting Tab Rotator in Kiosk Mode...
echo.

node server.js --autostart --no-open %*

echo.
echo Server has stopped.
pause
