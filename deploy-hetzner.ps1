# deploy-hetzner.ps1
# Full production deploy to bbqweer.eu (Hetzner VPS)
# Usage: .\deploy-hetzner.ps1
#
# Steps:
#   1. Check for uncommitted changes
#   2. Push to GitHub
#   3. Build Angular frontend (stamp + build + restore placeholder)
#   4. Upload dist to VPS
#   5. SSH: git pull + rebuild nodejs + restart nginx
#   6. Health check

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$VPS      = 'root@bbqweer.eu'
$DIST_SRC = 'C:/Apps/bbqweer.eu/frontend/dist/frontend/*'
$DIST_DST = '/opt/bbqweer/frontend/dist/frontend/'
$ENV_FILE = 'C:/Apps/bbqweer.eu/frontend/src/environments/environment.production.ts'
$HEALTH   = 'https://bbqweer.eu/api/solar/tomorrow?lat=52.09&lon=5.18&efficiency=0.85&inverters=[{"name":"test","type":"string","maxAcW":5000,"arrays":[{"panels":10,"wp":400,"tilt":35,"azimuth":0}]}]'

function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "`n    FAILED: $msg" -ForegroundColor Red; exit 1 }

# -- 1. Uncommitted changes check ---------------------------------------------
Write-Step "Checking for uncommitted changes"
$status = git -C C:/Apps/bbqweer.eu status --porcelain
if ($status) {
    Write-Host $status
    Write-Fail "Uncommitted changes detected. Commit or stash before deploying."
}
Write-Ok "Working tree is clean"

# -- 2. Push to GitHub --------------------------------------------------------
Write-Step "Pushing to GitHub"
git -C C:/Apps/bbqweer.eu push
if ($LASTEXITCODE -ne 0) { Write-Fail "git push failed" }
Write-Ok "Pushed"

# -- 3. Build Angular frontend ------------------------------------------------
Write-Step "Building Angular frontend"

# Stamp build time (UTF-8 no-BOM to avoid polluting the source file)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$ts        = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$content   = [System.IO.File]::ReadAllText($ENV_FILE)
$stamped   = $content -replace 'BUILD_TIME_PLACEHOLDER', $ts
[System.IO.File]::WriteAllText($ENV_FILE, $stamped, $utf8NoBom)
Write-Ok "Stamped: $ts"

try {
    Push-Location C:/Apps/bbqweer.eu/frontend
    ng build --configuration=production
    if ($LASTEXITCODE -ne 0) { throw "ng build failed" }
} finally {
    # Always restore placeholder, even if build fails
    $restored = ([System.IO.File]::ReadAllText($ENV_FILE)) -replace '\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', 'BUILD_TIME_PLACEHOLDER'
    [System.IO.File]::WriteAllText($ENV_FILE, $restored, $utf8NoBom)
    Pop-Location
}
Write-Ok "Build complete, placeholder restored"

# -- 4. Upload dist to VPS ----------------------------------------------------
Write-Step "Uploading frontend dist to VPS"
scp -r $DIST_SRC "${VPS}:${DIST_DST}"
if ($LASTEXITCODE -ne 0) { Write-Fail "scp failed" }
Write-Ok "Uploaded"

# -- 5. VPS: git pull + rebuild nodejs + restart nginx ------------------------
Write-Step "Deploying on VPS (git pull + rebuild nodejs + restart nginx)"
ssh $VPS "cd /opt/bbqweer && git pull && docker compose up -d --build nodejs && docker compose restart nginx"
if ($LASTEXITCODE -ne 0) { Write-Fail "VPS deploy commands failed" }
Write-Ok "VPS updated"

# -- 6. Health check ----------------------------------------------------------
Write-Step "Health check"
Start-Sleep -Seconds 5   # give nodejs a moment to start

try {
    $response = Invoke-WebRequest -Uri $HEALTH -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -eq 200) {
        Write-Ok "API responded 200 - deploy successful"
    } else {
        Write-Fail "API returned $($response.StatusCode)"
    }
} catch {
    Write-Fail "Health check failed: $_"
}

Write-Host "`nDeploy complete!" -ForegroundColor Green
