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

# 检查端口是否被占用
if netstat -ano | grep -q ":$PORT "; then
  echo "⚠️  端口 $PORT 已被占用"
  echo "正在停止占用该端口的所有 python 进程（保留 vite/node 等其他服务）..."

  # 找出所有绑在 $PORT 上的 PID（去重）
  # 之前用 awk 'NR==1' 只杀第一个，反复跑会堆僵尸 python 进程；且不区分进程类型可能误伤 vite dev。
  # 现在：收集全部 PID → 只杀其中的 python.exe → 保留其他（node/vite dev 等）
  # ⚠ MSYS_NO_PATHCONV=1：Git Bash 会把 /FI /FO /NH 当路径转换成 C:/... 导致 tasklist 报错，需禁用
  killed=0
  for pid in $(netstat -ano | grep ":$PORT " | awk '{print $5}' | sort -u); do
    if MSYS_NO_PATHCONV=1 tasklist /FI "PID eq $pid" /FO CSV /NH 2>/dev/null | grep -qi "python"; then
      MSYS_NO_PATHCONV=1 taskkill /F /PID $pid > /dev/null 2>&1 && killed=$((killed+1))
    fi
  done
  if [ $killed -gt 0 ]; then
    sleep 1
    echo "✓ 已停止 $killed 个 python 服务进程"
  else
    echo "  端口被占用但未发现 python 进程（可能是 vite dev/其他服务，未动）"
  fi
  echo ""
fi

# 启动生产服务器
echo "🚀 正在启动生产服务器（端口 $PORT）..."
cd dist
nohup python -m http.server $PORT > /dev/null 2>&1 &
SERVER_PID=$!

sleep 2

# 验证服务器是否启动
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
  echo "   端口：$PORT"
  echo "   进程ID：$SERVER_PID"
  echo ""
  echo "💡 提示："
  echo "   - 服务器在后台运行"
  echo "   - 停止服务器：taskkill /F /PID $SERVER_PID"
  echo ""
else
  echo ""
  echo "❌ 服务器启动失败！"
  echo "请检查端口 $PORT 是否被占用"
  exit 1
fi
