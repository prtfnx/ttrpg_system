#!/usr/bin/env pwsh
# Set up the Python venv for development.
# Activate the venv first, then run this script.
#
# Usage:
#   .\.venv311\Scripts\Activate.ps1
#   .\scripts\setup-python.ps1

$Root = $PSScriptRoot | Split-Path -Parent

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) {
    $PythonVersion = python --version 2>&1
    throw "Python 3.11 or newer is required; found $PythonVersion. Activate .venv311 before setup."
}

Write-Host "[python] installing core-table (editable)..." -ForegroundColor Cyan
python -m pip install -e "$Root\packages\core-table"

Write-Host "[python] installing server dependencies..." -ForegroundColor Cyan
python -m pip install -r "$Root\apps\server\requirements.txt"

Write-Host "[python] done." -ForegroundColor Green
