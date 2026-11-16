@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo 找不到 Node.js，改用瀏覽器直接開啟遊戲。
  start "" "%~dp0index.html"
  exit /b 0
)

start "財經棋局伺服器" cmd /c "cd /d ""%~dp0"" && node serve.mjs"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173/"

