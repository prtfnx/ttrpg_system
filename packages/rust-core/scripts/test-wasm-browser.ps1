#!/usr/bin/env pwsh
param(
    [string]$ChromePath = "",
    [string]$ChromeDriver = ""
)

$ErrorActionPreference = "Stop"
$ExpectedWasmPack = "0.13.1"
$ExpectedBindgen = "0.2.117"
$ExpectedChromeBuild = "151.0.7922"
$ExpectedDriver = "151.0.7922.138"
$DriverSha256 = "31E264DFCC36435AE7F7A4711CE78CAA5674F60FFA2C793B6B3E66378FABC32D"
$RustRoot = Split-Path $PSScriptRoot -Parent
$RunningOnWindows = $env:OS -eq "Windows_NT"

function Get-CommandVersion([string]$Command, [string]$Pattern) {
    $output = (& $Command --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $output -notmatch $Pattern) {
        throw "Unexpected version output from ${Command}: $output"
    }
    return $Matches[1]
}

$wasmPackVersion = Get-CommandVersion "wasm-pack" '^wasm-pack ([0-9.]+)$'
if ($wasmPackVersion -ne $ExpectedWasmPack) {
    throw "wasm-pack $ExpectedWasmPack is required; found $wasmPackVersion"
}

$cacheRoots = @()
if ($env:LOCALAPPDATA) {
    $cacheRoots += Join-Path $env:LOCALAPPDATA ".wasm-pack"
}
if ($env:HOME) {
    $cacheRoots += Join-Path $env:HOME ".cache/.wasm-pack"
}

$runnerName = if ($RunningOnWindows) { "wasm-bindgen-test-runner.exe" } else { "wasm-bindgen-test-runner" }
$runner = $null
foreach ($cacheRoot in $cacheRoots | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $cacheRoot)) {
        continue
    }
    $candidates = Get-ChildItem -LiteralPath $cacheRoot -Recurse -File -Filter $runnerName |
        Sort-Object LastWriteTime -Descending
    foreach ($candidate in $candidates) {
        $version = Get-CommandVersion $candidate.FullName '^wasm-bindgen-test-runner ([0-9.]+)$'
        if ($version -eq $ExpectedBindgen) {
            $runner = $candidate.FullName
            break
        }
    }
    if ($runner) { break }
}
if (-not $runner) {
    throw "wasm-bindgen-test-runner $ExpectedBindgen is missing; run the pinned WASM Node test first"
}

if (-not $ChromePath) {
    $chromeCommand = Get-Command chrome -ErrorAction SilentlyContinue
    if ($chromeCommand) {
        $ChromePath = $chromeCommand.Source
    } elseif ($RunningOnWindows) {
        $windowsCandidates = @(
            "$env:ProgramFiles/Google/Chrome/Application/chrome.exe",
            "${env:ProgramFiles(x86)}/Google/Chrome/Application/chrome.exe",
            "$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe"
        )
        $ChromePath = $windowsCandidates | Where-Object { Test-Path -LiteralPath $_ } |
            Select-Object -First 1
    }
}
if (-not $ChromePath -or -not (Test-Path -LiteralPath $ChromePath)) {
    throw "Pinned Chrome build $ExpectedChromeBuild is not installed"
}
$ChromePath = (Resolve-Path -LiteralPath $ChromePath).Path
$chromeVersion = if ($RunningOnWindows) {
    (Get-Item -LiteralPath $ChromePath).VersionInfo.ProductVersion
} else {
    Get-CommandVersion $ChromePath '([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)'
}
if (-not $chromeVersion.StartsWith("$ExpectedChromeBuild.")) {
    throw "Chrome build $ExpectedChromeBuild is required; found $chromeVersion"
}
$env:PATH = "$(Split-Path $ChromePath -Parent)$([IO.Path]::PathSeparator)$env:PATH"

if (-not $ChromeDriver) {
    if (-not $RunningOnWindows) {
        throw "Pass -ChromeDriver with the matching $ExpectedDriver executable"
    }
    $toolRoot = Join-Path $RustRoot "target/chrome-for-testing/$ExpectedDriver"
    $archive = Join-Path $toolRoot "chromedriver-win64.zip"
    $ChromeDriver = Join-Path $toolRoot "chromedriver-win64/chromedriver.exe"
    if (-not (Test-Path -LiteralPath $ChromeDriver)) {
        New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
        Invoke-WebRequest `
            "https://storage.googleapis.com/chrome-for-testing-public/$ExpectedDriver/win64/chromedriver-win64.zip" `
            -OutFile $archive
        $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
        if ($actualHash -ne $DriverSha256) {
            throw "ChromeDriver archive checksum mismatch: $actualHash"
        }
        Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
    }
}
$ChromeDriver = (Resolve-Path -LiteralPath $ChromeDriver).Path
$driverVersion = Get-CommandVersion $ChromeDriver '^ChromeDriver ([0-9.]+) '
if ($driverVersion -ne $ExpectedDriver) {
    throw "ChromeDriver $ExpectedDriver is required; found $driverVersion"
}

$env:CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER = $runner
$env:CHROMEDRIVER = $ChromeDriver
$env:WASM_BINDGEN_TEST_ONLY_WEB = "1"

Push-Location $RustRoot
try {
    & cargo test --target wasm32-unknown-unknown --test wasm_browser --locked
    if ($LASTEXITCODE -ne 0) {
        throw "Browser WASM tests failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
