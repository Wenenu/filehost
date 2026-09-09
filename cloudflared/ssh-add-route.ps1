$ErrorActionPreference = 'Stop'

$path = Join-Path $PSScriptRoot 'config.yml'
$content = Get-Content -Path $path -Raw

if ($content -match 'ssh-upload\.wested\.lol') {
    Write-Host '  ssh ingress already present in config.yml - nothing to change.'
    exit 0
}

$block = "  - hostname: ssh-upload.wested.lol`r`n    service: ssh://localhost:22`r`n"
$catchAll = '  - service: http_status:404'

if ($content -match [regex]::Escape($catchAll)) {
    $content = $content -replace [regex]::Escape($catchAll), ($block + $catchAll)
    Set-Content -Path $path -Value $content -Encoding ascii
    Write-Host '  Added ssh-upload.wested.lol ingress to config.yml'
} else {
    Write-Host '  Could not find the catch-all ingress line in config.yml.' -ForegroundColor Yellow
    Write-Host '  Add this block manually, before the catch-all line:' -ForegroundColor Yellow
    Write-Host $block -ForegroundColor Yellow
    exit 1
}