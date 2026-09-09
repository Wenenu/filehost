@echo off
rem One-time SSH setup for this PC: installs Windows OpenSSH Server and
rem installs the access key so remote support can log in.
rem Run by right-clicking -> "Run as administrator".
cd /d %~dp0

net session >nul 2>&1
if errorlevel 1 (
  echo This script needs administrator rights.
  echo Right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ssh-setup.ps1"
echo.
pause