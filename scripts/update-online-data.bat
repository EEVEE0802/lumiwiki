@echo off
echo ========================================
echo LumiWiki 线上数据更新工具
echo ========================================
echo.

REM 检查数据文件是否存在
if not exist "D:\LumiWiki\data\battle_start.csv" (
    echo [错误] 找不到 battle_start.csv 文件
    echo 请确保文件已放置在 D:\LumiWiki\data\ 目录
    pause
    exit /b 1
)

if not exist "D:\LumiWiki\data\battle_end.csv" (
    echo [错误] 找不到 battle_end.csv 文件
    echo 请确保文件已放置在 D:\LumiWiki\data\ 目录
    pause
    exit /b 1
)

echo [1/3] 开始转换数据...
node "D:\LumiWiki\scripts\convert-battle-data.mjs"
if errorlevel 1 (
    echo [错误] 数据转换失败
    pause
    exit /b 1
)

echo.
echo [2/3] 清理缓存...
del /F /Q "D:\LumiWiki\public\data\*.encoded" 2>nul
echo 缓存已清理

echo.
echo [3/3] 数据更新完成！
echo.
echo ========================================
echo 请刷新浏览器查看最新数据
echo 访问地址: http://localhost:3005/#/online-data
echo ========================================
echo.

pause
