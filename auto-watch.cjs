#!/usr/bin/env node
/**
 * LumiWiki 自动监控和发布脚本
 * 功能：定时检查数据源文件更新，自动同步并重新发布
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================

// 检查间隔（毫秒）- 1小时
const CHECK_INTERVAL = 60 * 60 * 1000;

// 数据源目录
const SOURCE_DIR = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/Table/data';

// 目标目录
const TARGET_DIR = 'D:/LumiWiki/public/data';

// 服务器端口
const SERVER_PORT = 3005;

// 日志文件
const LOG_FILE = 'D:/LumiWiki/auto-watch.log';

// ==================== 监控文件列表 ====================

const WATCH_FILES = [
  'ActiveSkill.json',
  'BattlePassive.json',
  'HomePassive.json',
  'Lumi.json',
  'LumiEvolution.json',
  'LumiTypeCounter.json',
  'Item.json',
  'BattleKeywordDes.json',
  'Avg.json',
];

// ==================== 工具函数 ====================

/**
 * 获取文件修改时间（时间戳）
 */
function getFileModTime(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtimeMs;
  } catch (err) {
    return 0;
  }
}

/**
 * 写入日志
 */
function writeLog(message) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

/**
 * 检查端口占用并返回 PID
 */
function getServerPid(port) {
  try {
    const output = execSync(`netstat -ano | grep ":${port} "`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        pids.add(parts[parts.length - 1]);
      }
    }
    return Array.from(pids);
  } catch (err) {
    return [];
  }
}

/**
 * 停止服务器
 */
function stopServer() {
  const pids = getServerPid(SERVER_PORT);
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8', stdio: 'ignore' });
      writeLog(`✓ 停止服务器 PID: ${pid}`);
    } catch (err) {
      // 忽略错误
    }
  }
}

/**
 * 启动服务器
 */
function startServer() {
  try {
    const cmd = `cd /d/LumiWiki/dist && python -m http.server ${SERVER_PORT} > /dev/null 2>&1 &`;
    execSync(cmd, { encoding: 'utf8', stdio: 'ignore' });
    writeLog(`✓ 服务器已启动，端口: ${SERVER_PORT}`);
  } catch (err) {
    writeLog(`⚠️ 服务器启动失败: ${err.message}`);
  }
}

/**
 * 复制文件
 */
function copyFile(src, dst) {
  try {
    fs.copyFileSync(src, dst);
    writeLog(`✓ 复制: ${path.basename(src)}`);
    return true;
  } catch (err) {
    writeLog(`✗ 复制失败 ${path.basename(src)}: ${err.message}`);
    return false;
  }
}

/**
 * 执行构建
 */
function runBuild() {
  try {
    writeLog('📦 开始构建...');
    execSync('cd /d/LumiWiki && npm run build', { encoding: 'utf8', stdio: 'pipe' });
    writeLog('✓ 构建成功！');
    return true;
  } catch (err) {
    writeLog(`✗ 构建失败: ${err.message}`);
    return false;
  }
}

/**
 * 检查更新并发布
 */
function checkAndUpdate() {
  writeLog('🔍 检查文件更新...');

  let hasUpdate = false;
  const fileStates = {};

  // 检查每个文件
  for (const filename of WATCH_FILES) {
    const srcPath = path.join(SOURCE_DIR, filename);
    const dstPath = path.join(TARGET_DIR, filename);

    const srcTime = getFileModTime(srcPath);
    const dstTime = getFileModTime(dstPath);

    fileStates[filename] = { srcTime, dstTime, updated: false };

    if (srcTime > dstTime && dstTime > 0) {
      hasUpdate = true;
      fileStates[filename].updated = true;
      writeLog(`→ 发现更新: ${filename}`);
    }
  }

  if (!hasUpdate) {
    writeLog('✓ 没有更新，无需处理');
    return;
  }

  writeLog('📝 开始同步文件...');

  // 复制更新的文件
  let allCopied = true;
  for (const filename of WATCH_FILES) {
    if (fileStates[filename].updated) {
      const srcPath = path.join(SOURCE_DIR, filename);
      const dstPath = path.join(TARGET_DIR, filename);
      if (!copyFile(srcPath, dstPath)) {
        allCopied = false;
      }
    }
  }

  if (!allCopied) {
    writeLog('⚠️ 部分文件复制失败，跳过构建');
    return;
  }

  // 构建并重启服务器
  if (runBuild()) {
    stopServer();
    setTimeout(() => {
      startServer();
      writeLog('🎉 发布完成！');
    }, 1000);
  }
}

// ==================== 主程序 ====================

function main() {
  console.log('======================================');
  console.log('   LumiWiki 自动监控服务');
  console.log('======================================');
  console.log('');
  console.log(`📂 数据源: ${SOURCE_DIR}`);
  console.log(`📂 目标目录: ${TARGET_DIR}`);
  console.log(`⏰ 检查间隔: ${CHECK_INTERVAL / 1000 / 60} 分钟`);
  console.log(`🌐 服务端口: ${SERVER_PORT}`);
  console.log('');
  console.log('监控中... (Ctrl+C 退出)');
  console.log('');

  // 初始化日志
  writeLog('═══════════════════════════════════════');
  writeLog('🚀 自动监控服务启动');

  // 首次检查
  checkAndUpdate();

  // 定时检查
  setInterval(checkAndUpdate, CHECK_INTERVAL);
}

// 启动
main();
