# Chrome & Edge Tab Rotator PowerShell Launcher
Set-Location -Path $PSScriptRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Chrome & Edge Auto Tab Rotator (Windows PowerShell)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js was not found in PATH!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org"
    Read-Host "Press Enter to exit..."
    exit 1
}

$nodeVer = node --version
Write-Host "[OK] Node.js detected: $nodeVer" -ForegroundColor Green
Write-Host "Starting Tab Rotator server..." -ForegroundColor Yellow
Write-Host ""

node server.js $args

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Server has stopped." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."
