# Build Rust WASM, React, copy assets to server, and update vite asset manifest.
#
# Usage:
#   .\build_and_deploy.ps1              # full production build
#   .\build_and_deploy.ps1 -dev         # development build (unminified, debug logging)
#   .\build_and_deploy.ps1 -wasm-only   # build WASM only
#   .\build_and_deploy.ps1 -web-only    # build React only (skip WASM)
#   .\build_and_deploy.ps1 -skip-copy   # build everything but don't copy to server

param(
    [switch]$dev,
    [switch]$WasmOnly,
    [switch]$WebOnly,
    [switch]$SkipCopy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root    = $PSScriptRoot
$RustDir = "$Root\packages\rust-core"
$WebDir  = "$Root\apps\web-ui"
$WasmOut = "$WebDir\public\wasm"
$Dist    = "$WebDir\dist"
$Static  = "$Root\apps\server\static\ui"
$UpdateScript = "$Root\apps\server\scripts\update_vite_assets.py"

function Build-Wasm {
    Write-Host "`n==> Building Rust WASM..." -ForegroundColor Cyan
    Push-Location $RustDir
    try {
        if ($dev) {
            Write-Host "    [dev] debug logging features enabled"
            wasm-pack build --target web --out-dir "$WasmOut" --features dev-logging
        } else {
            wasm-pack build --release --target web --out-dir "$WasmOut"
        }
    } finally {
        Pop-Location
    }
}

function Build-Web {
    Write-Host "`n==> Building React (Vite)..." -ForegroundColor Cyan
    Push-Location $WebDir
    try {
        if ($dev) {
            Write-Host "    [dev] unminified build"
            $env:NODE_ENV = "development"
            npm run build -- --mode development
        } else {
            $env:NODE_ENV = "production"
            npm run build
        }
    } finally {
        Pop-Location
    }
}

function Copy-ToServer {
    Write-Host "`n==> Copying build artifacts to server static..." -ForegroundColor Cyan

    if (!(Test-Path $Static)) {
        New-Item -ItemType Directory -Path $Static | Out-Null
    } else {
        Remove-Item "$Static\*" -Recurse -Force
    }

    # React build
    Copy-Item "$Dist\*" $Static -Recurse -Force
    Write-Host "    React dist  -> $Static"

    # WASM files
    $WasmDest = "$Static\wasm"
    if (!(Test-Path $WasmDest)) {
        New-Item -ItemType Directory -Path $WasmDest | Out-Null
    }
    Copy-Item "$WasmOut\*" $WasmDest -Recurse -Force
    Write-Host "    WASM files  -> $WasmDest"

    # Regenerate vite asset manifest template
    Write-Host "`n==> Updating vite_assets.html..."
    python $UpdateScript
}

# ── Execution ──────────────────────────────────────────────────────────────────

$mode = if ($dev) { "development" } else { "production" }
Write-Host "Build mode: $mode" -ForegroundColor Yellow

if ($WasmOnly) {
    Build-Wasm
} elseif ($WebOnly) {
    Build-Web
    if (!$SkipCopy) { Copy-ToServer }
} else {
    Build-Wasm
    Build-Web
    if (!$SkipCopy) { Copy-ToServer }
}

Write-Host "`nDone." -ForegroundColor Green
