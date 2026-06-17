@echo off
chcp 65001 >nul
title GeoContour 啟動器
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   GeoContour 地質濃度擴散分析系統   ║
echo  ╚══════════════════════════════════════╝
echo.

set PORT=8080
set URL=http://localhost:%PORT%

:: 先試 Python 3
python --version >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] 找到 Python，正在啟動伺服器...
    echo  瀏覽器將自動開啟: %URL%
    start "" "%URL%"
    python -m http.server %PORT%
    goto :end
)

:: 試 Python (某些系統用 py)
py --version >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] 找到 Python，正在啟動伺服器...
    start "" "%URL%"
    py -m http.server %PORT%
    goto :end
)

:: 試 Node.js / npx serve
node --version >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] 找到 Node.js，正在安裝並啟動 serve...
    start "" "%URL%"
    npx --yes serve -p %PORT% .
    goto :end
)

:: 都沒找到
echo  [錯誤] 未找到 Python 或 Node.js！
echo.
echo  請安裝以下其中一個：
echo    Python 3: https://www.python.org/downloads/
echo    Node.js:  https://nodejs.org/
echo.
echo  安裝後重新執行此批次檔。
pause
goto :end

:end
