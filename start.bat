@echo off
rem Double-click this file on Windows to install and start the upload server.
cd /d %~dp0
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
echo Starting upload server...
call npm start
pause