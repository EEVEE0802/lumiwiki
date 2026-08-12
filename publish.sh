#!/bin/bash
# LumiWiki 内网发布脚本
# 使用方法：bash publish.sh

echo "======================================"
echo "   LumiWiki 内网发布工具"
echo "======================================"
echo ""

# 进入项目目录
cd /d/LumiWiki

# 检查是否有未提交的更改
echo "📋 检查 Git 状态..."
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  警告：有未提交的更改"
  git status --short
  echo ""
fi

# 构建生产版本
echo "📦 正在构建生产版本..."
npm run build

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ 构建失败！"
  exit 1
fi

echo ""
echo "✅ 构建成功！"
echo ""

# 固定端口
PORT=3005
SERVICE_NAME=LumiWiki
NSSM=D:/lumiwiki/tools/nssm.exe

# 服务化改造后（2026-08-12）：
# python http.server 已由 nssm 注册为 Windows 服务 LumiWiki（开机自启 + 崩溃自动重启）
# 发布只需要 restart 服务，让新 dist/ 里的静态文件生效
# 如果服务不存在（早期机器），fallback 到老的 nohup 起法
echo "🚀 正在重启 $SERVICE_NAME 服务（端口 $PORT）..."
if MSYS_NO_PATHCONV=1 sc.exe query $SERVICE_NAME >/dev/null 2>&1; then
  MSYS_NO_PATHCONV=1 "$NSSM" restart $SERVICE_NAME > /dev/null 2>&1
  sleep 2
  if netstat -ano | grep -q ":$PORT "; then
    echo ""
    echo "======================================"
    echo "✅ 发布成功！"
    echo "======================================"
    echo ""
    echo "📱 内网访问地址："
    echo "   http://10.27.17.136:$PORT"
    echo ""
    echo "📊 服务器信息："
    echo "   服务名：$SERVICE_NAME (Windows 服务，nssm 守护)"
    echo "   端口：$PORT"
    echo ""
    echo "💡 提示："
    echo "   - 服务开机自启 + 崩溃自动重启"
    echo "   - 停止：\"$NSSM\" stop $SERVICE_NAME  （或 sc stop $SERVICE_NAME，需管理员）"
    echo "   - 启动：\"$NSSM\" start $SERVICE_NAME"
    echo "   - 日志：D:/lumiwiki/tools/lumiwiki-service.{out,err}.log"
    echo ""
  else
    echo ""
    echo "❌ 服务重启失败（3005 未监听）"
    echo "请检查：$NSSM status $SERVICE_NAME 和日志"
    exit 1
  fi
else
  # 服务未注册：fallback 到老的 nohup 起法（提示用户配置服务）
  echo "⚠️  未检测到 $SERVICE_NAME 服务，fallback 到 nohup 启动"
  echo "   如需服务化，请以管理员身份跑 tools/install-lumiwiki-service.bat"
  echo ""

  # 检查端口是否被占用
  if netstat -ano | grep -q ":$PORT "; then
    echo "正在停止占用该端口的所有 python 进程..."
    killed=0
    for pid in $(netstat -ano | grep ":$PORT " | awk '{print $5}' | sort -u); do
      if MSYS_NO_PATHCONV=1 tasklist /FI "PID eq $pid" /FO CSV /NH 2>/dev/null | grep -qi "python"; then
        MSYS_NO_PATHCONV=1 taskkill /F /PID $pid > /dev/null 2>&1 && killed=$((killed+1))
      fi
    done
    [ $killed -gt 0 ] && sleep 1 && echo "✓ 已停止 $killed 个 python 服务进程"
  fi

  cd dist
  nohup python -m http.server $PORT > /dev/null 2>&1 &
  SERVER_PID=$!
  sleep 2
  if netstat -ano | grep -q ":$PORT "; then
    echo "✅ 已启动（PID $SERVER_PID）"
    echo "📱 http://10.27.17.136:$PORT"
  else
    echo "❌ 启动失败"
    exit 1
  fi
fi
