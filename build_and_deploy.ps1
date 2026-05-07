# Build Rust WASM, React, copy assets to server, and update vite asset manifest.
#
# Usage:
#   .\build_and_deploy.ps1              # full production build
#   .\build_and_deploy.ps1 -dev         # development build (unminified, debug logging)
#   .\build_and_deploy.ps1 -WasmOnly    # build WASM only
#   .\build_and_deploy.ps1 -WebOnly     # build React only (skip WASM)
#   .\build_and_deploy.ps1 -SkipCopy    # build everything but don't copy to server
#   .\build_and_deploy.ps1 -Test        # run Rust + TypeScript tests (no build)

param(
    [switch]$dev,
    [switch]$WasmOnly,
    [switch]$WebOnly,
    [switch]$SkipCopy,
    [switch]$Test
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root         = $PSScriptRoot
$RustDir      = "$Root\packages\rust-core"
$WebDir       = "$Root\apps\web-ui"
$WasmOut      = "$WebDir\public\wasm"
$Dist         = "$WebDir\dist"
$Static       = "$Root\apps\server\static\ui"
$Python       = "$Root\.venv\Scripts\python.exe"
$UpdateScript = "$Root\apps\server\scripts\update_vite_assets.py"

function Require-Command ($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool not found: '$name'. Install it and try again."
    }
}

function Build-Wasm {
    Write-Host "`n==> Building Rust WASM..." -ForegroundColor Cyan
    Push-Location $RustDir
    try {
        $savedEAP = $ErrorActionPreference
        $ErrorActionPreference = "Continue"

        $useWasmPack = [bool](Get-Command wasm-pack -ErrorAction SilentlyContinue)

        if ($useWasmPack) {
            # Preferred path: wasm-pack handles cargo + wasm-bindgen + wasm-opt in one step.
            if ($dev) {
                Write-Host "    [dev] debug logging enabled"
                wasm-pack build --target web --out-dir "$WasmOut" --features wasm-start,dev-logging 2>&1 |
                    ForEach-Object { Write-Host $_ }
            } else {
                wasm-pack build --release --target web --out-dir "$WasmOut" --features wasm-start 2>&1 |
                    ForEach-Object { Write-Host $_ }
            }
            if ($LASTEXITCODE -ne 0) { throw "wasm-pack failed (exit $LASTEXITCODE)" }
        } else {
            # Fallback: cargo + wasm-bindgen-cli (+ optional wasm-opt)
            Write-Host "    [info] wasm-pack not found — using cargo + wasm-bindgen-cli"
            Require-Command "cargo"
            Require-Command "wasm-bindgen"

            $profile = if ($dev) { "debug" } else { "release" }
            $cargoFlags = if ($dev) { @("--features", "dev-logging") } else { @("--release") }
            $wasmTarget = "$RustDir\target\wasm32-unknown-unknown\$profile\ttrpg_rust_core.wasm"

            cargo build --target wasm32-unknown-unknown @cargoFlags 2>&1 |
                ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { throw "cargo build failed (exit $LASTEXITCODE)" }

            New-Item -ItemType Directory -Path $WasmOut -Force | Out-Null
            wasm-bindgen --target web --out-dir "$WasmOut" "$wasmTarget" 2>&1 |
                ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { throw "wasm-bindgen failed (exit $LASTEXITCODE)" }

            # Optional wasm-opt pass (skipped if not installed)
            $bgWasm = "$WasmOut\ttrpg_rust_core_bg.wasm"
            if ((Get-Command wasm-opt -ErrorAction SilentlyContinue) -and (Test-Path $bgWasm)) {
                Write-Host "    [opt] running wasm-opt -O3"
                wasm-opt -O3 "$bgWasm" -o "$bgWasm" 2>&1 | ForEach-Object { Write-Host $_ }
            } else {
                Write-Host "::warning::wasm-opt not found — WASM output is NOT size-optimized. Install binaryen to enable -O3 optimization." -ForegroundColor Yellow
            }
        }

        $ErrorActionPreference = $savedEAP
    } finally {
        if (-not $savedEAP) { $savedEAP = "Stop" }
        $ErrorActionPreference = $savedEAP
        Pop-Location
    }
    Write-Host "    WASM -> $WasmOut" -ForegroundColor DarkGreen
}

function Build-Web {
    Write-Host "`n==> Building React (Vite)..." -ForegroundColor Cyan
    # NODE_ENV must not be set to production here - pnpm would skip devDependencies.
    # Vite reads mode from --mode flag, not NODE_ENV during build steps.
    $savedNodeEnv = $env:NODE_ENV
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    Push-Location $WebDir
    try {
        # tsc type-check then vite build -- mirrors the `build` script in package.json
        pnpm exec tsc -b
        if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed" }

        if ($dev) {
            pnpm exec vite build --mode development
        } else {
            pnpm exec vite build
        }
        if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }
    } finally {
        if ($savedNodeEnv) { $env:NODE_ENV = $savedNodeEnv }
        Pop-Location
    }
    Write-Host "    dist -> $Dist" -ForegroundColor DarkGreen
}

function Test-Rust {
    Write-Host "`n==> Running Rust tests (native)..." -ForegroundColor Cyan
    Require-Command "cargo"
    Push-Location $RustDir
    try {
        cargo test 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) { throw "cargo test failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "    Rust tests passed." -ForegroundColor DarkGreen
}

function Test-TypeScript {
    Write-Host "`n==> Running TypeScript tests (jsdom project)..." -ForegroundColor Cyan
    Push-Location $WebDir
    try {
        pnpm exec vitest run --project jsdom 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) { throw "vitest failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "    TypeScript tests passed." -ForegroundColor DarkGreen
}

function Copy-ToServer {
    Write-Host "`n==> Copying build to server static..." -ForegroundColor Cyan

    if (-not (Test-Path "$Dist\.vite\manifest.json")) {
        throw "Build output missing at $Dist - run Build-Web first."
    }

    if (Test-Path $Static) {
        Remove-Item "$Static\*" -Recurse -Force
    } else {
        New-Item -ItemType Directory -Path $Static -Force | Out-Null
    }

    Copy-Item "$Dist\*" $Static -Recurse -Force
    Write-Host "    React dist  -> $Static" -ForegroundColor DarkGreen

    if (Test-Path $WasmOut) {
        $WasmDest = "$Static\wasm"
        New-Item -ItemType Directory -Path $WasmDest -Force | Out-Null
        Copy-Item "$WasmOut\*" $WasmDest -Recurse -Force
        Write-Host "    WASM        -> $WasmDest" -ForegroundColor DarkGreen
    } else {
        Write-Host "    [warn] No WASM at $WasmOut -- skipping wasm copy" -ForegroundColor Yellow
    }

    Write-Host "`n==> Updating vite asset templates..."
    & $Python $UpdateScript
    if ($LASTEXITCODE -ne 0) { throw "update_vite_assets.py failed" }
}

# -- Execution ------------------------------------------------------------------

$mode = if ($dev) { "development" } else { "production" }
Write-Host "Build mode: $mode" -ForegroundColor Yellow

try {
    if ($Test) {
        Test-Rust
        Test-TypeScript
    } elseif ($WasmOnly) {
        Build-Wasm
    } elseif ($WebOnly) {
        Build-Web
        if (-not $SkipCopy) { Copy-ToServer }
    } else {
        Build-Wasm
        Build-Web
        if (-not $SkipCopy) { Copy-ToServer }
    }
    Write-Host "`nDone." -ForegroundColor Green
} catch {
    Write-Host "`nBuild failed: $_" -ForegroundColor Red
    exit 1
}
