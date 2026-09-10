# Build Rust WASM, React, copy assets to server, and update vite asset manifest.
#
# Stop the local server before deployment; assets and templates install with rollback.
# Usage:
#   .\build_and_deploy.ps1              # full production build
#   .\build_and_deploy.ps1 -dev         # development build (unminified, debug logging)
#   .\build_and_deploy.ps1 -WasmOnly    # build WASM only
#   .\build_and_deploy.ps1 -WebOnly     # build React only (skip WASM)
#   .\build_and_deploy.ps1 -SkipCopy    # build everything but don't copy to server
#   .\build_and_deploy.ps1 -CopyOnly    # deploy an existing successful build
#   .\build_and_deploy.ps1 -Test        # run Rust + TypeScript tests (no build)

param(
    [switch]$dev,
    [switch]$WasmOnly,
    [switch]$WebOnly,
    [switch]$SkipCopy,
    [switch]$Test,
    [switch]$CopyOnly,
    [string]$Python
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root         = $PSScriptRoot
$RustDir      = "$Root\packages\rust-core"
$WebDir       = "$Root\apps\web-ui"
$WasmOut      = "$WebDir\src\lib\wasm\generated"
$Dist         = "$WebDir\dist"
$Static       = "$Root\apps\server\static\ui"
$PackageScript = "$Root\apps\server\scripts\package_web_ui.py"

function Require-Command ($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool not found: '$name'. Install it and try again."
    }
}

function Resolve-Python {
    if ($Python) {
        $candidates = @($Python)
    } else {
        $candidates = @()
        if ($env:VIRTUAL_ENV) { $candidates += "$env:VIRTUAL_ENV\Scripts\python.exe" }
        $candidates += @("$Root\.venv311\Scripts\python.exe", "$Root\.venv\Scripts\python.exe", "python")
    }
    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) {
            & $command.Source -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
            if ($LASTEXITCODE -eq 0) { return $command.Source }
        }
    }
    throw "Python 3.11+ is required for packaging. Activate your environment or pass -Python <python.exe>."
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
                wasm-pack build --dev --locked --target web --out-dir "$WasmOut" --features wasm-start,dev-logging 2>&1 |
                    ForEach-Object { Write-Host $_ }
            } else {
                wasm-pack build --release --locked --target web --out-dir "$WasmOut" --features wasm-start 2>&1 |
                    ForEach-Object { Write-Host $_ }
            }
            if ($LASTEXITCODE -ne 0) { throw "wasm-pack failed (exit $LASTEXITCODE)" }
        } else {
            # Fallback: cargo + wasm-bindgen-cli (+ optional wasm-opt)
            Write-Host "    [info] wasm-pack not found — using cargo + wasm-bindgen-cli"
            Require-Command "cargo"
            Require-Command "wasm-bindgen"

            $profile = if ($dev) { "debug" } else { "release" }
            $cargoFlags = if ($dev) { @("--features", "wasm-start,dev-logging") } else { @("--release", "--features", "wasm-start") }
            $wasmTarget = "$RustDir\target\wasm32-unknown-unknown\$profile\ttrpg_rust_core.wasm"

            cargo build --locked --target-dir "$RustDir\target" --target wasm32-unknown-unknown @cargoFlags 2>&1 |
                ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { throw "cargo build failed (exit $LASTEXITCODE)" }

            New-Item -ItemType Directory -Path $WasmOut -Force | Out-Null
            wasm-bindgen --target web --out-dir "$WasmOut" "$wasmTarget" 2>&1 |
                ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -ne 0) { throw "wasm-bindgen failed (exit $LASTEXITCODE)" }

            # Optional wasm-opt pass (skipped if not installed)
            $bgWasm = "$WasmOut\ttrpg_rust_core_bg.wasm"
            if (-not $dev -and (Get-Command wasm-opt -ErrorAction SilentlyContinue) -and (Test-Path $bgWasm)) {
                Write-Host "    [opt] running wasm-opt -O3"
                wasm-opt -O3 "$bgWasm" -o "$bgWasm" 2>&1 | ForEach-Object { Write-Host $_ }
                if ($LASTEXITCODE -ne 0) { throw "wasm-opt failed (exit $LASTEXITCODE)" }
            } elseif (-not $dev) {
                Write-Host "::warning::wasm-opt not found — WASM output is NOT size-optimized. Install binaryen to enable -O3 optimization." -ForegroundColor Yellow
            }
        }

        $ErrorActionPreference = $savedEAP
    } finally {
        if (-not $savedEAP) { $savedEAP = "Stop" }
        $ErrorActionPreference = $savedEAP
        Pop-Location
    }
    # Sync generated types into the TS source tree so imports always match the actual WASM API.
    # wasm.d.ts is the hand-written historical file — ttrpg_rust_core.d.ts is the ground truth.
    $WasmSrc = "$WebDir\src\lib\wasm"
    Copy-Item "$WasmOut\ttrpg_rust_core.d.ts"     "$WasmSrc\ttrpg_rust_core.d.ts"     -Force
    Copy-Item "$WasmOut\ttrpg_rust_core_bg.wasm.d.ts" "$WasmSrc\ttrpg_rust_core_bg.wasm.d.ts" -Force
    Write-Host "    types synced -> $WasmSrc" -ForegroundColor DarkGreen

    Write-Host "    WASM -> $WasmOut" -ForegroundColor DarkGreen
}

