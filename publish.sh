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
  echo "正在尝试停止旧服务器..."

  # 查找并终止占用端口的进程（Windows）
  PID=$(netstat -ano | grep ":$PORT " | awk 'NR==1 {print $5}' | head -1)
  if [ -n "$PID" ]; then
    taskkill /F /PID $PID > /dev/null 2>&1
    sleep 1
    echo "✓ 旧服务器已停止"
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
  echo "   http://10.27.17.179:$PORT"
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
