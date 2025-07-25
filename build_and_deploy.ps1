# PowerShell script to build Rust WASM, build React, copy assets, and update vite_assets.html for FastAPI

# 1. Build Rust WASM (assumes wasm-pack and correct Rust toolchain installed)
Write-Host "Building Rust WASM..."
Push-Location "clients/web/rust-core"
wasm-pack build --target web --out-dir ../public/wasm
Pop-Location

# 2. Build React (Vite)
Write-Host "Building React (Vite)..."
Push-Location "clients/web/web-ui"
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
