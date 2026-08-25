@echo off
setlocal
title Chrome ^& Edge Tab Rotator

echo ========================================================
echo   Chrome ^& Edge Auto Tab Rotator (Windows)
echo ========================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your PATH!
    echo Please install Node.js (v16 or newer) from https://nodejs.org
    echo No admin rights are required to run once Node.js is installed.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node --version
echo.
echo Starting Tab Rotator server...
echo.

:: Run Node server with any forwarded CLI arguments (e.g. --autostart, --profile=...)
node server.js %*

if %errorlevel% neq 0 (
    echo.
    echo Server stopped with error.
    pause
)
