@echo off
rem Adds ssh-upload.wested.lol to the Cloudflare tunnel so remote support
rem can SSH into this PC. Run as a normal user, then restart run-tunnel.bat.
cd /d %~dp0

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared was not found in PATH.
  echo Install it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

echo [1/3] Routing ssh-upload.wested.lol to this PC...
cloudflared tunnel route dns upload ssh-upload.wested.lol

echo [2/3] Adding ingress rule to config.yml...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ssh-add-route.ps1"

echo [3/3] Restart the tunnel: close the run-tunnel.bat window and open it again.
echo.
pause