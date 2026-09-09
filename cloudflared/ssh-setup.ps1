$ErrorActionPreference = 'Stop'

Write-Host '[1/3] Installing OpenSSH Server...'
try {
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
} catch {
    Write-Host '  (OpenSSH Server may already be installed - continuing)'
}

Write-Host '[2/3] Starting sshd...'
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

Write-Host '[3/3] Installing access key...'
$key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPPHpFoI96cMArpT5SwPZ0LoXj6gY49jber55Hmi2xlV codebuff-upload-2ndpc'

# Standard user account: key goes in the user's .ssh folder
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ssh" | Out-Null
$userKeys = "$env:USERPROFILE\.ssh\authorized_keys"
if (-not (Test-Path $userKeys) -or -not (Select-String -Path $userKeys -SimpleMatch $key -Quiet)) {
    Add-Content -Path $userKeys -Value $key -Encoding ascii
    Write-Host "  Added key for $env:USERNAME"
}

# Administrator accounts: sshd reads from administrators_authorized_keys instead
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')
if ($isAdmin) {
    $adminKeys = 'C:\ProgramData\ssh\administrators_authorized_keys'
    if (-not (Test-Path $adminKeys) -or -not (Select-String -Path $adminKeys -SimpleMatch $key -Quiet)) {
        Add-Content -Path $adminKeys -Value $key -Encoding ascii
        icacls $adminKeys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
        Write-Host '  Added key to administrators_authorized_keys'
    }
}

Restart-Service sshd

Write-Host ''
Write-Host 'Done. Verify with:  Get-Service sshd   (should say Running)'
Write-Host 'And:                netstat -ano | findstr :22   (should show LISTENING)'