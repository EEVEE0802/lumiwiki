<script setup>
import { ref } from 'vue'

const activeSection = ref('concepts')

function scrollToSection(id) {
  const element = document.getElementById(id)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
    activeSection.value = id
  }
}
</script>

<template>
  <div class="claude-guide">
    <!-- 头部横幅 -->
    <div class="hero">
      <div class="hero-content">
        <h1>🤖 Claude Code 快速上手</h1>
        <p class="hero-desc">让 AI 成为你的编程助手 · 5 分钟快速入门</p>
      </div>
    </div>

    <!-- 侧边导航 -->
    <div class="guide-container">
      <aside class="sidebar">
        <nav>
          <a
            href="#concepts"
            :class="{ active: activeSection === 'concepts' }"
            @click.prevent="scrollToSection('concepts')"
          >
            🧠 AI 概念
          </a>
          <a
            href="#install"
            :class="{ active: activeSection === 'install' }"
            @click.prevent="scrollToSection('install')"
          >
            🚀 安装指南
          </a>
          <a
            href="#usage"
            :class="{ active: activeSection === 'usage' }"
            @click.prevent="scrollToSection('usage')"
          >
            💻 基本使用
          </a>
          <a
            href="#apikey"
            :class="{ active: activeSection === 'apikey' }"
            @click.prevent="scrollToSection('apikey')"
          >
            🔑 API Key
          </a>
          <a
            href="#tips"
            :class="{ active: activeSection === 'tips' }"
            @click.prevent="scrollToSection('tips')"
          >
            💡 实用技巧
          </a>
        </nav>
      </aside>

      <!-- 主要内容 -->
      <main class="content">
        <!-- AI 概念部分 -->
        <section id="concepts" class="section">
          <h2>🧠 先了解几个核心概念</h2>
          <p class="section-intro">在使用 Claude Code 之前，先快速了解这些关键概念：</p>

          <div class="concept-grid">
            <div class="concept-card">
              <div class="concept-icon">🤖</div>
              <h3>Agent（智能体）</h3>
              <p>能够感知环境、做出决策并执行行动的 AI 系统。可以把它想象成一个超级聪明的助手，能理解你的意图并帮你完成各种任务。</p>
            </div>

            <div class="concept-card">
              <div class="concept-icon">🛠️</div>
              <h3>Skill（技能）</h3>
              <p>AI Agent 具备的特定能力，比如读取文件、编写代码、运行命令等。就像助手会用的各种工具，每个 Skill 负责一种具体操作。</p>
            </div>

            <div class="concept-card">
              <div class="concept-icon">🧠</div>
              <h3>大模型（LLM）</h3>
              <p>大规模语言模型，通过海量数据训练，具备强大的理解和生成能力。这是 AI 的"大脑"，负责思考和推理。</p>
            </div>

            <div class="concept-card">
              <div class="concept-icon">🔑</div>
              <h3>API Key（密钥）</h3>
              <p>访问 AI 服务的身份验证凭证，相当于你的"会员卡"。每次使用都需要用它来验证身份和扣费。</p>
            </div>

            <div class="concept-card">
              <div class="concept-icon">📊</div>
              <h3>Token（词元）</h3>
              <p>AI 处理文本的基本单位，可以是一个字、词或词的一部分。这是计费的基础，输入和输出的 Token 总和就是你消耗的配额。</p>
            </div>

            <div class="concept-card">
              <div class="concept-icon">💬</div>
              <h3>Prompt（提示词）</h3>
              <p>你向 AI 发送的指令或问题。写好 Prompt 是获得好结果的关键，要清晰、具体地表达你的需求。</p>
            </div>
          </div>

          <div class="flow-diagram">
            <h4>🔄 AI 工作流程</h4>
            <div class="flow-steps">
              <span class="flow-step">💬 你的 Prompt</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">🔑 API Key 验证</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">🤖 Agent 接收</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">🧠 调用大模型</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">🛠️ 执行操作</span>
              <span class="flow-arrow">→</span>
              <span class="flow-step">✅ 返回结果</span>
            </div>
            <p class="flow-note"><strong>核心关系：</strong>Agent 是"大脑"，使用大模型思考，用 Skill 执行具体任务（读文件、写代码、运行命令等）</p>
          </div>
        </section>

        <!-- 安装指南部分 -->
        <section id="install" class="section">
          <h2>🚀 安装 Claude Code</h2>

          <div class="install-steps">
            <div class="install-step">
              <div class="step-number">1</div>
              <div class="step-content">
                <h3>安装 Node.js</h3>
                <p>Claude Code 需要 Node.js 环境才能运行。</p>
                <div class="link-box">
                  <strong>下载地址：</strong>
                  <a href="https://nodejs.org/" target="_blank" rel="noopener">nodejs.org</a>
                  <span class="link-divider">或</span>
                  <a href="https://nodejs.org/dist/v20.18.2/node-v20.18.2-x64.msi" target="_blank" rel="noopener">
                    直接下载 Windows 安装包
                  </a>
                </div>
                <div class="tip">
                  <span class="tip-icon">💡</span>
                  <span>选择 LTS 版本（长期支持版），安装后用 <code>node --version</code> 验证是否成功</span>
                </div>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">2</div>
              <div class="step-content">
                <h3>安装 Claude Code</h3>
                <p>打开 Windows Terminal，输入以下命令：</p>
                <div class="code-block">
                  <code>npm install -g @anthropic-ai/claude-code</code>
                </div>
                <div class="tip">
                  <span class="tip-icon">💡</span>
                  <span><code>-g</code> 参数表示全局安装，这样在任何目录都能使用</span>
                </div>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">3</div>
              <div class="step-content">
                <h3>安装 Windows Terminal（推荐）</h3>
                <p>更美观、功能更强大的终端工具。</p>
                <div class="link-box">
                  <strong>下载地址：</strong>
                  <a href="https://aka.ms/terminal" target="_blank" rel="noopener">aka.ms/terminal</a>
                  <span class="link-note">（可在 Microsoft Store 搜索安装）</span>
                </div>
              </div>
            </div>

            <div class="install-step">
              <div class="step-number">4</div>
              <div class="step-content">
                <h3>安装 MarkText（可选）</h3>
                <p>优雅的 Markdown 编辑器，适合写文档和笔记。</p>
                <div class="link-box">
                  <strong>下载地址：</strong>
                  <a href="https://marktext.cn/" target="_blank" rel="noopener">marktext.cn</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 基本使用部分 -->
        <section id="usage" class="section">
          <h2>💻 基本使用方法</h2>

          <div class="usage-content">
            <h3>🚀 两步启动 Claude Code</h3>

            <div class="launch-steps">
              <div class="launch-step">
                <div class="launch-icon">⌨️</div>
                <div class="launch-text">
                  <strong>打开 Windows Terminal</strong>
                  <p>按下 <code>Win + R</code>，输入 <code>wt</code> 回车</p>
                  <div class="tip-inline">
                    <span class="tip-icon">💡</span>
                    <span>小技巧：右键点击 Terminal 图标，选择"固定到任务栏"，以后一键打开！</span>
                  </div>
                </div>
              </div>

              <div class="launch-step">
                <div class="launch-icon">🚀</div>
                <div class="launch-text">
                  <strong>输入 claude 启动</strong>
                  <p>直接输入 <code>claude</code> 并回车</p>
                  <div class="code-block">
                    <code>claude</code>
                  </div>
                </div>
              </div>
            </div>

            <h3 style="margin-top: 40px;">📝 常用命令</h3>

            <div class="commands-table">
              <div class="command-row">
                <code>/help</code>
                <span>查看帮助信息</span>
              </div>
              <div class="command-row">
                <code>/clear</code>
                <span>清空对话历史</span>
              </div>
              <div class="command-row">
                <code>/exit</code> 或 <code>Ctrl+C</code>
                <span>退出程序</span>
              </div>
              <div class="command-row">
                <code>/attach &lt;文件名&gt;</code>
                <span>附加文件到上下文</span>
              </div>
            </div>

            <div class="tip-box tip-box-important">
              <span class="tip-icon">🎯</span>
              <div>
                <strong>首次使用：</strong>
                第一次启动会提示配置 API Key，按提示输入即可。配置完成后就可以开始和 Claude Code 对话啦！
              </div>
            </div>
          </div>
        </section>

        <!-- API Key 部分 -->
        <section id="apikey" class="section">
          <h2>🔑 获取和配置 API Key</h2>

          <div class="apikey-content">
            <h3>💰 两种计费方式</h3>

            <div class="billing-methods">
              <div class="billing-card">
                <div class="billing-icon">📊</div>
                <h4>Token 计费</h4>
                <p>按实际使用量付费，用多少算多少</p>
                <ul class="billing-features">
                  <li>✓ 适合轻度使用或尝鲜</li>
                  <li>✓ 灵活控制成本</li>
                  <li>✓ 无需长期承诺</li>
                </ul>
              </div>

              <div class="billing-card recommended">
                <div class="recommended-badge">推荐</div>
                <div class="billing-icon">💎</div>
                <h4>Coding Plan</h4>
                <p>包月/包年订阅，无限量使用</p>
                <ul class="billing-features">
                  <li>✓ 适合高频使用</li>
                  <li>✓ 月费固定，成本可控</li>
                  <li>✓ 无需担心超额</li>
                </ul>
              </div>
            </div>

            <h3 style="margin-top: 40px;">🏢 推荐平台</h3>

            <div class="platform-grid">
              <div class="platform-card recommended">
                <div class="recommended-badge">推荐</div>
                <div class="platform-header">
                  <div class="platform-icon">🔷</div>
                  <div>
                    <h4>智谱 GLM</h4>
                    <div class="platform-tags">
                      <span class="platform-tag">Token</span>
                      <span class="platform-tag platform-tag-coding">Coding Plan</span>
                    </div>
                  </div>
                </div>
                <p>国产大模型领先者，支持 GLM-4 等模型</p>
                <div class="platform-links">
                  <a href="https://open.bigmodel.cn" target="_blank" rel="noopener" class="platform-link">
                    open.bigmodel.cn
                  </a>
                </div>
              </div>

              <div class="platform-card">
                <div class="platform-header">
                  <div class="platform-icon">🔵</div>
                  <div>
                    <h4>DeepSeek</h4>
                    <span class="platform-tag">Token 计费</span>
                  </div>
                </div>
                <p>深度求索，超强推理能力，性价比极高</p>
                <div class="platform-links">
                  <a href="https://platform.deepseek.com" target="_blank" rel="noopener" class="platform-link">
                    platform.deepseek.com
                  </a>
                </div>
              </div>

              <div class="platform-card">
                <div class="platform-header">
                  <div class="platform-icon">🟠</div>
                  <div>
                    <h4>阿里云百炼</h4>
                    <div class="platform-tags">
                      <span class="platform-tag">Token</span>
                      <span class="platform-tag platform-tag-coding">Coding Plan</span>
                    </div>
                  </div>
                </div>
                <p>阿里云大模型平台，集成通义千问等模型</p>
                <div class="platform-links">
                  <a href="https://bailian.console.aliyun.com" target="_blank" rel="noopener" class="platform-link">
                    bailian.console.aliyun.com
                  </a>
                </div>
              </div>

              <div class="platform-card">
                <div class="platform-header">
                  <div class="platform-icon">🔶</div>
                  <div>
                    <h4>火山引擎方舟</h4>
                    <div class="platform-tags">
                      <span class="platform-tag">Token</span>
                      <span class="platform-tag platform-tag-coding">Coding Plan</span>
                    </div>
                  </div>
                </div>
                <p>字节跳动出品，推出 Coding Plan 包月订阅</p>
                <div class="platform-links">
                  <a href="https://ai.volcengine.com/activity/codingplan" target="_blank" rel="noopener" class="platform-link">
                    ai.volcengine.com/activity/codingplan
                  </a>
                </div>
              </div>
            </div>

            <h3 style="margin-top: 40px;">📝 获取 API Key 步骤</h3>

            <div class="steps-box">
              <ol class="numbered-list">
                <li>访问上述任一平台官网，注册并登录账号</li>
                <li>进入控制台或开发者中心</li>
                <li>找到 <strong>"API Keys"</strong> 或 <strong>"密钥管理"</strong> 页面</li>
                <li>点击 <strong>"创建密钥"</strong> 或 <strong>"新建 API Key"</strong></li>
                <li><strong class="warning">立即复制保存！</strong>密钥通常只显示一次</li>
              </ol>
            </div>

            <div class="warning-box">
              <span class="warning-icon">⚠️</span>
              <div>
                <strong>安全提醒：</strong>
                <ul>
                  <li>不要将 API Key 提交到公开的 Git 仓库</li>
                  <li>不要分享给他人或在公开场合展示</li>
                  <li>定期更换 API Key 以保证安全</li>
                </ul>
              </div>
            </div>

            <h3 style="margin-top: 40px;">⚙️ 配置 API Key</h3>

            <p>配置文件位置：<code>C:\Users\你的用户名\.claude\settings.json</code></p>

            <div class="config-example">
              <h4>📝 配置示例（以智谱 GLM 为例）</h4>
              <div class="code-block code-block-json">
                <pre>{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-api-key-here",
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_DEFAULT_MODEL": "glm-4.7"
  }
}</pre>
              </div>
              <p class="config-note">
                <span class="tip-icon">💡</span>
                <span><strong>说明：</strong>将 <code>your-api-key-here</code> 替换为你从平台获取的 API Key 即可。</span>
              </p>
            </div>

            <h3 style="margin-top: 30px;">🔄 不同平台的配置示例</h3>

            <div class="platform-configs">
              <div class="config-tab">
                <h4>🔷 智谱 GLM</h4>
                <div class="code-block code-block-small">
                  <pre>"ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
"ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic"
"ANTHROPIC_DEFAULT_MODEL": "glm-4.7"</pre>
                </div>
              </div>

              <div class="config-tab">
                <h4>🔵 DeepSeek</h4>
                <div class="code-block code-block-small">
                  <pre>"ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
"ANTHROPIC_BASE_URL": "https://api.deepseek.com"
"ANTHROPIC_DEFAULT_MODEL": "deepseek-chat"</pre>
                </div>
              </div>

              <div class="config-tab">
                <h4>🟠 阿里云百炼</h4>
                <div class="code-block code-block-small">
                  <pre>"ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
"ANTHROPIC_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1"
"ANTHROPIC_DEFAULT_MODEL": "qwen-plus"</pre>
                </div>
              </div>

              <div class="config-tab">
                <h4>🔶 火山引擎方舟</h4>
                <div class="code-block code-block-small">
                  <pre>"ANTHROPIC_AUTH_TOKEN": "your-api-key-here"
"ANTHROPIC_BASE_URL": "https://ark.cn-beijing.volces.com/api/v3"
"ANTHROPIC_DEFAULT_MODEL": "ep-20250601113416-lxzqv"</pre>
                </div>
              </div>
            </div>

            <div class="tip-box">
              <span class="tip-icon">🎯</span>
              <div>
                <strong>保存后生效：</strong>修改配置文件后，重启 Claude Code 即可生效。配置永久保存，无需每次使用时重新输入。
              </div>
            </div>
          </div>
        </section>

        <!-- 实用技巧部分 -->
        <section id="tips" class="section">
          <h2>💡 实用技巧与最佳实践</h2>

          <div class="tips-content">
            <h3>📌 高效使用技巧</h3>

            <div class="tips-list">
              <div class="tip-item">
                <div class="tip-item-icon">🎯</div>
                <div class="tip-item-content">
                  <strong>明确指令</strong>
                  <p>清晰描述你的需求，避免模糊表述。比如"帮我优化这段代码的性能"比"看看这个代码"更好。</p>
                </div>
              </div>

              <div class="tip-item">
                <div class="tip-item-icon">📎</div>
                <div class="tip-item-content">
                  <strong>提供上下文</strong>
                  <p>使用 <code>/attach</code> 附加相关文件，让 AI 更好地理解你的项目结构和代码上下文。</p>
                </div>
              </div>

              <div class="tip-item">
                <div class="tip-item-icon">🔨</div>
                <div class="tip-item-content">
                  <strong>分步执行</strong>
                  <p>复杂任务可以分解为多个小步骤，一步步完成。这样更容易调试和发现问题。</p>
                </div>
              </div>

              <div class="tip-item">
                <div class="tip-item-icon">✅</div>
                <div class="tip-item-content">
                  <strong>验证结果</strong>
                  <p>AI 生成的代码需要测试和验证，不要盲目相信。确保功能正确再提交。</p>
                </div>
              </div>

              <div class="tip-item">
                <div class="tip-item-icon">💾</div>
                <div class="tip-item-content">
                  <strong>保存记录</strong>
                  <p>重要的对话可以保存到文档中，方便以后查阅或分享给团队成员。</p>
                </div>
              </div>
            </div>

            <h3 style="margin-top: 40px;">🎯 最佳实践</h3>

            <div class="best-practices">
              <div class="practice-card">
                <div class="practice-icon">📄</div>
                <h4>创建 CLAUDE.md</h4>
                <p>在项目根目录创建 CLAUDE.md 文件，说明项目结构、编码规范和特殊要求，帮助 AI 更好地理解你的项目。</p>
              </div>

              <div class="practice-card">
                <div class="practice-icon">🚫</div>
                <h4>使用 .gitignore</h4>
                <p>排除敏感文件和临时文件，防止 API Key、密码等重要信息被提交到仓库。</p>
              </div>

              <div class="practice-card">
                <div class="practice-icon">📊</div>
                <h4>监控使用量</h4>
                <p>定期在 Anthropic 控制台查看 API 使用情况，了解配额消耗和费用。</p>
              </div>

              <div class="practice-card">
                <div class="practice-icon">🔄</div>
                <h4>结合 Git 使用</h4>
                <p>让 Claude Code 帮助你进行代码审查、生成 Commit Message、解决合并冲突等。</p>
              </div>
            </div>

            <div class="final-tip">
              <h3>🎉 开始你的 AI 辅助编程之旅吧！</h3>
              <p>Claude Code 是一个强大的工具，善用它能让你的编程效率大幅提升。有问题随时查阅文档或向社区求助~</p>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- 返回顶部按钮 -->
    <button class="back-to-top" @click="scrollToSection('concepts')">
      ↑
    </button>
  </div>
