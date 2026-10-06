# Local dev without Docker: backend (H2) + frontend (Vite)
# Usage: powershell -ExecutionPolicy Bypass -File ./start-dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (!(Test-Path ".\frontend\.env")) { Copy-Item ".\frontend\.env.example" ".\frontend\.env" }
$env:SPRING_PROFILES_ACTIVE = "local"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:3000"
$env:REDIS_ENABLED = "false"

Write-Host "Starting backend on :8080 (H2) in background..."
Start-Process -FilePath ".\mvnw.cmd" -ArgumentList "spring-boot:run" -WorkingDirectory $root -WindowStyle Minimized

Write-Host "Starting frontend on :5173..."
Set-Location "$root\frontend"
npm run dev
