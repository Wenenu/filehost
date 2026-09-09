@echo off
rem Double-click this file on Windows to install and start the upload server.
cd /d %~dp0
rem Create .env with the public domain on first run (edit it later if needed).
if not exist .env (
  echo Creating .env with default settings...
  > .env echo BASE_URL=https://upload.wested.lol
  >> .env echo PORT=3000
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
echo Starting upload server...
call npm start
pause