</template>

<style scoped>
.claude-guide {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 头部横幅 */
.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 60px 20px 40px;
  text-align: center;
}

.hero-content h1 {
  font-size: 2.5em;
  color: #fff;
  margin-bottom: 12px;
}

.hero-desc {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.2em;
}

/* 主容器 */
.guide-container {
  display: flex;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
}

/* 侧边导航 */
.sidebar {
  position: sticky;
  top: 20px;
  width: 220px;
  height: fit-content;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 20px;
  margin: 20px 20px 20px 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  align-self: flex-start;
}

.sidebar nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar a {
  padding: 10px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: #555;
  font-weight: 500;
  transition: all 0.3s;
  cursor: pointer;
}

.sidebar a:hover {
  background: #f0f4ff;
  color: #667eea;
}

.sidebar a.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

/* 主要内容 */
.content {
  flex: 1;
  padding: 20px 0 60px;
}

.section {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 40px;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.section h2 {
  font-size: 2em;
  color: #667eea;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 3px solid #667eea;
}

.section h3 {
  font-size: 1.4em;
  color: #764ba2;
  margin: 30px 0 16px;
}

.section-intro {
  color: #666;
  font-size: 1.05em;
  margin-bottom: 24px;
}

/* 概念卡片网格 */
.concept-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.concept-card {
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 12px;
  padding: 24px;
  border-left: 4px solid #667eea;
  transition: transform 0.3s, box-shadow 0.3s;
}

.concept-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.2);
}

