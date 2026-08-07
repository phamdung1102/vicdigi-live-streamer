@echo off
setlocal
cd /d "%~dp0"

echo Checking system...
node check-system.js
if errorlevel 1 exit /b 1

echo Building Windows installer...
npm.cmd run dist
exit /b %errorlevel%
