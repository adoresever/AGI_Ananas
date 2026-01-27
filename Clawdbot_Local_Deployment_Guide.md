# Clawdbot 本地部署完整指南

> 本指南详细介绍如何在本地部署 Clawdbot，配置 Ollama 本地模型、Brave Search 网络搜索和 Discord Bot。

---

## 目录

1. [第一部分：本地 Ollama 模型部署](#第一部分本地-ollama-模型部署)
2. [第二部分：网络搜索 API 配置](#第二部分网络搜索-api-配置)
3. [第三部分：Discord Bot 配置](#第三部分discord-bot-配置)
4. [第四部分：启动与验证](#第四部分启动与验证)
5. [常见问题](#常见问题)
6. [附录：完整配置文件示例](#附录完整配置文件示例)

---

## 第一部分：本地 Ollama 模型部署

### 1.1 安装 Clawdbot

#### 1.1.1 安装 Node.js 22 (使用 nvm)

**Linux / macOS：**

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

**Windows：**

```powershell
# 方式一：使用 nvm-windows（推荐）
# 下载安装：https://github.com/coreybutler/nvm-windows/releases
nvm install 22
nvm use 22

# 方式二：直接下载 Node.js 安装包
# https://nodejs.org/ 下载 LTS 版本

# 验证安装
node --version
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

**Linux：**

```bash
curl -fsSL https://ollama.com/install.sh | sh

# 启动 Ollama 服务
ollama serve
```

**Windows：**

1. 访问 https://ollama.com/download
2. 下载 Windows 安装包并运行
3. 安装完成后 Ollama 会自动作为服务运行

#### 1.2.2 下载模型

```bash
# 下载 Qwen3 30B 模型（或其他你需要的模型）
ollama pull qwen3:30b-a3b

# 查看已下载的模型
ollama list
```

#### 1.2.3 增加上下文长度（可选）

> **为什么需要这一步？** Ollama 默认上下文长度只有 2048 tokens，网络搜索结果会被截断导致回复异常。需要增加到 32K。

**Linux / macOS：**

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

**Windows (PowerShell)：**

```powershell
# 创建 Modelfile
@"
FROM qwen3:30b-a3b
PARAMETER num_ctx 32768
"@ | Out-File -FilePath "$env:TEMP\Modelfile" -Encoding UTF8

# 用新配置覆盖原模型
ollama create qwen3:30b-a3b -f "$env:TEMP\Modelfile"

# 验证配置
ollama show qwen3:30b-a3b --modelfile | Select-String "num_ctx"
```

---

### 1.3 注册 Ollama 模型到 pi-ai 库

> **为什么需要这一步？** pi-ai 库只认识在 `models.generated.js` 中注册的模型。未注册的模型会导致 `api` 为 `undefined` 错误。

#### 1.3.1 找到配置文件

**Linux / macOS：**

```bash
# 在 clawdbot 目录下查找文件
cd /path/to/clawdbot
find node_modules/.pnpm -name "models.generated.js" | grep pi-ai
```

**Windows (PowerShell)：**

```powershell
cd C:\path\to\clawdbot
Get-ChildItem -Recurse -Filter "models.generated.js" | Where-Object { $_.FullName -like "*pi-ai*" }
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

### 1.4 修改源码添加 Ollama 环境变量映射（关键步骤！）

> **为什么需要这一步？** Clawdbot 通过 `model-auth.ts` 中的 `envMap` 映射 provider 到对应的环境变量。默认不包含 ollama，需要手动添加才能识别 `OLLAMA_API_KEY` 环境变量。

#### 1.4.1 找到并编辑 model-auth.ts

**Linux / macOS：**

```bash
cd /path/to/clawdbot

# 查看原始内容，确认 envMap 位置
grep -n "envMap" src/agents/model-auth.ts

# 使用 sed 在 venice 后面添加 ollama
sed -i 's/venice: "VENICE_API_KEY",/venice: "VENICE_API_KEY",\n    ollama: "OLLAMA_API_KEY",/' src/agents/model-auth.ts

# 验证修改是否成功
grep -n "ollama.*OLLAMA" src/agents/model-auth.ts
# 应输出类似: 42:    ollama: "OLLAMA_API_KEY",
```

**macOS（sed 语法略有不同）：**

```bash
cd /path/to/clawdbot

# macOS 的 sed 需要 -i '' 参数
sed -i '' 's/venice: "VENICE_API_KEY",/venice: "VENICE_API_KEY",\
    ollama: "OLLAMA_API_KEY",/' src/agents/model-auth.ts

# 验证修改
grep -n "ollama.*OLLAMA" src/agents/model-auth.ts
```

**Windows (PowerShell)：**

```powershell
cd C:\path\to\clawdbot

# 读取文件内容
$content = Get-Content -Path "src\agents\model-auth.ts" -Raw

# 替换内容：在 venice 后面添加 ollama
$newContent = $content -replace 'venice: "VENICE_API_KEY",', "venice: `"VENICE_API_KEY`",`n    ollama: `"OLLAMA_API_KEY`","

# 写回文件
$newContent | Set-Content -Path "src\agents\model-auth.ts" -NoNewline

# 验证修改
Select-String -Path "src\agents\model-auth.ts" -Pattern "ollama.*OLLAMA"
```

**或手动编辑（所有系统通用）：**

1. 打开 `src/agents/model-auth.ts` 文件
2. 搜索 `envMap` 或 `venice: "VENICE_API_KEY"`
3. 在 `venice: "VENICE_API_KEY",` 这一行后面添加新行：
   ```typescript
       ollama: "OLLAMA_API_KEY",
   ```

#### 1.4.2 修改前后对比

**修改前：**
```typescript
const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    // ... 其他 providers
    venice: "VENICE_API_KEY",
};
```

**修改后：**
```typescript
const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    // ... 其他 providers
    venice: "VENICE_API_KEY",
    ollama: "OLLAMA_API_KEY",
};
```

#### 1.4.3 重新构建项目

修改源码后必须重新构建：

```bash
# 重新构建
pnpm build

# 如果 gateway 正在运行，需要重启
# Linux / macOS
pkill -f "node.*gateway"

# Windows (PowerShell)
Get-Process | Where-Object { $_.ProcessName -like "*node*" -and $_.CommandLine -like "*gateway*" } | Stop-Process
```

---

### 1.5 配置 Clawdbot 使用 Ollama

#### 1.5.1 打开配置文件目录

**Linux / macOS：**

```bash
# 查看配置文件
cat ~/.clawdbot/clawdbot.json

# 用编辑器打开
nano ~/.clawdbot/clawdbot.json
# 或
code ~/.clawdbot/clawdbot.json

# 在文件管理器中打开目录
xdg-open ~/.clawdbot/          # Linux
open ~/.clawdbot/              # macOS
```

**Windows：**

```powershell
# 查看配置文件
type $env:USERPROFILE\.clawdbot\clawdbot.json

# 用记事本打开
notepad $env:USERPROFILE\.clawdbot\clawdbot.json

# 用 VS Code 打开
code $env:USERPROFILE\.clawdbot\clawdbot.json

# 在文件资源管理器中打开目录
explorer $env:USERPROFILE\.clawdbot

# 或直接在地址栏输入
# %USERPROFILE%\.clawdbot
```

> **Windows 配置文件路径**：`C:\Users\你的用户名\.clawdbot\clawdbot.json`

#### 1.5.2 编辑配置文件

修改 `agents.defaults.model.primary` 字段：

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

> **提示**：完整配置文件示例请参考 [附录：完整配置文件示例](#附录完整配置文件示例)

#### 1.5.3 或使用配置向导

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

**Linux / macOS：**

```bash
cd /path/to/clawdbot
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

pnpm clawdbot configure --section web
```

**Windows (PowerShell)：**

```powershell
cd C:\path\to\clawdbot
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

**Linux / macOS：**

```bash
cd /path/to/clawdbot

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

# 启动 Gateway
OLLAMA_API_KEY="ollama-local" pnpm clawdbot gateway --verbose
```

**Windows (PowerShell)：**

```powershell
cd C:\path\to\clawdbot

# 设置环境变量并启动
$env:OLLAMA_API_KEY="ollama-local"
pnpm clawdbot gateway --verbose
```

**Windows (CMD)：**

```cmd
cd C:\path\to\clawdbot

set OLLAMA_API_KEY=ollama-local
pnpm clawdbot gateway --verbose
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

**Linux / macOS：**
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22
```

**Windows：**
```powershell
# 如果使用 nvm-windows
nvm use 22

# 确保 pnpm 已安装
npm install -g pnpm
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

### Q6: 如何查看当前配置

**Linux / macOS：**
```bash
cat ~/.clawdbot/clawdbot.json

# 或使用 jq 格式化输出
cat ~/.clawdbot/clawdbot.json | jq .
```

**Windows：**
```powershell
# 查看配置
type $env:USERPROFILE\.clawdbot\clawdbot.json

# 格式化输出（需要安装 jq 或使用 PowerShell）
Get-Content $env:USERPROFILE\.clawdbot\clawdbot.json | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### Q7: 配置文件语法错误

**症状**：Gateway 启动失败，提示 JSON 解析错误

**解决方案**：

**Linux / macOS：**
```bash
cat ~/.clawdbot/clawdbot.json | python3 -m json.tool
```

**Windows：**
```powershell
Get-Content $env:USERPROFILE\.clawdbot\clawdbot.json | ConvertFrom-Json
```

### Q8: Windows 找不到配置文件目录

**解决方案**：

1. 按 `Win + R` 打开运行对话框
2. 输入 `%USERPROFILE%\.clawdbot` 回车
3. 或在文件资源管理器地址栏直接输入上述路径

---

## 配置文件汇总

| 文件路径 | 用途 |
|---------|------|
| `~/.clawdbot/clawdbot.json` | Clawdbot 主配置文件 |
| `~/.clawdbot/.env` | 环境变量 |
| `~/.clawdbot/credentials/` | 凭证存储 |
| `src/agents/model-auth.ts` | Provider 环境变量映射（需修改添加 ollama） |
| `models.generated.js` | pi-ai 模型注册 |
| `/tmp/Modelfile` | Ollama 模型配置 |

**Windows 路径对照：**

| Linux/macOS | Windows |
|-------------|---------|
| `~/.clawdbot/` | `C:\Users\用户名\.clawdbot\` 或 `%USERPROFILE%\.clawdbot\` |
| `/tmp/Modelfile` | `%TEMP%\Modelfile` |

---

## 快速启动命令汇总

**Linux / macOS：**

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

**Windows (PowerShell)：**

```powershell
# 每次启动前运行
cd C:\path\to\clawdbot

# Ollama 在 Windows 上会自动作为服务运行，无需手动启动

# 启动 Clawdbot Gateway
$env:OLLAMA_API_KEY="ollama-local"
pnpm clawdbot gateway --verbose
```

---

## 附录：完整配置文件示例

### clawdbot.json 完整配置

文件路径：
- **Linux / macOS**：`~/.clawdbot/clawdbot.json`
- **Windows**：`C:\Users\你的用户名\.clawdbot\clawdbot.json` 或 `%USERPROFILE%\.clawdbot\clawdbot.json`

```json
{
  "agents": {
    "defaults": {
      "workspace": "/home/wang/clawd",
      "model": {
        "primary": "ollama/qwen3:30b-a3b"
      }
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "your-secure-token-here"
    },
    "port": 18789,
    "bind": "loopback",
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  },
  "auth": {
    "profiles": {
      "zai:default": {
        "provider": "zai",
        "mode": "api_key"
      }
    }
  },
  "skills": {
    "install": {
      "nodeManager": "npm"
    }
  },
  "web": {
    "search": {
      "enabled": true,
      "provider": "brave",
      "apiKey": "your-brave-api-key"
    },
    "fetch": {
      "enabled": true
    }
  },
  "wizard": {
    "lastRunAt": "2026-01-27T02:06:49.956Z",
    "lastRunVersion": "2026.1.25",
    "lastRunCommand": "onboard",
    "lastRunMode": "local"
  },
  "meta": {
    "lastTouchedVersion": "2026.1.25",
    "lastTouchedAt": "2026-01-27T02:06:49.972Z"
  }
}
```

> **Windows 用户注意**：`workspace` 路径需要改为 Windows 格式，例如 `"workspace": "C:\\Users\\wang\\clawd"` 或使用正斜杠 `"workspace": "C:/Users/wang/clawd"`

### 配置字段说明

| 字段 | 说明 |
|------|------|
| `agents.defaults.workspace` | Agent 工作目录，用于文件操作 |
| `agents.defaults.model.primary` | 默认使用的模型，格式为 `provider/model-name` |
| `gateway.mode` | 网关模式，`local` 表示本地部署 |
| `gateway.auth.token` | 访问 Gateway 的认证令牌 |
| `gateway.port` | Gateway 监听端口，默认 18789 |
| `gateway.bind` | 绑定地址，`loopback` 仅本地访问 |
| `web.search.enabled` | 是否启用网络搜索 |
| `web.search.provider` | 搜索提供商，推荐 `brave` |
| `web.search.apiKey` | Brave Search API Key |
| `web.fetch.enabled` | 是否启用网页抓取 |

### 配置修改示例

#### 修改默认模型

将 `agents.defaults.model.primary` 改为你想使用的模型：

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "ollama/glm-4.7-flash:latest"
      }
    }
  }
}
```

#### 修改工作目录

**Linux / macOS：**
```json
{
  "agents": {
    "defaults": {
      "workspace": "/your/custom/path"
    }
  }
}
```

**Windows：**
```json
{
  "agents": {
    "defaults": {
      "workspace": "C:/Users/yourname/clawdbot-workspace"
    }
  }
}
```

#### 允许远程访问 Gateway

> ⚠️ 注意安全风险，仅在信任的网络中使用

```json
{
  "gateway": {
    "bind": "0.0.0.0"
  }
}
```

---

*文档版本: 2026.01.27*
*Clawdbot 版本: 2026.1.25*
