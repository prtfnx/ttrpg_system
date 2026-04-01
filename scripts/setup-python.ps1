#!/usr/bin/env pwsh
# Set up the Python venv for development.
# Activate the venv first, then run this script.
#
# Usage:
#   .venv\Scripts\Activate.ps1
#   .\scripts\setup-python.ps1

$Root = $PSScriptRoot | Split-Path -Parent

Write-Host "[python] installing core-table (editable)..." -ForegroundColor Cyan
pip install -e "$Root\packages\core-table"

Write-Host "[python] installing server dependencies..." -ForegroundColor Cyan
pip install -r "$Root\apps\server\requirements.txt"

Write-Host "[python] done." -ForegroundColor Green
