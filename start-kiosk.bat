@echo off
setlocal EnableDelayedExpansion

:: Change current directory to script folder
cd /d "%~dp0"

title Chrome and Edge Tab Rotator (Kiosk Mode)

echo ========================================================
echo   Chrome and Edge Auto Tab Rotator (Kiosk Mode)
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH!
    echo.
    echo Please make sure Node.js is installed (https://nodejs.org).
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node --version
echo.
echo Starting Tab Rotator in Kiosk Mode...
echo.

node server.js --autostart --no-open %*

echo.
echo ========================================================
echo Server has stopped.
echo ========================================================
pause
