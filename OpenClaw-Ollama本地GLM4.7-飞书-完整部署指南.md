# OpenClaw + GLM-4.7-Flash + 飞书 完整部署指南

> 本指南记录了如何在低配服务器上部署 OpenClaw，通过内网穿透调用本地电脑的 GLM-4.7-Flash 模型，并连接飞书机器人的完整过程。

## 一、架构概览

```
┌──────────────────────────────────────────────────────────────────────┐
│                            飞书云端                                   │
│                               │                                      │
│                               ▼ WebSocket 长连接                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │          云服务器 (3核 4.5GB Ubuntu 20.04)                       │  │
│  │  ┌──────────┐   ┌─────────────────────────────────────────┐    │  │
│  │  │ 1Panel   │   │           OpenClaw                       │    │  │
│  │  │(可视化)  │   │  配置 Ollama API → frp 隧道地址           │    │  │
│  │  └──────────┘   └─────────────────┬───────────────────────┘    │  │
│  │       frps 服务端 (端口 7100, 11434)                            │  │
│  └───────────────────────────────────┼────────────────────────────┘  │
│                                      │ frp 内网穿透                   │
│                                      ▼                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │       本地电脑 (Win11 + RTX 4070 Super 16GB)                    │  │
│  │       frpc 客户端                                               │  │
│  │                ┌───────────────────────┐                       │  │
│  │                │       Ollama          │                       │  │
│  │                │  GLM-4.7-Flash-16K    │                       │  │
│  │                │   (Q4_K_M 量化)        │                       │  │
│  │                │   监听 127.0.0.1:11434 │                       │  │
│  │                └───────────────────────┘                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## 二、硬件配置

| 设备 | 配置 | 用途 |
|------|------|------|
| 云服务器 | 3核 CPU, 4.5GB RAM, Ubuntu 20.04 | 运行 OpenClaw, frp 服务端 |
| 本地电脑 | Win11, RTX 4070 Super 16GB | 运行 Ollama + GLM-4.7-Flash |

## 三、软件版本

| 软件 | 版本 |
|------|------|
| Ollama | 0.15.4 |
| OpenClaw | 2026.1.30 |
| frp | 0.61.1 |
| Node.js | 22.x |
| GLM-4.7-Flash | Q4_K_M 量化版 |

---

## 四、部署步骤

### 第一阶段：本地电脑配置 (Win11)

#### 1. 安装 Ollama

从官网下载安装：https://ollama.com/download

验证安装：
```powershell
ollama --version
# 输出: ollama version is 0.15.4
```

#### 2. 下载 GLM-4.7-Flash 模型

```powershell
ollama pull glm-4.7-flash:q4_k_m
```

#### 3. 创建限制上下文的自定义模型

> ⚠️ **关键点**：OpenClaw 要求最小上下文窗口为 16000 tokens，不能设置太小！

```powershell
# 创建 Modelfile
@"
FROM glm-4.7-flash:q4_k_m
PARAMETER num_ctx 16384
"@ | Out-File -FilePath "Modelfile" -Encoding ASCII

# 创建自定义模型
ollama create glm-4.7-flash-16k -f Modelfile

# 验证
ollama list
```

#### 4. 安装 frp 客户端

```powershell
# 创建目录并下载
mkdir C:\frp -Force
cd C:\frp
Invoke-WebRequest -Uri "https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip" -OutFile "frp.zip"
Expand-Archive -Path "frp.zip" -DestinationPath "." -Force
cd frp_0.61.1_windows_amd64
```

#### 5. 配置 frp 客户端

创建 `frpc.toml`：
```powershell
Set-Content -Path "frpc.toml" -Value @"
serverAddr = "你的服务器公网IP"
serverPort = 7100
auth.token = "ollama_frp_token_2026"

[[proxies]]
name = "ollama-api"
type = "tcp"
localIP = "127.0.0.1"
localPort = 11434
remotePort = 11434
"@
```

#### 6. 启动 frp 客户端

```powershell
.\frpc.exe -c frpc.toml
```

看到以下输出表示成功：
```
[I] login to server success
[I] [ollama-api] start proxy success
```

---

### 第二阶段：云服务器配置 (Ubuntu)

#### 1. 安装 frp 服务端

```bash
mkdir -p ~/frp && cd ~/frp
wget https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_amd64.tar.gz
tar -xzf frp_0.61.1_linux_amd64.tar.gz
cd frp_0.61.1_linux_amd64
```

创建配置 `frps.toml`：
```bash
cat > frps.toml << 'EOF'
bindPort = 7100

webServer.addr = "0.0.0.0"
webServer.port = 7600
webServer.user = "admin"
webServer.password = "Ollama@2026"

