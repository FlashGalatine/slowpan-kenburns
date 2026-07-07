@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on PATH.
  echo Install it from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist config.json (
  copy /y config.example.json config.json >nul
  echo Created config.json from the example.
)

node src\server.js
pause
