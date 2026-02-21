# OpenClaw-Viking：完整优化版

> 这是一个基于 OpenClaw 2026.2.20 的**完整可运行版本**，包含 Viking 分层路由优化和多项定制改造。  
> 直接 clone 本目录即可使用，不需要再拉 OpenClaw 官方仓库。  
> 即使未来 OpenClaw 架构大改，本版本依然可以独立运行。

---

## 一、这个版本做了什么

核心目标：**让 OpenClaw 能用本地小模型高效运行，大幅降低 Token 消耗和 API 成本。**

### 1. Viking 分层路由系统（核心改造）

OpenClaw 原版的问题：不管用户说什么，每次请求都全量加载 24 个工具定义、7 个引导文件、全部 Skill 摘要，固定消耗约 **15,466 tokens**。一句"你好"也要烧这么多。

Viking 的做法：在调用主模型之前，先用一个轻量本地模型（如 GLM-4.7-Flash）快速判断用户意图，只加载真正需要的工具、文件和技能。

**实测效果：**

| 场景 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 简单对话（"你好"） | 15,466 tokens | 1,021 tokens | 93% |
| TTS 语音 + 发送 | 15,466 tokens | 1,778 tokens | 88% |
| 文件操作 | 15,466 tokens | 3,058 tokens | 80% |
| 代码编写 + 运行 | 15,466 tokens | 5,122 tokens | 67% |

### 2. Workspace 文件拆分精简

原版 `AGENTS.md` 有 **7,848 字符**，里面塞了大量 OpenClaw 开发团队的编码规范（代码风格、commit 规范、PR 模板等），这些对终端用户完全没用，反而浪费 token。

改造后将 `AGENTS.md` 精简到 **1,245 字符**，只保留 Agent 核心行为定义。原来混在一起的内容被拆分成独立的 workspace 文件，路由器按需加载而不是全量注入。

### 3. 多 Provider 兼容

移除了 vLLM 专用参数 `chat_template_kwargs`，确保路由调用兼容所有 OpenAI 格式的 API 后端：Ollama、vLLM、OpenAI、通义千问等。

### 4. Skill 描述提取与优先路由

路由器从 Skill 的 `SKILL.md` frontmatter 中自动提取 `name` 和 `description`，用于路由判断。实现了 **Skill 优先原则**：当用户意图匹配到某个 Skill（比如"画一张图"匹配 qwen-image），路由器会选择 `exec` 工具来执行 Skill 脚本，而不是选择内置的同名工具（如 canvas）。

### 5. 钉钉通道插件集成

集成了自定义钉钉 Stream 模式插件（`openclaw-diding`），支持钉钉群消息收发、语音播报等功能。

---

## 二、修改文件清单

相对于 OpenClaw 2026.2.20 官方版本，以下是所有修改/新增的文件：

### 核心路由系统（新增）

| 文件 | 说明 |
|------|------|
| `src/agents/viking-router.ts` | Viking 路由器核心。动态生成工具索引，提取 Skill 描述，调用轻量模型做路由判断，返回精简后的工具/文件/技能集合 |

### 源码修改

| 文件 | 修改内容 |
|------|----------|
| `src/agents/attempt.ts` | 在 session 创建前插入路由过滤逻辑，用 `routingDecision.tools.has()` 和 `routingDecision.files.has()` 过滤工具和上下文文件 |
| `src/agents/system-prompt.ts` | 支持 L0/L1 分层 prompt，按路由结果动态选择注入哪些 system prompt sections |

### Workspace 文件（精简/拆分）

| 文件 | 说明 |
|------|------|
| `AGENTS.md` | 从 7,848 字符精简到 1,245 字符，移除开发团队编码规范，只保留 Agent 行为定义 |

### 钉钉插件

| 目录 | 说明 |
|------|------|
| `openclaw-diding/` | 钉钉 Stream 模式通道插件，Fork 自 clawdbot-channel-dingtalk 并添加 openclaw 兼容 |

---

## 三、快速启动

### 环境要求

- Node.js >= 18
- pnpm

### 启动步骤

