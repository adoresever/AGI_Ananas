/**
 * OpenViking 分层路由器 v2
 *
 * 设计原则：大道至简
 * - 工具按"能力包"分类，路由模型做分类选择题
 * - core（read + exec）永远加载，保证 Agent 基础能力
 * - Skills 只给名称列表，主模型需要时自己 read SKILL.md
 * - 路由失败自动回退全量
 *
 * 放置位置: src/agents/viking-router.ts
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { log } from "./pi-embedded-runner/logger.ts";
import type { PromptMode } from "./system-prompt.ts";

// ========================
// 总开关
// ========================
const VIKING_ENABLED = true;

// ========================
// 类型
// ========================

export interface VikingRouteResult {
  tools: Set<string>;
  files: Set<string>;
  promptLayer: PromptMode;
  skillsMode: "names" | "summaries";
  skipped: boolean;
}

interface AgentToolLike {
  name: string;
  description?: string;
}

export interface SkillIndexEntry {
  name: string;
  description: string;
}

// ========================
// 能力包定义
// ========================

// core：永远加载，不参与选择（~400 tok）
const CORE_TOOLS = new Set(["read", "exec"]);

// 能力包：路由模型选择
const TOOL_PACKS: Record<string, { tools: string[]; description: string }> = {
  "base-ext": {
    tools: ["write", "edit", "apply_patch", "grep", "find", "ls", "process"],
    description: "文件编辑、搜索、目录操作、后台进程管理",
  },
  "web": {
    tools: ["web_search", "web_fetch"],
    description: "搜索互联网、抓取网页内容",
  },
  "browser": {
    tools: ["browser"],
    description: "控制浏览器打开和操作网页",
  },
  "message": {
    tools: ["message"],
    description: "发送消息到钉钉、Telegram、Discord等通道",
  },
  "media": {
    tools: ["canvas", "image"],
    description: "图片生成、画布展示和截图",
  },
  "infra": {
    tools: ["cron", "gateway", "session_status"],
    description: "定时任务、系统管理、状态查询、提醒",
  },
  "agents": {
    tools: ["agents_list", "sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "subagents"],
    description: "多Agent协作、子任务派发、会话管理",
  },
  "nodes": {
    tools: ["nodes"],
    description: "设备控制、摄像头、屏幕操作",
  },
};

// ========================
// 文件描述
// ========================

const FILE_DESCRIPTIONS: Record<string, string> = {
  "AGENTS.md": "Agent核心规则：会话流程、安全、模块索引",
  "SOUL.md": "Agent人格、语气、性格（任何对话都需要）",
  "TOOLS.md": "本地环境备注（SSH、摄像头、TTS语音等）",
  "IDENTITY.md": "Agent身份：名字、emoji、头像（任何对话都需要）",
  "USER.md": "用户信息和偏好（个性化回复需要）",
  "HEARTBEAT.md": "心跳任务清单",
  "BOOTSTRAP.md": "首次运行引导（仅首次需要）",
};

// ========================
// 判断是否跳过路由
// ========================

function shouldSkipRouting(): boolean {
  return !VIKING_ENABLED;
}

// ========================
// 构建 L0 索引
// ========================

function buildPackIndex(): string {
  return Object.entries(TOOL_PACKS)
    .map(([name, pack]) => `  - ${name}: ${pack.description}`)
    .join("\n");
}

function buildSkillIndex(skills: SkillIndexEntry[]): string {
  if (skills.length === 0) return "  (无)";
  return skills
    .map((s) => s.description ? `  - ${s.name}: ${s.description}` : `  - ${s.name}`)
    .join("\n");
}

function buildFileIndex(fileNames: string[]): string {
  return fileNames
    .map((name) => {
      const desc = FILE_DESCRIPTIONS[name] ?? "workspace文件";
      return `  - ${name}: ${desc}`;
    })
    .join("\n");
}

// ========================
// 构建路由 prompt
// ========================

function buildRoutingPrompt(params: {
  userMessage: string;
  fileNames: string[];
  skills: SkillIndexEntry[];
}): { system: string; user: string } {
  const system = `You are a resource router. Select capability packs and files needed for the task.
Reply with ONLY a JSON object, no other text, no markdown.`;

  const packIndex = buildPackIndex();
  const skillIndex = buildSkillIndex(params.skills);
  const fileIndex = buildFileIndex(params.fileNames);

  const user = `User message: "${params.userMessage}"

===== Capability Packs (select needed) =====
Always loaded: read + exec (do not select)
${packIndex}

===== Skills (for reference, all run via exec) =====
${skillIndex}

===== Workspace Files (select needed) =====
${fileIndex}

Reply JSON:
{"packs":["pack names"],"files":["file names"],"reason":"brief reason"}

Rules:
1. SKILLS: If the task matches any skill above, no extra pack needed (exec is always loaded). But if the skill also needs web/message/etc, include those packs.
2. For ANY conversation: include SOUL.md, IDENTITY.md, USER.md.
3. File editing/coding: include "base-ext".
4. Web search: include "web".
5. Send messages/notifications: include "message".
6. Scheduled tasks/reminders: include "infra".
7. Simple chat: packs=[], files=["SOUL.md","IDENTITY.md","USER.md"].
8. When unsure: include more packs (cheap). Do NOT leave packs empty if the task needs tools beyond read+exec.`;

  return { system, user };
}

// ========================
// 调用路由模型
// ========================

interface RoutingModelResult {
  packs: string[];
  files: string[];
}

async function callRoutingModel(params: {
  model: Model<Api>;
  modelRegistry: ModelRegistry;
  provider: string;
  system: string;
  user: string;
}): Promise<RoutingModelResult | null> {
  try {
    const apiKey = await params.modelRegistry.getApiKey(params.model) ?? "";
    const baseUrl = (
      typeof params.model.baseUrl === "string" ? params.model.baseUrl.trim() : ""
    ) || "http://localhost:11434/v1";
    const modelId = params.model.id ?? params.model.name ?? "default";

    const url = `${baseUrl}/chat/completions`;
    log.info(`[viking] routing call: model=${modelId} url=${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        max_tokens: 150,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.info(`[viking] routing API error ${response.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const responseText = data.choices?.[0]?.message?.content ?? "";
    log.info(`[viking] routing response: ${responseText.slice(0, 300)}`);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.info(`[viking] response not JSON, fallback to full`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      packs: Array.isArray(parsed.packs) ? parsed.packs : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  } catch (err) {
    log.info(`[viking] routing call failed, fallback to full: ${String(err)}`);
    return null;
  }
}

// ========================
// 展开能力包 → 具体工具
// ========================

function expandPacks(packNames: string[]): Set<string> {
  const tools = new Set<string>(CORE_TOOLS);
  for (const name of packNames) {
    const pack = TOOL_PACKS[name];
    if (pack) {
      for (const tool of pack.tools) {
        tools.add(tool);
      }
    } else {
      log.info(`[viking] unknown pack "${name}", ignored`);
    }
  }
  return tools;
}

// ========================
// 主入口
// ========================

export async function vikingRoute(params: {
  prompt: string;
  tools: AgentToolLike[];
  fileNames: string[];
  skills: SkillIndexEntry[];
  model: Model<Api>;
  modelRegistry: ModelRegistry;
  provider: string;
}): Promise<VikingRouteResult> {
  const allToolNames = new Set(params.tools.map((t) => t.name));
  const allFileNames = new Set(params.fileNames);

  // 总开关关闭 → 全量
  if (shouldSkipRouting()) {
    return {
      tools: allToolNames,
      files: allFileNames,
      promptLayer: "full",
      skillsMode: "summaries",
      skipped: true,
    };
  }

  // 空消息 → 只有 core
  if (!params.prompt || params.prompt.trim().length === 0) {
    return {
      tools: new Set(CORE_TOOLS),
      files: new Set<string>(),
      promptLayer: "L0" as PromptMode,
      skillsMode: "names",
      skipped: false,
    };
  }

  // 构建 L0 prompt 并调用路由模型
  const { system, user } = buildRoutingPrompt({
    userMessage: params.prompt,
    fileNames: params.fileNames,
    skills: params.skills,
  });

  const result = await callRoutingModel({
    model: params.model,
    modelRegistry: params.modelRegistry,
    provider: params.provider,
    system,
    user,
  });

  // 路由失败 → 全量（兜底）
  if (!result) {
    return {
      tools: allToolNames,
      files: allFileNames,
      promptLayer: "full",
      skillsMode: "summaries",
      skipped: false,
    };
  }

  // 展开能力包（core 永远在）
  const expandedTools = expandPacks(result.packs);

  // 只保留实际存在的工具
  const validTools = new Set<string>();
  for (const t of expandedTools) {
    if (allToolNames.has(t)) validTools.add(t);
  }
  // core 强制保留
  for (const core of CORE_TOOLS) {
    if (allToolNames.has(core)) validTools.add(core);
  }

  // 选中的文件
  const selectedFiles = new Set(result.files.filter((f) => allFileNames.has(f)));

  // promptLayer
  const promptLayer: PromptMode =
    validTools.size <= 2
      ? ("L0" as PromptMode)
      : validTools.size <= 12
        ? ("L1" as PromptMode)
        : "full";

  log.info(
    `[viking] routed: packs=[${result.packs.join(",")}] tools=[${[...validTools].join(",")}] ` +
    `files=[${[...selectedFiles].join(",")}] layer=${promptLayer}`,
  );

  return {
    tools: validTools,
    files: selectedFiles,
    promptLayer,
    skillsMode: "names",
    skipped: false,
  };
}

// ========================
// Skills 名称+描述列表（给 attempt.ts 用）
// ========================

export function buildSkillNamesOnlyPrompt(skills: SkillIndexEntry[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map((s) =>
    s.description ? `- ${s.name}: ${s.description}` : `- ${s.name}`
  );
  return [
    "## Skills",
    ...lines,
    `Use \`read\` on the skill's SKILL.md when needed.`,
  ].join("\n");
}
