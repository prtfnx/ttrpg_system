#!/usr/bin/env pwsh
# Start the FastAPI development server.
#
# Usage:
#   .\scripts\dev-server.ps1             # default port 8000
#   .\scripts\dev-server.ps1 -port 9000  # custom port

param([int]$port = 8000)

$ServerDir = "$PSScriptRoot\..\apps\server"

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) {
    $PythonVersion = python --version 2>&1
    throw "Python 3.11 or newer is required; found $PythonVersion. Activate .venv311 before starting the server."
}

Write-Host "[server] starting on http://localhost:$port" -ForegroundColor Cyan
Push-Location $ServerDir
try {
    python -m uvicorn main:app --reload --port $port
} finally {
    Pop-Location
}
