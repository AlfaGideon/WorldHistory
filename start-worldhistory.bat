@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo  WorldHistory Atlas - запуск на Windows

echo ============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установите Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] npm не найден. Обычно он ставится вместе с Node.js.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Устанавливаю зависимости. Это нужно только при первом запуске...
  call npm install
  if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

echo.
echo Приложение будет доступно по адресу: http://localhost:5173/
echo Если браузер не открылся автоматически, вставьте этот адрес вручную.
echo Для остановки сервера нажмите Ctrl+C в этом окне.
echo.
start "" http://localhost:5173/
call npm run dev -- --host 0.0.0.0
pause