.concept-icon {
  font-size: 2.5em;
  margin-bottom: 12px;
}

.concept-card h3 {
  color: #667eea;
  font-size: 1.2em;
  margin: 0 0 10px;
}

.concept-card p {
  color: #555;
  line-height: 1.6;
  margin: 0;
}

/* 流程图 */
.flow-diagram {
  background: #f8f9ff;
  border-radius: 12px;
  padding: 24px;
  margin-top: 30px;
}

.flow-diagram h4 {
  color: #667eea;
  font-size: 1.3em;
  margin-bottom: 16px;
}

.flow-steps {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.flow-step {
  background: white;
  border: 2px solid #667eea;
  border-radius: 8px;
  padding: 10px 14px;
  font-weight: 500;
  color: #555;
  font-size: 0.9em;
  white-space: nowrap;
}

.flow-arrow {
  color: #764ba2;
  font-size: 1.3em;
}

.flow-note {
  color: #666;
  font-size: 0.95em;
  margin: 0;
}

/* 安装步骤 */
.install-steps {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.install-step {
  display: flex;
  gap: 20px;
}

.step-number {
  flex-shrink: 0;
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
}

.step-content {
  flex: 1;
}

.step-content h3 {
  margin-top: 0;
  color: #333;
}

.step-content > p {
  color: #666;
  margin-bottom: 12px;
}

/* 链接框 */
.link-box {
  background: #f0f4ff;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
}

.link-box a {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.link-box a:hover {
  text-decoration: underline;
}

.link-divider {
  color: #999;
  margin: 0 8px;
}

.link-note {
  color: #888;
  font-size: 0.9em;
  margin-left: 8px;
}

/* 代码块 */
.code-block {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 14px 18px;
  margin: 12px 0;
  overflow-x: auto;
}

.code-block code {
  color: #4ec9b0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.95em;
}

/* 提示框 */
.tip {
  background: #fff9e6;
  border-left: 4px solid #ffc107;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 12px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.tip-icon {
  font-size: 1.3em;
}

/* 内联提示 */
.tip-inline {
  background: #f0f9ff;
  border-left: 3px solid #0ea5e9;
  border-radius: 6px;
  padding: 10px 14px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  color: #555;
}

.tip-inline .tip-icon {
  font-size: 1.1em;
}

.tip-box {
  background: #f0f4ff;
  border-left: 4px solid #667eea;
  border-radius: 8px;
  padding: 16px 20px;
  margin: 16px 0;
}

.tip-box-important {
  background: linear-gradient(135deg, #fff9e6 0%, #ffe8cc 100%);
  border-left: 4px solid #ff9800;
}

/* 计费方式卡片 */
.billing-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.billing-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 24px;
  position: relative;
  transition: all 0.3s;
}

.billing-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.billing-card.recommended {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-color: #0ea5e9;
}

.billing-icon {
  font-size: 2.5em;
  margin-bottom: 12px;
}

.billing-card h4 {
  color: #333;
  font-size: 1.2em;
  margin-bottom: 8px;
}

.billing-card p {
  color: #666;
  font-size: 0.95em;
  margin-bottom: 16px;
}

.billing-features {
  list-style: none;
  padding: 0;
  margin: 0;
}

.billing-features li {
  color: #555;
  font-size: 0.9em;
  padding: 4px 0;
}

/* 平台卡片 */
.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.platform-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 20px;
  position: relative;
  transition: all 0.3s;
}

.platform-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.platform-card.recommended {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-color: #f59e0b;
}

.platform-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.platform-icon {
  font-size: 2em;
}

.platform-header h4 {
  color: #333;
  font-size: 1.1em;
  margin: 0;
}

.platform-tag {
  display: inline-block;
  background: #e0e0e0;
  color: #666;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 500;
}

.platform-tags {
  display: flex;
  gap: 6px;
}

.platform-tag-coding {
  background: #f59e0b;
  color: white;
}

.platform-card p {
  color: #666;
  font-size: 0.9em;
  margin-bottom: 12px;
  line-height: 1.5;
}

.platform-links {
  display: flex;
  gap: 8px;
}

.platform-link {
  color: #667eea;
  text-decoration: none;
  font-size: 0.9em;
  font-weight: 500;
}

.platform-link:hover {
  text-decoration: underline;
}

/* 步骤框 */
.steps-box {
  background: #f8f9ff;
  border-radius: 10px;
  padding: 20px;
  margin: 16px 0;
}

/* 配置示例 */
.config-example {
  background: #f8f9ff;
  border-radius: 12px;
  padding: 24px;
  margin: 20px 0;
}

.config-example h4 {
  color: #667eea;
  margin-bottom: 16px;
}

.code-block-json {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 20px;
  margin: 12px 0;
  overflow-x: auto;
}

.code-block-json pre {
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
  line-height: 1.6;
  margin: 0;
}

.config-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  color: #666;
  font-size: 0.95em;
}

/* 平台配置 */
.platform-configs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.config-tab {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  padding: 16px;
  transition: all 0.3s;
}

.config-tab:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.config-tab h4 {
  color: #333;
  font-size: 1em;
  margin-bottom: 12px;
}

.code-block-small {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 12px;
  margin: 0;
  overflow-x: auto;
}

.code-block-small pre {
  color: #4ec9b0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85em;
  line-height: 1.5;
  margin: 0;
}

/* 启动步骤 */
.launch-steps {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 20px 0;
}

.launch-step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.launch-icon {
  font-size: 2em;
  flex-shrink: 0;
}

.launch-text strong {
  display: block;
  color: #333;
  margin-bottom: 6px;
}

.launch-text p {
  color: #666;
  margin: 4px 0 8px;
}

/* 命令表格 */
.commands-table {
  background: #f8f9ff;
  border-radius: 10px;
  padding: 20px;
  margin: 16px 0;
}

.command-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #e0e0e0;
}