```bash
# 1. clone 本仓库
git clone https://github.com/adoresever/AGI_Ananans.git
cd AGI_Ananans/26.2.21openclaw-viking

# 2. 安装依赖
pnpm install

# 3. 构建 Web UI（必须在 build 之前执行）
pnpm ui:build

# 4. 构建项目
pnpm build

# 5. 首次配置（选择模型 Provider、通道等）
pnpm openclaw onboard

# 6. 启动服务
pnpm openclaw gateway --verbose    # 前台模式，可看日志
# 或
pnpm openclaw gateway              # 后台模式

# 7. 打开仪表盘（onboard 完成后会显示链接）
pnpm openclaw dashboard
```

### 常用命令

```bash
# 停止服务
pnpm openclaw gateway stop

# 终端交互模式（直接和 AI 对话）
pnpm openclaw tui

# 查看上下文 token 消耗（在 TUI 中输入）
/context detail

# 查看已安装的 Skills
pnpm openclaw skills list

# 查看日志
pnpm openclaw logs --follow
```

### 钉钉插件安装（可选）

```bash
pnpm openclaw plugins install https://github.com/adoresever/openclaw-diding.git
```

然后在 `~/.openclaw/openclaw.json` 中配置钉钉凭证：
```json
{
  "channels": {
    "dingtalk": {
      "enabled": true,
      "clientId": "你的钉钉 AppKey",
      "clientSecret": "你的钉钉 AppSecret",
      "dmPolicy": "open",
      "groupPolicy": "open",
      "requireMention": true
    }
  }
}
```

### 自定义 Skill 开发（可选）

如果你想添加自己的 Skill（如语音播报、图片生成等），需要额外安装：

```bash
sudo apt install -y ffmpeg
pip install edge-tts requests --break-system-packages
```

Skill 放在项目的 `skills/` 目录下，每个 Skill 需要一个 `SKILL.md` 文件，格式示例：

```markdown
---
name: your-skill-name
description: 技能描述，用于路由器判断何时触发此技能。
---

# 技能名称

使用说明...
```

### 路由模型配置

推荐用本地模型做路由（零成本）：

```bash
# Ollama（最简单）
ollama serve && ollama pull glm4:latest

# 或 vLLM（如已部署）
# Viking 自动调用 http://localhost:8001/v1/chat/completions
```

### 验证优化是否生效

`--verbose` 模式下发消息，日志会显示：
```
[Viking Router] 路由决策: tools=[exec], files=[], skills=[qwen-image]
[Viking Router] Token 节省: 15466 → 1778 (88.5%)
```

---

## 四、技术原理

```
用户消息
    │
    ▼
┌─────────────────────────────┐
│  Viking Router              │
│  • 生成工具索引（名称+描述）  │
│  • 提取 Skill frontmatter   │
│  • 轻量模型判断用户意图       │
│  • 输出: 需要的 tools/files  │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  attempt.ts 过滤层           │
│  • toolsRaw.filter(路由结果)  │
│  • contextFiles.filter(路由)  │
│  • 精简后创建 Session         │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  主模型响应                   │
│  • 只看到需要的工具和文件      │
│  • Token 消耗大幅降低         │
└─────────────────────────────┘
```

如果路由模型调用失败，自动 fallback 到全量加载，不影响任何原有功能。

---

## 五、注意事项

1. **完整快照**：本目录是 OpenClaw 2026.2.20 + Viking 改造的完整源码，可独立运行，不依赖上游
2. **构建顺序**：必须先 `pnpm ui:build` 再 `pnpm build`，否则会报 a2ui bundle 缺失错误
3. **路由模型建议 7B+**，太小判断不准。GLM-4.7-Flash 实测效果良好
4. **推送前清理敏感信息**：如果你 Fork 本项目，确保不包含 API Key、钉钉密钥等
5. **Skill 脚本路径**：自定义 Skill 中的绝对路径需根据你的部署环境修改

---

## 六、相关资源

- **B站**：搜索 **菠萝Ananas**，OpenClaw 系列教程
- **GitHub**：[adoresever/AGI_Ananans](https://github.com/adoresever/AGI_Ananans)
- **钉钉插件**：[adoresever/openclaw-diding](https://github.com/adoresever/openclaw-diding)
- **OpenClaw 官方**：[openclaw/openclaw](https://github.com/openclaw/openclaw)

---

## 许可证

基于 OpenClaw（Apache 2.0 License），Viking 优化部分由 **Ananas** 开发维护，同样采用 Apache 2.0 协议。
