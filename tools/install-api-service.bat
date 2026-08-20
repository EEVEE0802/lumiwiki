@echo off
REM 需以管理员身份运行本脚本 (右键 -> 以管理员身份运行)
REM 安装 LumiWikiAPI 服务 (端口 3006)

set NSSM=%~dp0nssm.exe
set NODE_EXE=C:\Program Files\nodejs\node.exe
set API_DIR=D:\lumiwiki\api
set LOG_DIR=%~dp0

echo === 安装 LumiWikiAPI 服务 ===
"%NSSM%" install LumiWikiAPI "%NODE_EXE%" "server.mjs"
"%NSSM%" set LumiWikiAPI AppDirectory "%API_DIR%"
"%NSSM%" set LumiWikiAPI DisplayName "LumiWiki API (标记 + 权限管理)"
"%NSSM%" set LumiWikiAPI Description "LumiWiki 后端 API, 端口 3006"
"%NSSM%" set LumiWikiAPI Start SERVICE_AUTO_START
"%NSSM%" set LumiWikiAPI AppStdout "%LOG_DIR%lumiwiki-api-service.out.log"
"%NSSM%" set LumiWikiAPI AppStderr "%LOG_DIR%lumiwiki-api-service.err.log"
"%NSSM%" set LumiWikiAPI AppStdoutCreationDisposition 4
"%NSSM%" set LumiWikiAPI AppStderrCreationDisposition 4
"%NSSM%" set LumiWikiAPI AppRotateFiles 1
"%NSSM%" set LumiWikiAPI AppRotateOnline 1
"%NSSM%" set LumiWikiAPI AppRotateBytes 10485760

echo.
echo === 启动服务 ===
"%NSSM%" start LumiWikiAPI

echo.
echo === 验证 ===
"%NSSM%" status LumiWikiAPI
echo.
echo 完成! 服务应该已经在 http://localhost:3006 监听
echo 日志: %LOG_DIR%lumiwiki-api-service.{out,err}.log
pause
