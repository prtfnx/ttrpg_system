#!/usr/bin/env pwsh
# Build the Rust WASM package.
#
# Usage:
#   .\scripts\build-wasm.ps1           # release build
#   .\scripts\build-wasm.ps1 -dev      # dev build with debug logging

param([switch]$dev)

$Root    = $PSScriptRoot | Split-Path -Parent
$RustDir = "$Root\packages\rust-core"
$WasmOut = "$Root\apps\web-ui\src\lib\wasm\generated"

function Invoke-WasmPack {
    param([string[]]$BuildArguments)

    & wasm-pack build @BuildArguments
    if ($LASTEXITCODE -ne 0) {
        throw "wasm-pack build failed with exit code $LASTEXITCODE"
    }
}

Push-Location $RustDir
try {
    if ($dev) {
        Write-Host "[WASM] dev build (debug logging)" -ForegroundColor Cyan
        Invoke-WasmPack @(
            "--target", "web",
            "--out-dir", $WasmOut,
            "--features", "wasm-start,dev-logging",
            "--locked"
        )
    } else {
        Write-Host "[WASM] release build" -ForegroundColor Cyan
        Invoke-WasmPack @(
            "--release",
            "--target", "web",
            "--out-dir", $WasmOut,
            "--features", "wasm-start",
            "--locked"
        )
    }
} finally {
    Pop-Location
}
