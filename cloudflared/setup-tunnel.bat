@echo off
rem One-time setup: creates the Cloudflare Tunnel for upload.wested.lol and
rem writes cloudflared\config.yml. Run this once on the PC that hosts the server.
rem Requires: cloudflared installed and in PATH, wested.lol on Cloudflare.
setlocal
cd /d %~dp0

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared was not found in PATH.
  echo Download it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo (unzip it and put cloudflared.exe somewhere, then add that folder to your PATH)
  pause
  exit /b 1
)

echo [1/4] Logging in to Cloudflare (your browser will open)...
cloudflared tunnel login
if errorlevel 1 (echo Login failed. & pause & exit /b 1)

echo [2/4] Creating tunnel "upload" (safe to re-run, it says it already exists)...
cloudflared tunnel create upload

echo [3/4] Routing upload.wested.lol to the tunnel...
cloudflared tunnel route dns upload upload.wested.lol
if errorlevel 1 (
  echo DNS routing failed. Make sure wested.lol is on Cloudflare and try again.
  pause
  exit /b 1
)

echo [4/4] Writing cloudflared\config.yml...
set TUNNEL_ID=
for /f "tokens=1" %%i in ('cloudflared tunnel list ^| findstr /i "upload"') do set TUNNEL_ID=%%i
if not defined TUNNEL_ID (
  echo Could not read the tunnel ID. Open cloudflared\config.yml and set credentials-file manually.
) else (
  > config.yml echo tunnel: upload
  >> config.yml echo credentials-file: %USERPROFILE%\.cloudflared\%TUNNEL_ID%.json
  >> config.yml echo ingress:
  >> config.yml echo   - hostname: upload.wested.lol
  >> config.yml echo     service: http://localhost:3000
  >> config.yml echo   - service: http_status:404
  echo Wrote cloudflared\config.yml with tunnel ID %TUNNEL_ID%
)

echo.
echo Done! Start the tunnel with run-tunnel.bat, then the server with ..\start.bat
pause