.command-row:last-child {
  border-bottom: none;
}

.command-row code {
  background: #1e1e1e;
  color: #4ec9b0;
  padding: 6px 12px;
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
  min-width: 180px;
}

.command-row span {
  color: #555;
  margin-left: 16px;
}

/* 编号列表 */
.numbered-list {
  color: #555;
  line-height: 1.8;
  margin: 16px 0;
  padding-left: 20px;
}

.numbered-list li {
  margin-bottom: 10px;
}

.highlight-link {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.highlight-link:hover {
  text-decoration: underline;
}

.warning {
  color: #e74c3c;
  font-weight: 600;
}

/* 警告框 */
.warning-box {
  background: #fee;
  border-left: 4px solid #e74c3c;
  border-radius: 8px;
  padding: 16px 20px;
  margin: 16px 0;
  display: flex;
  gap: 12px;
}

.warning-icon {
  font-size: 1.5em;
}

.warning-box strong {
  color: #e74c3c;
  display: block;
  margin-bottom: 8px;
}

.warning-box ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.warning-box li {
  color: #555;
  margin-bottom: 6px;
}

/* 配置方法 */
.config-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.config-method {
  background: #f8f9ff;
  border-radius: 12px;
  padding: 20px;
  position: relative;
}

.config-method.recommended {
  background: linear-gradient(135deg, #f0fff4 0%, #e8fff0 100%);
  border: 2px solid #10b981;
}

.recommended-badge {
  position: absolute;
  top: -10px;
  right: 20px;
  background: #10b981;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
}

.config-method h4 {
  color: #333;
  margin-bottom: 12px;
}

.method-note {
  color: #666;
  font-size: 0.95em;
  margin: 8px 0 0;
}

/* 技巧列表 */
.tips-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 20px 0;
}

.tip-item {
  display: flex;
  gap: 16px;
  background: #f8f9ff;
  border-radius: 10px;
  padding: 16px 20px;
}

.tip-item-icon {
  font-size: 2em;
  flex-shrink: 0;
}

.tip-item-content strong {
  display: block;
  color: #333;
  margin-bottom: 6px;
}

.tip-item-content p {
  color: #666;
  margin: 0;
  line-height: 1.6;
}

/* 最佳实践卡片 */
.best-practices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.practice-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  padding: 18px;
  transition: all 0.3s;
}

