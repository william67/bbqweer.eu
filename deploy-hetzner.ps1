#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy bbqweer.eu to its own Hetzner VPS (root@bbqweer.eu, compose project /opt/bbqweer)

.DESCRIPTION
    One script per host, one unit per run (dev-standards\ops\deploy-scripts.md).
      frontend   stamp build time, build Angular, restore the placeholder, upload dist to
                 /opt/bbqweer/frontend/dist/frontend (bind-mounted into nginx), reload nginx
      nodejs     git pull --ff-only on the VPS, rebuild the nodejs container, reload nginx

    The script does not push. Push first: the VPS pulls from origin, and the script aborts on
    unpushed commits. Start it from PowerShell, not Git Bash (Git Bash's GNU tar breaks on C:\ paths).
    Runbook and server layout: docs/deploy-to-hetzner.md

.EXAMPLE
    .\deploy-hetzner.ps1 -Service nodejs
    .\deploy-hetzner.ps1 -Service frontend
#>
param(
    [Parameter(Mandatory)]
    [ValidateSet('nodejs', 'frontend')]
    [string]$Service
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------- CONFIG (the only part a project edits) ----------------
$Vps       = 'root@bbqweer.eu'
$Repo      = $PSScriptRoot
$Branch    = 'main'                                   # branch the VPS pulls
$AppDir    = '/opt/bbqweer'                           # git clone and compose project folder
$DistSrc   = Join-Path $Repo 'frontend/dist/frontend'
$DistDst   = '/opt/bbqweer/frontend/dist/frontend'    # bind-mounted into the nginx container
$EnvFile   = Join-Path $Repo 'frontend/src/environments/environment.production.ts'
$SiteUrl   = 'https://bbqweer.eu/'
# No health endpoint exists: this solar call exercises the nodejs container end to end.
$ApiUrl    = 'https://bbqweer.eu/api/solar/tomorrow?lat=52.09&lon=5.18&efficiency=0.85&inverters=[{"name":"test","type":"string","maxAcW":5000,"arrays":[{"panels":10,"wp":400,"tilt":35,"azimuth":0}]}]'
$SshOpts   = @('-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6')
# -------------------------------------------------------------------------

$LogFile = Join-Path $Repo 'deploy.log'

function Write-Log {
    param([string]$Msg, [string]$Color = 'White')
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $Msg"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LogFile -Value $line
}

function Write-Step {
    param([string]$Msg)
    Write-Host ''
    Write-Host "-- $Msg" -ForegroundColor Cyan
    Add-Content -Path $LogFile -Value "`n-- $Msg"
}

# Native tools (ssh, scp, tar, git, npx) write progress to stderr; under 'Stop' that aborts a
# deploy that succeeded. Judge them by exit code only.
function Invoke-Native {
    param([string]$Description, [scriptblock]$Command)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command 2>&1 | ForEach-Object { Write-Host "    $_"; Add-Content -Path $LogFile -Value "    $_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) { throw "$Description failed (exit code $code)" }
}

$startTime = Get-Date
Add-Content -Path $LogFile -Value ("`n" + ('=' * 60) + "`nDeploy $Service $startTime`n" + ('=' * 60))
Write-Log "Deploying $Service -> $Vps" 'Cyan'

try {
    # -- 1. Guard: the VPS pulls from origin, so unpushed commits would not be deployed
    Write-Step 'Checking for unpushed commits'
    # Compares against the local origin/<branch> ref that `git push` keeps current: no network
    # call, so no GitHub login prompt.
    Set-Location $Repo
    $unpushed = git log "origin/$Branch..HEAD" --oneline
    if ($unpushed) {
        Write-Host ($unpushed | Out-String)
        throw 'Unpushed commits - push first, the VPS pulls from origin.'
    }
    $dirty = git status --porcelain
    if ($dirty) { Write-Log '  Warning: uncommitted changes (the frontend build uses them, nodejs does not)' 'Yellow' }
    Write-Log '  Nothing unpushed' 'Green'

    if ($Service -eq 'frontend') {
        # -- 2. Stamp the build time into the environment file, build, always restore the placeholder
        Write-Step 'Building Angular frontend'
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        $stamp     = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        $original  = [System.IO.File]::ReadAllText($EnvFile)
        if ($original -notmatch 'BUILD_TIME_PLACEHOLDER') { throw "BUILD_TIME_PLACEHOLDER not found in $EnvFile (is a stamp left over from an earlier run?)" }
        [System.IO.File]::WriteAllText($EnvFile, ($original -replace 'BUILD_TIME_PLACEHOLDER', $stamp), $utf8NoBom)
        Write-Log "  Stamped: $stamp" 'Green'
        try {
            Push-Location (Join-Path $Repo 'frontend')
            try {
                Invoke-Native 'ng build' { npx ng build --configuration production }
            } finally {
                Pop-Location
            }
        } finally {
            # Restore the exact original content, even if the build failed
            [System.IO.File]::WriteAllText($EnvFile, $original, $utf8NoBom)
        }
        Write-Log '  Build complete, placeholder restored' 'Green'

        # -- 3. Upload as tarball (Windows tar.exe by full path: GNU tar from Git Bash reads C:\ as host:path)
        Write-Step "Uploading dist -> $DistDst"
        $tarFile = Join-Path $env:TEMP 'bbqweer-dist.tar.gz'
        Invoke-Native 'tar' { & (Join-Path $env:SystemRoot 'System32\tar.exe') -czf $tarFile -C $DistSrc . }
        Invoke-Native 'scp' { scp @SshOpts $tarFile "${Vps}:/tmp/bbqweer-dist.tar.gz" }
        Remove-Item $tarFile
        # Empty the directory instead of deleting it: nginx bind-mounts it.
        Invoke-Native 'unpack dist' { ssh @SshOpts $Vps "mkdir -p $DistDst && find $DistDst -mindepth 1 -delete && tar xzf /tmp/bbqweer-dist.tar.gz -C $DistDst && rm /tmp/bbqweer-dist.tar.gz" }
        Write-Log '  Uploaded' 'Green'
    } else {
        # -- 2. Pull (ff-only: a merge would create a commit on the VPS) + rebuild only nodejs.
        # Backend code is baked into the image: 'restart' would run the old code, so always --build.
        Write-Step 'Pulling and rebuilding nodejs'
        Invoke-Native 'rebuild nodejs' { ssh @SshOpts $Vps "cd $AppDir && git pull --ff-only && docker compose up -d --build nodejs" }
        Write-Log '  nodejs updated' 'Green'
    }

    # nginx resolves the nodejs upstream once at startup and keeps the old container IP, and serves
    # the frontend from a bind mount. A graceful reload covers both and drops no connections.
    Write-Step 'Reloading nginx'
    Invoke-Native 'nginx reload' { ssh @SshOpts $Vps "cd $AppDir && docker compose exec -T nginx nginx -t && docker compose exec -T nginx nginx -s reload" }
    Write-Log '  nginx reloaded' 'Green'

    if ($Service -eq 'nodejs') {
        Write-Step 'Last log lines of nodejs'
        Invoke-Native 'docker logs' { ssh @SshOpts $Vps "sleep 5; cd $AppDir && docker compose logs --tail 15 nodejs" }
    }

    # -- Health check through the public URL (not from inside the container)
    Write-Step 'Health check'
    Start-Sleep -Seconds 3
    $url = if ($Service -eq 'nodejs') { $ApiUrl } else { $SiteUrl }
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -ne 200) { throw "Health check returned HTTP $($response.StatusCode)" }
    Write-Log "  $url -> 200" 'Green'

    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    Write-Host ''
    Write-Log "Deploy $Service complete in ${elapsed}s" 'Green'
    exit 0
} catch {
    Write-Log "FAILED: $($_.Exception.Message)" 'Red'
    exit 1
}
