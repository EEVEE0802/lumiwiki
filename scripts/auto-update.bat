@echo off
cd /d "%~dp0.."
echo. >> auto-update.log
echo === [%date% %time%] auto-update %* === >> auto-update.log
node scripts\auto-update.mjs %* >> auto-update.log 2>&1