.practice-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.practice-icon {
  font-size: 2em;
  margin-bottom: 10px;
}

.practice-card h4 {
  color: #333;
  margin-bottom: 8px;
}

.practice-card p {
  color: #666;
  font-size: 0.95em;
  line-height: 1.5;
  margin: 0;
}

/* 最终提示 */
.final-tip {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  margin-top: 30px;
}

.final-tip h3 {
  color: white;
  margin: 0 0 10px;
}

.final-tip p {
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

/* 返回顶部按钮 */
.back-to-top {
  position: fixed;
  bottom: 30px;
  right: 30px;
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 50%;
  font-size: 1.5em;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.3s;
  opacity: 0.8;
}

.back-to-top:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
  opacity: 1;
}

/* 响应式 */
@media (max-width: 768px) {
  .guide-container {
    flex-direction: column;
  }

  .sidebar {
    position: static;
    width: 100%;
    margin: 0 0 20px;
  }

  .hero-content h1 {
    font-size: 1.8em;
  }

  .concept-grid {
    grid-template-columns: 1fr;
  }

  .flow-steps {
    flex-direction: column;
    align-items: flex-start;
  }

  .flow-arrow {
    transform: rotate(90deg);
  }

  .install-step {
    flex-direction: column;
    gap: 12px;
  }

  .section {
    padding: 24px;
  }
}
</style>
