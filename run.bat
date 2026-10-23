@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title BTL Cloud
rem ======================================================================
rem  Chay toan bo du an tren Windows:
rem    run.bat        bat MySQL + kho S3, backend :3000, frontend :5173, mo trinh duyet
rem    run.bat stop   tat tat ca
rem  Co Docker    -> docker compose (giong may cac thanh vien khac).
rem  Khong Docker -> tu tai MySQL 8.4.7 + SeaweedFS 4.48 ban portable vao
rem                  %LOCALAPPDATA%\btl-cloud-services (lan dau ~300 MB).
rem  Yeu cau: Node.js 24 LTS.
rem ======================================================================

set "ROOT=%~dp0"
set "SVC=%LOCALAPPDATA%\btl-cloud-services"
set "MYSQL_VER=mysql-8.4.7-winx64"
set "MYSQL_HOME=%SVC%\%MYSQL_VER%"
set "MYSQL_URL=https://cdn.mysql.com//archives/mysql-8.4/%MYSQL_VER%.zip"
set "WEED_URL=https://github.com/seaweedfs/seaweedfs/releases/download/4.48/windows_amd64.zip"
set "CURL=%SystemRoot%\System32\curl.exe"
set "TAR=%SystemRoot%\System32\tar.exe"
set "MYSQL_CLI=--default-character-set=utf8mb4 -uroot -h127.0.0.1 -P3306"

if /i "%~1"=="stop" goto :stop

where node >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Chưa cài Node.js 24 LTS: https://nodejs.org
  goto :fail
)

docker info >nul 2>nul
if errorlevel 1 (set "MODE=portable") else (set "MODE=docker")
echo [1/5] Khởi động MySQL + kho S3 [chế độ: !MODE!]
if "!MODE!"=="docker" (
  pushd "%ROOT%"
  docker compose up -d --wait
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
) else (
  call :portable
  if errorlevel 1 goto :fail
)

echo [2/5] Cài thư viện nếu chưa có
if not exist "%ROOT%backend\node_modules\" (
  pushd "%ROOT%backend"
  call npm ci
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)
if not exist "%ROOT%frontend\node_modules\" (
  pushd "%ROOT%frontend"
  call npm ci
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)
if not exist "%ROOT%backend\.env" copy "%ROOT%backend\.env.example" "%ROOT%backend\.env" >nul

echo [3/5] Áp dụng migration và tạo bucket
pushd "%ROOT%backend"
call npm run --silent prisma:deploy
if errorlevel 1 (
  popd
  goto :fail
)
call npm run --silent storage:init
if errorlevel 1 (
  popd
  goto :fail
)
popd

echo [4/5] Mở backend :3000 và frontend :5173 trong cửa sổ riêng
rem BTL_CLOUD_WINDOW nam trong command line de "run.bat stop" tim dung cua so (ten cua so khong tin cay tren Windows Terminal)
"%CURL%" -s -o nul http://localhost:3000/api/health
if errorlevel 1 start "BTL Backend" /d "%ROOT%backend" cmd /k "set BTL_CLOUD_WINDOW=backend&& npm run dev"
"%CURL%" -s -o nul http://localhost:5173
if errorlevel 1 start "BTL Frontend" /d "%ROOT%frontend" cmd /k "set BTL_CLOUD_WINDOW=frontend&& npm run dev"

echo [5/5] Chờ web sẵn sàng
set /a N=0
:wait_web
"%CURL%" -s -o nul http://localhost:3000/api/health && "%CURL%" -s -o nul http://localhost:5173 && goto :web_ready
set /a N+=1
if !N! geq 90 (
  echo [LỖI] Backend hoặc frontend không lên sau 90 giây. Xem cửa sổ "BTL Backend" / "BTL Frontend".
  goto :fail
)
ping -n 2 127.0.0.1 >nul
goto :wait_web

:web_ready
start "" http://localhost:5173
echo.
echo Đã chạy xong:  web  http://localhost:5173   ^|   API  http://localhost:3000/api/health
echo Tắt: chạy "run.bat stop" hoặc đóng các cửa sổ BTL.
exit /b 0

