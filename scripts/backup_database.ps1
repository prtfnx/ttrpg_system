# PowerShell Database Backup Script for TTRPG System
# Simple backup with timestamp and cleanup

param(
    [switch]$Production,
    [int]$KeepCount = 10
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = if ($Production) { "backups\prod" } else { "backups\dev" }
$dbFile = if ($Production) { "server_host\ttrpg_game.db" } else { "server_host\ttrpg.db" }

# Create backup directory
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

# Check if database exists
if (-not (Test-Path $dbFile)) {
    Write-Host "❌ Database not found: $dbFile" -ForegroundColor Red
    exit 1
}

# Create backup
$backupFile = "$backupDir\ttrpg_backup_$timestamp.db"
try {
    Copy-Item $dbFile $backupFile -Force
    $backupSize = [math]::Round((Get-Item $backupFile).Length / 1KB, 1)
    Write-Host "✅ Backup created: $backupFile ($backupSize KB)" -ForegroundColor Green
}
catch {
    Write-Host "❌ Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Cleanup old backups
$oldBackups = Get-ChildItem "$backupDir\ttrpg_backup_*.db" | Sort-Object CreationTime -Descending
if ($oldBackups.Count -gt $KeepCount) {
    $toDelete = $oldBackups | Select-Object -Skip $KeepCount
    foreach ($file in $toDelete) {
        Remove-Item $file.FullName -Force
        Write-Host "🗑️ Removed old backup: $($file.Name)" -ForegroundColor Yellow
    }
}

Write-Host "✅ Backup completed!" -ForegroundColor Green