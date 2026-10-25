@echo off
setlocal
title DineFlow
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-DineFlow.ps1" %*
if errorlevel 1 pause
endlocal