rem ---------------------------------------------------------------------
:portable
if not exist "%SVC%" mkdir "%SVC%"
if not exist "%MYSQL_HOME%\bin\mysqld.exe" (
  if not exist "%SVC%\%MYSQL_VER%.zip" (
    echo       Tải MySQL 8.4.7 - khoảng 260 MB, chỉ lần đầu...
    "%CURL%" -L --fail -o "%SVC%\%MYSQL_VER%.zip" "%MYSQL_URL%"
    if errorlevel 1 exit /b 1
  )
  echo       Giải nén MySQL...
  "%TAR%" -xf "%SVC%\%MYSQL_VER%.zip" -C "%SVC%"
  if errorlevel 1 exit /b 1
)
if not exist "%SVC%\seaweedfs\weed.exe" (
  if not exist "%SVC%\seaweedfs.zip" (
    echo       Tải SeaweedFS 4.48 - khoảng 47 MB, chỉ lần đầu...
    "%CURL%" -L --fail -o "%SVC%\seaweedfs.zip" "%WEED_URL%"
    if errorlevel 1 exit /b 1
  )
  if not exist "%SVC%\seaweedfs" mkdir "%SVC%\seaweedfs"
  "%TAR%" -xf "%SVC%\seaweedfs.zip" -C "%SVC%\seaweedfs"
  if errorlevel 1 exit /b 1
)

rem MySQL: khoi tao du lieu lan dau (root khong mat khau, chi nghe 127.0.0.1 - CHI DUNG CHO DEV)
if not exist "%SVC%\mysql-data\" (
  echo       Khởi tạo dữ liệu MySQL lần đầu...
  "%MYSQL_HOME%\bin\mysqld.exe" --initialize-insecure --basedir="%MYSQL_HOME%" --datadir="%SVC%\mysql-data"
  if errorlevel 1 exit /b 1
)
"%MYSQL_HOME%\bin\mysqladmin.exe" %MYSQL_CLI% ping >nul 2>nul
if errorlevel 1 start "BTL MySQL" /min /d "%SVC%" "%MYSQL_HOME%\bin\mysqld.exe" --basedir="%MYSQL_HOME%" --datadir="%SVC%\mysql-data" --port=3306 --bind-address=127.0.0.1 --mysqlx=OFF --console
set /a N=0
:wait_mysql
"%MYSQL_HOME%\bin\mysqladmin.exe" %MYSQL_CLI% ping >nul 2>nul
if not errorlevel 1 goto :mysql_ready
set /a N+=1
if !N! geq 60 (
  echo [LỖI] MySQL không khởi động được - cổng 3306 có thể đang bị chiếm.
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto :wait_mysql
:mysql_ready
rem Tao DB + user giong docker-compose (idempotent), roi chay dung file init cua repo
"%MYSQL_HOME%\bin\mysql.exe" %MYSQL_CLI% -e "CREATE DATABASE IF NOT EXISTS btl_cloud CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'btl'@'%%' IDENTIFIED BY 'btl_dev_password'; GRANT ALL PRIVILEGES ON btl_cloud.* TO 'btl'@'%%';"
if errorlevel 1 exit /b 1
"%MYSQL_HOME%\bin\mysql.exe" %MYSQL_CLI% < "%ROOT%docker\mysql\init\01-init.sql"
if errorlevel 1 exit /b 1

rem SeaweedFS: S3 API o cong 9000, dung cung file cau hinh voi docker-compose
copy /y "%ROOT%docker\seaweedfs\s3.json" "%SVC%\s3.json" >nul
if not exist "%SVC%\seaweedfs-data" mkdir "%SVC%\seaweedfs-data"
"%CURL%" -s -o nul http://127.0.0.1:9000
if errorlevel 1 start "BTL SeaweedFS" /min /d "%SVC%\seaweedfs" "%SVC%\seaweedfs\weed.exe" server -dir="%SVC%\seaweedfs-data" -ip=127.0.0.1 -ip.bind=127.0.0.1 -master.volumeSizeLimitMB=1024 -volume.max=100 -s3 -s3.port=9000 -s3.config="%SVC%\s3.json"
set /a N=0
:wait_s3
"%CURL%" -s -o nul http://127.0.0.1:9000
if not errorlevel 1 goto :s3_ready
set /a N+=1
if !N! geq 60 (
  echo [LỖI] SeaweedFS không khởi động được - cổng 9000 có thể đang bị chiếm.
  exit /b 1
)
ping -n 2 127.0.0.1 >nul
goto :wait_s3
:s3_ready
rem Cho S3 gateway nhan cau hinh xong truoc khi tao bucket
ping -n 4 127.0.0.1 >nul
exit /b 0

rem ---------------------------------------------------------------------
:stop
echo Đang tắt dự án...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'BTL_CLOUD_WINDOW=' } | ForEach-Object { taskkill /pid $_.ProcessId /t /f }" >nul 2>nul
docker info >nul 2>nul
if not errorlevel 1 (
  pushd "%ROOT%"
  docker compose stop
  popd
)
if exist "%MYSQL_HOME%\bin\mysqladmin.exe" "%MYSQL_HOME%\bin\mysqladmin.exe" %MYSQL_CLI% shutdown >nul 2>nul
taskkill /im weed.exe /f >nul 2>nul
echo Đã tắt.
exit /b 0

:fail
echo.
echo [LỖI] Khởi động thất bại, xem thông báo phía trên.
pause
exit /b 1
