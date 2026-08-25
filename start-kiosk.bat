@echo off
setlocal
title Chrome ^& Edge Tab Rotator - Kiosk Mode

echo ========================================================
echo   Chrome ^& Edge Auto Tab Rotator (Kiosk Mode)
echo ========================================================
echo.

:: Automatically launch in autostart mode
node server.js --autostart --no-open %*

if %errorlevel% neq 0 (
    echo.
    echo Server stopped with error.
    pause
)
