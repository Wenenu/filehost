@echo off
rem Starts the Cloudflare Tunnel for upload.wested.lol.
rem Run this AFTER setup-tunnel.bat, and keep it running alongside start.bat.
cd /d %~dp0
cloudflared --config config.yml tunnel run upload
pause