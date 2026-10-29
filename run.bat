@echo off
setlocal EnableExtensions
chcp 65001 >nul
rem Silent services are managed by the existing localhost Node controller.
rem Use Start.vbs / Stop.vbs for one-click use without an initial console.
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Can cai Node.js 24 LTS. Xem README.md.
  wscript.exe "%~dp0Start.vbs"
  exit /b 1
)
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=start"
if /i not "%ACTION%"=="start" if /i not "%ACTION%"=="stop" if /i not "%ACTION%"=="restart" if /i not "%ACTION%"=="status" (
  echo Cach dung: run.bat [start^|stop^|restart^|status]
  exit /b 1
)
node "%~dp0backend\dev\launcher.mjs" --local-development %ACTION%
exit /b %errorlevel%
