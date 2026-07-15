@echo off
cd /d "%~dp0.."
echo. >> auto-update.log
echo === [%date% %time%] auto-update-all %* === >> auto-update.log
node scripts\auto-update-all.mjs %* >> auto-update.log 2>&1
