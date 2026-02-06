# PowerShell script to build Rust WASM, build React, copy assets, and update vite_assets.html for FastAPI
# Usage: .\build_and_deploy.ps1 [-dev]
# -dev: Build in development mode with unminified React for debugging

param(
    [switch]$dev
)

$buildMode = if ($dev) { "development" } else { "production" }
Write-Host "Build mode: $buildMode"

# 1. Build Rust WASM with proper logging configuration
Write-Host "Building Rust WASM..."
Push-Location "clients/web/rust-core"

if ($dev) {
    # Development build: Enable all logging features for debugging
    Write-Host "(Development mode: Enabling debug logging features for WASM)"
    wasm-pack build --target web --out-dir ../public/wasm --features dev-logging
} else {
    # Production build: No logging features for optimal performance
    Write-Host "(Production mode: No logging features - optimized for performance)"
    wasm-pack build --target web --out-dir ../public/wasm --release
}

Pop-Location

# 2. Build React (Vite)
Write-Host "Building React (Vite) in $buildMode mode..."
Push-Location "clients/web/web-ui"
if ($dev) {
    $env:NODE_ENV = "development"
    Write-Host "(Development mode: React will be unminified with detailed error messages)"
} else {
    $env:NODE_ENV = "production"
}
npm run build
Pop-Location


# 3. Copy React build to FastAPI static directory
Write-Host "Copying React build to FastAPI static directory..."
$dist = "clients/web/web-ui/dist"
$static = "server_host/static/ui"
if (Test-Path $static) {
    Remove-Item "$static/*" -Recurse -Force
}
Copy-Item "$dist/*" $static -Recurse -Force

# 3b. Copy WASM files to FastAPI static directory
$wasmSrc = "clients/web/public/wasm"
$wasmDest = "$static/wasm"
if (!(Test-Path $wasmDest)) {
    New-Item -ItemType Directory -Path $wasmDest | Out-Null
}
Copy-Item "$wasmSrc/*" $wasmDest -Recurse -Force

# 4. Update vite_assets.html
Write-Host "Updating vite_assets.html..."
python server_host/scripts/update_vite_assets.py

Write-Host "Build and deploy complete."