function Build-Web {
    Write-Host "`n==> Building React (Vite)..." -ForegroundColor Cyan
    # Build with Vite defaults even if the calling shell has NODE_ENV set.
    $savedNodeEnv = $env:NODE_ENV
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    Push-Location $WebDir
    try {
        # tsc type-check then vite build -- mirrors the `build` script in package.json
        pnpm.cmd exec tsc -b
        if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed" }

        if ($dev) {
            pnpm.cmd exec vite build --mode development
        } else {
            pnpm.cmd exec vite build
        }
        if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }
    } finally {
        if ($null -ne $savedNodeEnv) { $env:NODE_ENV = $savedNodeEnv }
        else { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
        Pop-Location
    }
    Write-Host "    dist -> $Dist" -ForegroundColor DarkGreen
}

function Test-Rust {
    Write-Host "`n==> Running Rust tests (native)..." -ForegroundColor Cyan
    Require-Command "cargo"
    Push-Location $RustDir
    try {
        cargo test --locked
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
        pnpm.cmd exec vitest run --project jsdom
        if ($LASTEXITCODE -ne 0) { throw "vitest failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "    TypeScript tests passed." -ForegroundColor DarkGreen
}

function Copy-ToServer {
    Write-Host "`n==> Packaging build for server static..." -ForegroundColor Cyan
    & $Python $PackageScript
    if ($LASTEXITCODE -ne 0) { throw "UI packaging failed (exit $LASTEXITCODE)" }
    Write-Host "    React + WASM -> $Static" -ForegroundColor DarkGreen
}

# -- Execution ------------------------------------------------------------------

$mode = if ($dev) { "development" } else { "production" }
Write-Host "Build mode: $mode" -ForegroundColor Yellow

try {
    $selectedModes = @($WasmOnly, $WebOnly, $CopyOnly, $Test) | Where-Object { $_ }
    if (@($selectedModes).Count -gt 1) { throw "Choose only one of -WasmOnly, -WebOnly, -CopyOnly, or -Test." }
    if ($CopyOnly -and $SkipCopy) { throw "-CopyOnly cannot be combined with -SkipCopy." }
    if (-not $WasmOnly -and -not $CopyOnly) { Require-Command "pnpm.cmd" }
    if (-not $Test -and -not $WasmOnly -and -not $SkipCopy) {
        $Python = Resolve-Python
        Write-Host "Packaging Python: $Python"
    }
    if ($CopyOnly) {
        Copy-ToServer
    } elseif ($Test) {
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
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}
