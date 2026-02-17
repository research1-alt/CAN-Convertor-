Write-Host "`n[!] OSM LIVE: NUCLEAR RECOVERY STARTING" -ForegroundColor Cyan

# 1. Terminate all related processes
Write-Host "Stopping Node, Vite, and Electron processes..." -ForegroundColor Yellow
$procList = "node", "electron", "vite"
foreach ($p in $procList) {
    Stop-Process -Name $p -Force -ErrorAction SilentlyContinue
}

# 2. Local Directory Cleanup
Write-Host "Cleaning local build artifacts..." -ForegroundColor Yellow
$localFolders = "node_modules", "dist", ".vite", "package-lock.json"
foreach ($f in $localFolders) {
    if (Test-Path $f) { 
        Write-Host " Removing $f..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $f -ErrorAction SilentlyContinue 
    }
}

# 3. System Cache Cleanup (Fixes "Stack Buffer Overrun" and GPU errors)
Write-Host "Clearing Windows system caches..." -ForegroundColor Yellow
$appDataPaths = @(
    "$env:LOCALAPPDATA\osm-live-hud",
    "$env:LOCALAPPDATA\Electron",
    "$env:APPDATA\osm-live-hud",
    "$env:LOCALAPPDATA\electron-nodejs",
    "$env:LOCALAPPDATA\vite"
)

foreach ($path in $appDataPaths) {
    if (Test-Path $path) {
        Write-Host " Purging $path..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
    }
}

# 4. Reinstall and Rebuild
Write-Host "Reinstalling dependencies (Legacy Peer Deps mode)..." -ForegroundColor Yellow
try {
    # Using cmd /c to ensure npm is found in the path correctly on all Windows setups
    cmd /c "npm install --legacy-peer-deps"
} catch {
    Write-Host "CRITICAL: 'npm' command failed. Please ensure Node.js is installed and in your PATH." -ForegroundColor Red
}

Write-Host "`nRECOVERY SUCCESSFUL." -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Gray
Write-Host "1. Close this terminal window." -ForegroundColor White
Write-Host "2. Open a NEW PowerShell window." -ForegroundColor White
Write-Host "3. Run: npm run dev (for Web) or npm run electron:dev (for Desktop)" -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Gray