# Run benchmarks across the entire stack.
#
# Usage:
#   .\scripts\bench.ps1              # all benchmarks
#   .\scripts\bench.ps1 -Rust        # Rust only (Criterion)
#   .\scripts\bench.ps1 -Python      # Python only (pytest-benchmark)
#   .\scripts\bench.ps1 -Web         # Frontend only (vitest bench)
#   .\scripts\bench.ps1 -Save        # save baselines for regression compare
#   .\scripts\bench.ps1 -Compare     # compare against saved baselines

param(
    [switch]$Rust,
    [switch]$Python,
    [switch]$Web,
    [switch]$Save,
    [switch]$Compare
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root   = Split-Path $PSScriptRoot -Parent
$Venv   = "$Root\.venv\Scripts\Activate.ps1"

$runAll = -not ($Rust -or $Python -or $Web)

# ── Rust (Criterion) ──
if ($runAll -or $Rust) {
    Write-Host "`n==> Rust benchmarks (Criterion)" -ForegroundColor Cyan
    Push-Location "$Root\packages\rust-core"
    try {
        # Auto-discover bench names from Cargo.toml [[bench]] sections
        $benchNames = (Get-Content Cargo.toml -Raw) -split '\r?\n' |
            Where-Object { $_ -match '^\s*name\s*=' } |
            Select-Object -Skip 0 |
            ForEach-Object { ($_ -replace '.*=\s*"([^"]+)"', '$1').Trim() }
        # Only keep actual [[bench]] names (Cargo.toml has one [package] name before them)
        $cargoContent = Get-Content Cargo.toml -Raw
        $benchNames = [regex]::Matches($cargoContent, '\[\[bench\]\]\s*\r?\nname\s*=\s*"([^"]+)"') |
            ForEach-Object { $_.Groups[1].Value }

        if (-not $benchNames) { throw "No [[bench]] targets found in Cargo.toml" }
        Write-Host "  Found bench targets: $($benchNames -join ', ')" -ForegroundColor DarkGray

        $benchFlags = $benchNames | ForEach-Object { "--bench", $_ }
        if ($Save) {
            cargo bench @benchFlags -- --save-baseline main
        } elseif ($Compare) {
            cargo bench @benchFlags -- --baseline main
        } else {
            cargo bench @benchFlags
        }
        if ($LASTEXITCODE -ne 0) { throw "Rust bench failed" }
    } finally { Pop-Location }
}

# ── Python (pytest-benchmark) ──
if ($runAll -or $Python) {
    Write-Host "`n==> Python benchmarks (pytest-benchmark)" -ForegroundColor Cyan

    if (Test-Path $Venv) { . $Venv }

    $pyBenchArgs = @(
        "--benchmark-only"
        "--benchmark-sort=mean"
        "--benchmark-columns=mean,stddev,rounds"
    )
    if ($Save)    { $pyBenchArgs += "--benchmark-autosave" }
    if ($Compare) { $pyBenchArgs += "--benchmark-compare" }

    # core-table — auto-discover any bench_*.py in tests/
    Write-Host "  [core-table]" -ForegroundColor Yellow
    Push-Location "$Root\packages\core-table"
    try {
        & python -m pytest tests/ --override-ini="python_files=bench_*.py" @pyBenchArgs
        if ($LASTEXITCODE -ne 0) { throw "core-table bench failed" }
    } finally { Pop-Location }

    # server — auto-discover any bench_*.py under tests/benchmarks/
    Write-Host "  [server]" -ForegroundColor Yellow
    Push-Location "$Root\apps\server"
    try {
        & python -m pytest tests/benchmarks/ --override-ini="addopts=" --override-ini="python_files=bench_*.py" @pyBenchArgs
        if ($LASTEXITCODE -ne 0) { throw "server bench failed" }
    } finally { Pop-Location }
}

# ── Frontend (vitest bench) ──
if ($runAll -or $Web) {
    Write-Host "`n==> Frontend benchmarks (vitest bench)" -ForegroundColor Cyan
    Push-Location "$Root\apps\web-ui"
    try {
        pnpm bench
        if ($LASTEXITCODE -ne 0) { throw "Frontend bench failed" }
    } finally { Pop-Location }
}

Write-Host "`n==> All benchmarks complete" -ForegroundColor Green
