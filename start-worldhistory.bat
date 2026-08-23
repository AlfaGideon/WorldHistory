@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo  WorldHistory Atlas - запуск на Windows
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установите Node.js LTS 22 или новее: https://nodejs.org/
  pause
  exit /b 1
)

rem Backend использует встроенный node:sqlite, поэтому нужен Node 22.5+.
node -e "const p=process.versions.node.split('.').map(Number);if(p[0]<22||(p[0]===22&&p[1]<5))process.exit(1)" >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Нужен Node.js версии 22.5 или новее, сейчас установлен:
  node -v
  echo Скачайте актуальную LTS-версию с https://nodejs.org/ , установите и запустите батник заново.
  echo Со старым Node.js backend-часть молча не запускается - в браузере будет ошибка 502.
  pause
  exit /b 1
)

rem Если порты уже заняты - скорее всего, приложение запущено с прошлого раза.
powershell -NoProfile -Command "foreach($p in 3001,5173){try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',$p);$c.Close();exit 1}catch{}}" >nul 2>nul
if errorlevel 1 (
  echo [ВНИМАНИЕ] Порт 3001 или 5173 уже занят - похоже, приложение уже запущено.
  echo Если в браузере ошибка 502: закройте старые окна запуска и все процессы node.exe
  echo через диспетчер задач, затем запустите этот батник заново.
  echo Продолжаю через 5 секунд...
  timeout /t 5 /nobreak >nul
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
echo Батник запускает ОБА сервера: frontend (Vite, порт 5173) и backend (API, порт 3001).
echo Приложение: http://localhost:5173/
echo Браузер откроется сам, когда оба сервера будут готовы. Это окно не закрывайте -
echo в нём работают серверы и показываются логи. Для остановки нажмите Ctrl+C.
echo.

rem Ждём готовности frontend И backend (проверка /api/health через прокси), затем открываем браузер.
start "WorldHistory: ожидание запуска" /min powershell -NoProfile -WindowStyle Hidden -Command "$w=$false;$a=$false;for($i=0;$i -lt 240;$i++){if(-not $w){try{if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:5173/').StatusCode -eq 200){$w=$true}}catch{}}if($w -and -not $a){try{if((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:5173/api/health').StatusCode -eq 200){$a=$true}}catch{}}if($w -and $a){break}Start-Sleep -Milliseconds 500};Start-Process 'http://localhost:5173/'"

call npm run dev

echo.
echo [Остановлено] Серверы выключены. Если это произошло само по себе -
echo прокрутите лог выше, там указана причина (например, ошибка запуска API).
pause
