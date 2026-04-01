#!/usr/bin/env pwsh
# Start the FastAPI development server.
#
# Usage:
#   .\scripts\dev-server.ps1             # default port 8000
#   .\scripts\dev-server.ps1 -port 9000  # custom port

param([int]$port = 8000)

$ServerDir = "$PSScriptRoot\..\apps\server"

Write-Host "[server] starting on http://localhost:$port" -ForegroundColor Cyan
Push-Location $ServerDir
try {
    python -m uvicorn main:app --reload --port $port
} finally {
    Pop-Location
}
