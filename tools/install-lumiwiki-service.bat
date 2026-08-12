@echo off
REM 需要以管理员身份运行！
REM 右键此文件 -> 以管理员身份运行

setlocal
set NSSM=%~dp0nssm.exe
set SERVICE=LumiWiki
set PYTHON=C:\Python314\python.exe
set WORKDIR=D:\lumiwiki\dist

echo === 检查管理员权限 ===
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo [!] 需要以管理员身份运行此脚本
  echo [!] 请右键此文件 -^> 以管理员身份运行
  pause
  exit /b 1
)

echo === 检查是否已有同名服务 ===
sc query %SERVICE% >nul 2>&1
if not errorlevel 1 (
  echo [!] 服务 %SERVICE% 已存在，先移除...
  "%NSSM%" stop %SERVICE%
  "%NSSM%" remove %SERVICE% confirm
)

echo === 注册 %SERVICE% 服务 ===
"%NSSM%" install %SERVICE% "%PYTHON%" "-m" "http.server" "3005"
"%NSSM%" set %SERVICE% AppDirectory "%WORKDIR%"
"%NSSM%" set %SERVICE% DisplayName "LumiWiki Static Server"
"%NSSM%" set %SERVICE% Description "LumiWiki 内网 wiki 静态服务（端口 3005）"
"%NSSM%" set %SERVICE% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICE% AppExit Default Restart
"%NSSM%" set %SERVICE% AppRestartDelay 3000
"%NSSM%" set %SERVICE% AppStdout "D:\lumiwiki\tools\lumiwiki-service.out.log"
"%NSSM%" set %SERVICE% AppStderr "D:\lumiwiki\tools\lumiwiki-service.err.log"

echo === 启动服务 ===
"%NSSM%" start %SERVICE%

echo === 验证 ===
sc query %SERVICE%

echo.
echo === 完成 ===
echo 服务已注册并启动
echo 停止: %NSSM% stop %SERVICE%
echo 启动: %NSSM% start %SERVICE%
echo 重启: %NSSM% restart %SERVICE%
echo 移除: %NSSM% remove %SERVICE% confirm
pause
