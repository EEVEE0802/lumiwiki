#!/bin/bash
# LumiWiki 自动监控启动脚本

echo "======================================"
echo "   LumiWiki 自动监控启动器"
echo "======================================"
echo ""

# 检查是否已有监控进程在运行
RUNNING_PID=$(pgrep -f "node.*auto-watch.cjs")
if [ -n "$RUNNING_PID" ]; then
  echo "⚠️  检测到监控进程已在运行 (PID: $RUNNING_PID)"
  echo ""
  echo "如需重启，请先停止旧进程："
  echo "  taskkill /F /PID $RUNNING_PID"
  echo ""
  exit 1
fi

# 启动监控
echo "🚀 启动自动监控服务..."
echo ""

# 进入项目目录
cd /d/LumiWiki

# 启动监控（后台运行）
nohup node auto-watch.cjs > auto-watch.out 2>&1 &
MONITOR_PID=$!

sleep 1

# 验证启动
if pgrep -f "node.*auto-watch.cjs" > /dev/null; then
  echo ""
  echo "✅ 监控服务启动成功！"
  echo ""
  echo "📊 服务信息："
  echo "   进程ID: $MONITOR_PID"
  echo "   检查间隔: 60 分钟"
  echo "   日志文件: auto-watch.log"
  echo ""
  echo "💡 管理命令："
  echo "   查看日志: tail -f auto-watch.log"
  echo "   停止服务: taskkill /F /PID $MONITOR_PID"
  echo ""
else
  echo ""
  echo "❌ 启动失败，请检查错误信息"
  echo "   cat auto-watch.out"
  echo ""
fi
