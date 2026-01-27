# Clawdbot 本地部署完整指南

> 本指南详细介绍如何在本地部署 Clawdbot，配置 Ollama 本地模型、Brave Search 网络搜索和 Discord Bot。

---

## 目录

1. [第一部分：本地 Ollama 模型部署](#第一部分本地-ollama-模型部署)
2. [第二部分：网络搜索 API 配置](#第二部分网络搜索-api-配置)
3. [第三部分：Discord Bot 配置](#第三部分discord-bot-配置)
4. [第四部分：启动与验证](#第四部分启动与验证)
5. [常见问题](#常见问题)

---

## 第一部分：本地 Ollama 模型部署

### 1.1 安装 Clawdbot

#### 1.1.1 安装 Node.js 22 (使用 nvm)

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 加载 nvm
source ~/.bashrc
# 或
source ~/.nvm/nvm.sh

# 安装 Node.js 22
nvm install 22
nvm use 22

# 验证安装
node --version  # 应显示 v22.x.x
```

#### 1.1.2 克隆并构建 Clawdbot

```bash
# 克隆项目
git clone https://github.com/clawdbot/clawdbot.git
cd clawdbot

# 安装依赖
pnpm install

# 构建 WebUI（重要！）
pnpm ui:build

# 构建项目
pnpm build
```

#### 1.1.3 运行初始化向导

```bash
pnpm clawdbot onboard

pnpm clawdbot gateway --verbose
```

> **注意**：向导会让你选择云端 provider，可以随便选一个先完成向导，后面会修改为本地模型。

---

### 1.2 安装并配置 Ollama

#### 1.2.1 安装 Ollama

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# 启动 Ollama 服务
ollama serve
```

#### 1.2.2 下载模型

```bash
# 下载 Qwen3 30B 模型（或其他你需要的模型）
ollama pull qwen3:30b-a3b

# 查看已下载的模型
ollama list
```

#### 1.2.3 增加上下文长度（关键步骤！）

> **为什么需要这一步？** Ollama 默认上下文长度只有 2048 tokens，网络搜索结果会被截断导致回复异常。需要增加到 32K。

```bash
# 创建 Modelfile
cat > /tmp/Modelfile << 'EOF'
FROM qwen3:30b-a3b
PARAMETER num_ctx 32768
EOF

# 用新配置覆盖原模型
ollama create qwen3:30b-a3b -f /tmp/Modelfile

# 验证配置
ollama show qwen3:30b-a3b --modelfile | grep num_ctx
# 应输出: PARAMETER num_ctx 32768
```

---

### 1.3 注册 Ollama 模型到 pi-ai 库

> **为什么需要这一步？** pi-ai 库只认识在 `models.generated.js` 中注册的模型。未注册的模型会导致 `api` 为 `undefined` 错误。

#### 1.3.1 找到配置文件

```bash
# 在 clawdbot 目录下查找文件
cd /path/to/clawdbot
find node_modules/.pnpm -name "models.generated.js" | grep pi-ai
```

典型路径：
```
node_modules/.pnpm/@mariozechner+pi-ai@0.49.3_ws@8.19.0_zod@4.3.6/node_modules/@mariozechner/pi-ai/dist/models.generated.js
```

#### 1.3.2 编辑 models.generated.js

打开文件，找到最后一个 provider（通常是 `zai`）的结束 `},`，在其后、文件末尾的 `};` 前面添加：

```javascript
    "ollama": {
        "qwen3:30b-a3b": {
            id: "qwen3:30b-a3b",
            name: "Qwen3 30B",
            api: "openai-completions",
            provider: "ollama",
            baseUrl: "http://127.0.0.1:11434/v1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32768,
            maxTokens: 8192,
        },
        "glm-4.7-flash:latest": {
            id: "glm-4.7-flash:latest",
            name: "GLM 4.7 Flash",
            api: "openai-completions",
            provider: "ollama",
            baseUrl: "http://127.0.0.1:11434/v1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32768,
            maxTokens: 8192,
        },
    },
```

#### 1.3.3 完整示例（文件结构）

```javascript
// models.generated.js 文件结构
export const providers = {
    "anthropic": {
        // ... anthropic 模型
    },
    "openai": {
        // ... openai 模型
    },
    // ... 其他 providers
    "zai": {
        // ... zai 模型
    },  // ← 在这个逗号后面添加
    "ollama": {
        "qwen3:30b-a3b": {
            id: "qwen3:30b-a3b",
            name: "Qwen3 30B",
            api: "openai-completions",
            provider: "ollama",
            baseUrl: "http://127.0.0.1:11434/v1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32768,
            maxTokens: 8192,
        },
    },
};  // ← 文件结束
```

---

### 1.4 配置 Clawdbot 使用 Ollama

#### 1.4.1 编辑配置文件

编辑 `~/.clawdbot/clawdbot.json`：

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "ollama/qwen3:30b-a3b"
      }
    }
  }
}
```

#### 1.4.2 或使用配置向导

```bash
pnpm clawdbot configure --section gateway
```

选择：
- Provider: **ollama**
- Model: **qwen3:30b-a3b**

---

## 第二部分：网络搜索 API 配置

### 2.1 注册 Brave Search API

#### 2.1.1 获取 API Key

1. 访问 https://brave.com/search/api/
2. 点击 **Get Started** 或 **Sign Up**
3. 选择 **Free** 计划（2000 次/月）
4. 完成注册后，在 Dashboard 获取 **API Key**

#### 2.1.2 API Key 格式示例

```
BSAA38I07_L-TWOVNjscxx-GmfEcCPA
```

---

### 2.2 配置 Clawdbot 网络搜索

#### 2.2.1 运行配置向导

```bash
cd /path/to/clawdbot
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

pnpm clawdbot configure --section web
```

#### 2.2.2 配置选项

按提示选择：

| 选项 | 选择 |
|------|------|
| web_search | **enabled** |
| Provider | **brave** |
| API Key | 输入你的 Brave API Key |
| web_fetch | **enabled** |

#### 2.2.3 配置文件示例

配置完成后，`~/.clawdbot/clawdbot.json` 中会包含：

```json
{
  "web": {
    "search": {
      "enabled": true,
      "provider": "brave",
      "apiKey": "你的API Key"
    },
    "fetch": {
      "enabled": true
    }
  }
}
```

---

## 第三部分：Discord Bot 配置

### 3.1 Discord Developer Portal 设置

#### 3.1.1 创建 Application

1. 访问 https://discord.com/developers/applications
2. 点击右上角 **New Application**
3. 输入名称（如 `clawdbot`）
4. 点击 **Create**

#### 3.1.2 配置 Bot

1. 左侧菜单点击 **Bot**
2. 点击 **Reset Token** 获取 Bot Token
3. **复制并保存 Token**（只显示一次！）

#### 3.1.3 开启 Privileged Gateway Intents（关键！）

在 Bot 页面往下滚动，找到 **Privileged Gateway Intents**，开启：

| Intent | 状态 | 说明 |
|--------|------|------|
| **Message Content Intent** | ✅ 必须开启 | 读取消息内容 |
| **Server Members Intent** | ✅ 推荐开启 | 成员查询 |
| Presence Intent | ⬜ 可选 | 在线状态 |

点击 **Save Changes**

#### 3.1.4 生成邀请链接

1. 左侧菜单点击 **OAuth2** → **URL Generator**
2. **Scopes** 勾选：
   - ✅ `bot`
3. **Bot Permissions** 勾选：
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Read Message History
   - ✅ Embed Links（推荐）
   - ✅ Attach Files（推荐）
4. 复制底部生成的 **Generated URL**

---

### 3.2 创建 Discord 服务器

> 如果你已有服务器可跳过此步骤

#### 3.2.1 创建步骤

1. 打开 Discord（网页版或客户端）
2. 点击左侧 **+** 按钮
3. 选择 **创建我自己的**
4. 选择 **仅供我和我的朋友使用**
5. 输入服务器名称（如 `Clawdbot测试`）
6. 点击 **创建**

---

### 3.3 添加 Bot 到服务器

1. 在浏览器打开上面复制的 **Generated URL**
2. 选择你的服务器
3. 点击 **授权**
4. 完成验证

成功后，Bot 会出现在服务器成员列表中。

---

### 3.4 配置 Clawdbot Discord

#### 3.4.1 运行配置向导

```bash
pnpm clawdbot configure --section channels
```

#### 3.4.2 配置步骤

1. **Select a channel**: 选择 **Discord (Bot API)**
2. **Enter Discord bot token**: 粘贴你的 Bot Token
3. **Configure Discord channels access?**: 选择 **Yes**
4. **Discord channels access**: 选择 **Open (allow all channels)**
5. **Select a channel**: 选择 **Finished**
6. **Configure DM access policies now?**: 选择 **No**

#### 3.4.3 验证配置

```bash
pnpm clawdbot channels status --probe
```

成功输出：
```
- Discord custom-1: enabled, configured, running, bot:@clawdbot, token:config, intents:content=limited, works
```

---

## 第四部分：启动与验证

### 4.1 启动 Gateway

```bash
cd /path/to/clawdbot

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

# 启动 Gateway
OLLAMA_API_KEY="ollama-local" pnpm clawdbot gateway --verbose
```

### 4.2 验证各组件状态

```bash
# 检查 Discord 连接
pnpm clawdbot channels status --probe

# 运行完整诊断
pnpm clawdbot doctor

# 查看实时日志
pnpm clawdbot logs --follow
```

### 4.3 测试功能

#### 测试 Discord Bot
在 Discord 服务器中发送：
```
@clawdbot 你好
```

#### 测试网络搜索
在 Web Dashboard (http://localhost:18789) 中：
```
使用 web_search 搜索最新AI新闻
```

---

## 常见问题

### Q1: `pnpm: command not found`

**解决方案**：
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22
```

### Q2: Discord Bot 显示 "该应用程序未响应"

**可能原因**：
1. Gateway 没有运行
2. Message Content Intent 未开启
3. Bot Token 未正确配置

**解决方案**：
```bash
# 检查状态
pnpm clawdbot channels status --probe

# 如果显示 token:none，重新配置
pnpm clawdbot configure --section channels
```

### Q3: 网络搜索结果混乱或不相关

**原因**：Ollama 上下文长度不够，搜索结果被截断

**解决方案**：
```bash
# 重新配置模型上下文
cat > /tmp/Modelfile << 'EOF'
FROM qwen3:30b-a3b
PARAMETER num_ctx 32768
EOF

ollama create qwen3:30b-a3b -f /tmp/Modelfile
```

### Q4: `api undefined` 错误

**原因**：模型未在 `models.generated.js` 中注册

**解决方案**：参考 [1.3 节](#13-注册-ollama-模型到-pi-ai-库) 添加模型定义

### Q5: Discord 显示 "Used disallowed intents"

**解决方案**：
1. 去 Discord Developer Portal → Bot
2. 开启 **Message Content Intent**
3. 开启 **Server Members Intent**
4. 保存并重启 Gateway

---

## 配置文件汇总

| 文件路径 | 用途 |
|---------|------|
| `~/.clawdbot/clawdbot.json` | Clawdbot 主配置文件 |
| `~/.clawdbot/.env` | 环境变量 |
| `~/.clawdbot/credentials/` | 凭证存储 |
| `models.generated.js` | pi-ai 模型注册 |
| `/tmp/Modelfile` | Ollama 模型配置 |

---

## 快速启动命令汇总

```bash
# 每次启动前运行
cd /path/to/clawdbot
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

# 启动 Ollama（如果未运行）
ollama serve &

# 启动 Clawdbot Gateway
OLLAMA_API_KEY="ollama-local" pnpm clawdbot gateway --verbose
```

---

*文档版本: 2026.01.27*
*Clawdbot 版本: 2026.1.25*