auth.token = "ollama_frp_token_2026"
EOF
```

启动服务端：
```bash
nohup ./frps -c frps.toml > frps.log 2>&1 &
```

开放防火墙：
```bash
sudo ufw allow 7100/tcp
sudo ufw allow 7600/tcp
sudo ufw allow 11434/tcp
```

#### 2. 验证内网穿透

```bash
curl http://127.0.0.1:11434
# 应返回: Ollama is running
```

#### 3. 安装 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 4. 安装 pnpm 和 OpenClaw

```bash
npm install -g pnpm
pnpm setup
source ~/.bashrc
pnpm add -g openclaw@latest --ignore-scripts
```

#### 5. 运行 OpenClaw 配置向导

```bash
openclaw onboard
```

配置过程中：
- Model/auth provider: 选择 **Skip for now**
- Default model: 选择 **Enter model manually**，输入 `ollama/glm-4.7-flash-16k:latest`
- Install missing skill dependencies: 选择 **Skip for now**
- Enable hooks: 选择 **Skip for now**

#### 6. 配置 OpenClaw 使用 Ollama

编辑配置文件：
```bash
nano ~/.openclaw/openclaw.json
```

完整配置：
```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "apiKey": "ollama",
        "api": "openai-completions",
        "models": [
          {
            "id": "glm-4.7-flash-16k:latest",
            "name": "GLM 4.7 Flash 16K",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 16384,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "agents": {
    "defaults": {
      "maxConcurrent": 1,
      "subagents": {
        "maxConcurrent": 2
      },
      "compaction": {
        "mode": "safeguard"
      },
      "workspace": "/root/.openclaw/workspace",
      "model": {
        "primary": "ollama/glm-4.7-flash-16k:latest"
      },
      "models": {
        "ollama/glm-4.7-flash-16k:latest": {
          "alias": "glm"
        }
      }
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "你的token"
    },
    "port": 18789,
    "bind": "lan",
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  },
  "skills": {
    "install": {
      "nodeManager": "pnpm"
    }
  }
}
```

重启服务：
```bash
openclaw gateway restart
```

---

### 第三阶段：连接飞书

#### 1. 安装飞书插件

```bash
openclaw plugins install @openclaw-china/feishu
```

#### 2. 配置飞书

```bash
openclaw config set channels.feishu.appId "你的飞书AppID"
openclaw config set channels.feishu.appSecret "你的飞书AppSecret"
openclaw config set channels.feishu.enabled true
openclaw config set channels.feishu.connectionMode websocket
openclaw gateway restart
```

#### 3. 飞书开放平台配置

1. 登录 https://open.feishu.cn
2. 创建企业自建应用
3. 添加机器人能力
4. 获取 App ID 和 App Secret
5. 配置事件订阅：选择"长连接"模式
6. 添加权限：消息与群组 → 接收消息
7. 发布应用

---

## 五、重要端口和凭据汇总

| 服务 | 端口 | 说明 |
|------|------|------|
| frp 通信 | 7100 | frpc 与 frps 通信 |
| frp Dashboard | 7600 | Web 监控面板 |
| Ollama API | 11434 | 模型 API |
| OpenClaw Gateway | 18789 | Web UI 和 API |

---

## 六、常用运维命令

### 本地电脑 (Win11)

```powershell
# 启动 frp 客户端
cd C:\frp\frp_0.61.1_windows_amd64
.\frpc.exe -c frpc.toml

# 查看 Ollama 模型
ollama list

# 查看显存占用
nvidia-smi
```

### 云服务器 (Ubuntu)

```bash
# 启动 frp 服务端
cd ~/frp/frp_0.61.1_linux_amd64
nohup ./frps -c frps.toml > frps.log 2>&1 &

# OpenClaw 管理
openclaw gateway restart
openclaw gateway status

# 查看日志
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# 测试 Ollama 连接
curl http://127.0.0.1:11434/v1/models
```

---

## 七、踩坑记录

### 1. OpenClaw 安装失败 - cmake 版本太低

**问题**：Ubuntu 20.04 默认 cmake 版本是 3.16，OpenClaw 需要 3.19+

**解决**：
```bash
sudo apt remove cmake -y
pip install cmake --upgrade
```

### 2. OpenClaw 模型上下文太小

**问题**：设置 contextWindow=4096 时报错 `Model context window too small (4096 tokens). Minimum is 16000.`

**解决**：OpenClaw 要求最小上下文 16000 tokens，需要创建 num_ctx=16384 的自定义模型

### 3. 模型 ID 不匹配

**问题**：配置的模型 ID 与 Ollama 实际模型 ID 不一致导致找不到模型

**解决**：使用 `ollama list` 查看完整模型 ID（包括 `:latest` 后缀），确保配置完全一致

### 4. 飞书插件未安装

**问题**：配置飞书时报错 `unknown channel id: feishu`

**解决**：需要先安装飞书插件
```bash
openclaw plugins install @openclaw-china/feishu
```

### 5. Gateway bind 配置错误

**问题**：`gateway.bind` 设置为 `"0.0.0.0"` 或 `"all"` 报错

**解决**：有效值为 `"loopback"|"lan"|"tailnet"|"auto"|"custom"`，使用 `"lan"` 允许局域网访问

### 6. 显存占用过高导致推理缓慢

**问题**：GLM-4.7-Flash 默认占用约 15.6GB 显存，接近 16GB 显卡满载

**解决**：创建限制上下文的自定义模型，使用 `PARAMETER num_ctx 16384`

---

## 八、参考链接

- [OpenClaw 官方文档](https://docs.openclaw.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [Ollama 官网](https://ollama.com)
- [frp GitHub](https://github.com/fatedier/frp)
- [飞书开放平台](https://open.feishu.cn)
- [GLM-4.7-Flash 模型](https://ollama.com/library/glm-4.7-flash)

---

> 文档版本：v1.0  
> 完成日期：2026年2月2日  
