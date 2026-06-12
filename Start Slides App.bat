@echo off
cd /d "%~dp0"
title Slides app  -  keep this window open; close it to stop the app
echo.
echo   Starting the slides app at  http://127.0.0.1:3210
echo   Keep this window open while you use the app. Close it to stop.
echo.

rem First run on a new machine: install dependencies if they are missing.
if not exist "app\node_modules" (
  echo   First run: installing dependencies. This can take a few minutes...
  call npm run install:app
)

rem Once the server has had a moment to start, open the app in its own window.
rem Chrome in app-window mode if it is present, otherwise the default browser.
start "" /min cmd /c "timeout /t 5 >nul & (start chrome --app=http://127.0.0.1:3210 || start http://127.0.0.1:3210)"

rem Always build then serve, so a launch can never run a stale frontend bundle.
rem Vite caches, so when only deck content changed the rebuild is near-instant.
call npm start
