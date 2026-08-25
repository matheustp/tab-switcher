@echo off
setlocal EnableDelayedExpansion

:: Change current directory to script folder
cd /d "%~dp0"

title Chrome and Edge Tab Rotator

echo ========================================================
echo   Chrome and Edge Auto Tab Rotator
echo ========================================================
echo.

:: Check if Node.js is available
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH!
    echo.
    echo Please make sure Node.js is installed (https://nodejs.org).
    echo If you just installed it, please close and reopen this window.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node --version
echo.
echo Starting Tab Rotator server...
echo.

:: Run Node server with all passed arguments
node server.js %*

echo.
echo ========================================================
echo Server has stopped.
echo ========================================================
pause
