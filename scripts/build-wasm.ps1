#!/usr/bin/env pwsh
# Build the Rust WASM package.
#
# Usage:
#   .\scripts\build-wasm.ps1           # release build
#   .\scripts\build-wasm.ps1 -dev      # dev build with debug logging

param([switch]$dev)

$Root    = $PSScriptRoot | Split-Path -Parent
$RustDir = "$Root\packages\rust-core"
$WasmOut = "$Root\apps\web-ui\public\wasm"

Push-Location $RustDir
try {
    if ($dev) {
        Write-Host "[WASM] dev build (debug logging)" -ForegroundColor Cyan
        wasm-pack build --target web --out-dir $WasmOut --features dev-logging
    } else {
        Write-Host "[WASM] release build" -ForegroundColor Cyan
        wasm-pack build --release --target web --out-dir $WasmOut
    }
} finally {
    Pop-Location
}
