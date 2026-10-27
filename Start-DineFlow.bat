@echo off
setlocal
cd /d "%~dp0"
title DineFlow
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-DineFlow.ps1" -KeepDatabaseOnExit %*
if errorlevel 1 pause
endlocal
