/**
 * OpenViking 分层路由器 v4
 *
 * 设计原则：大道至简
 * - 工具按"能力包"分类，路由模型做分类选择题
 * - core（read + exec）永远加载，保证 Agent 基础能力
 * - Skills 只给名称列表，主模型需要时自己 read SKILL.md
 * - 路由模型看到 L0 时间线，判断是否需要加载 L1（指定日期）/L2
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
  /** 是否需要加载 L1 关键决策 */
  needsL1: boolean;
  /** 需要加载哪些日期的 L1 决策（空数组 = 不需要） */
  l1Dates: string[];
  /** 是否需要加载 L2 完整对话 */
  needsL2: boolean;
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

const CORE_TOOLS = new Set(["read", "exec"]);

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
// 构建索引
// ========================

function buildPackIndex(): string {
  return Object.entries(TOOL_PACKS)
    .map(([name, pack]) => `  - ${name}: ${pack.description}`)
    .join("\n");
}

function buildSkillIndex(skills: SkillIndexEntry[]): string {
  if (skills.length === 0) return "  (无)";
  return skills.map((s) => `  - ${s.name}`).join("\n");
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
  timeline?: string;
}): { system: string; user: string } {
  const system = `You are a resource router. Select capability packs and files needed for the task.
Reply with ONLY a JSON object, no other text, no markdown.`;

  const packIndex = buildPackIndex();
  const skillIndex = buildSkillIndex(params.skills);
  const fileIndex = buildFileIndex(params.fileNames);

  const timelineSection = params.timeline
    ? `===== Conversation Timeline (L0) =====
This is a brief timeline of previous conversations. Each line has a date. Use it to determine if the user is referencing past work, and which dates are relevant.
${params.timeline}

`
    : "";

  const user = `User message: "${params.userMessage}"

${timelineSection}===== Capability Packs (select needed) =====
Always loaded: read + exec (do not select)
${packIndex}

===== Skills (for reference, all run via exec) =====
${skillIndex}

===== Workspace Files (select needed) =====
${fileIndex}

Reply JSON:
{"packs":["pack names"],"files":["file names"],"needsL1":false,"l1Dates":[],"needsL2":false,"reason":"brief reason"}

Rules:
1. SKILLS: If the task matches any skill above, no extra pack needed (exec is always loaded). But if the skill also needs web/message/etc, include those packs.
2. For ANY conversation: include SOUL.md, IDENTITY.md, USER.md.
3. File editing/coding: include "base-ext".
4. Web search: include "web".
5. Send messages/notifications: include "message".
6. Scheduled tasks/reminders: include "infra".
7. Simple chat: packs=[], files=["SOUL.md","IDENTITY.md","USER.md"].
8. When unsure: include more packs (cheap). Do NOT leave packs empty if the task needs tools beyond read+exec.
9. If the user references previous work shown in the Timeline, set needsL1: true and l1Dates to the relevant dates from the Timeline (format: "YYYY-MM-DD"). Only include dates that appear in the Timeline and are relevant to the user's question.
10. If the user needs the exact original conversation or full code (e.g., "把完整代码调出来", "看之前的详细对话"), set needsL2: true.
11. If no Timeline is provided or the user's question is unrelated to past work, set needsL1: false, l1Dates: [], needsL2: false.`;

  log.info(`[viking] routing prompt chars: ${user.length}`);
  return { system, user };
}

// ========================
// 调用路由模型
// ========================

interface RoutingModelResult {
  packs: string[];
  files: string[];
  needsL1?: boolean;
  l1Dates?: string[];
  needsL2?: boolean;
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
        max_tokens: 200,
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
      needsL1: parsed.needsL1 === true,
      l1Dates: Array.isArray(parsed.l1Dates) ? parsed.l1Dates.filter((d: unknown) => typeof d === "string") : [],
      needsL2: parsed.needsL2 === true,
    };
  } catch (err) {
    log.info(`[viking] routing call failed, fallback to full: ${String(err)}`);
    return null;
  }
}

// ========================
// 展开能力包
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
  /** L0 时间线原始文本，供路由模型判断是否需要 L1/L2 */
  timeline?: string;
}): Promise<VikingRouteResult> {
  const allToolNames = new Set(params.tools.map((t) => t.name));
  const allFileNames = new Set(params.fileNames);

  if (shouldSkipRouting()) {
    return {
      tools: allToolNames,
      files: allFileNames,
      promptLayer: "full",
      skillsMode: "summaries",
      skipped: true,
      needsL1: false,
      l1Dates: [],
      needsL2: false,
    };
  }

  if (!params.prompt || params.prompt.trim().length === 0) {
    return {
      tools: new Set(CORE_TOOLS),
      files: new Set<string>(),
      promptLayer: "L0" as PromptMode,
      skillsMode: "names",
      skipped: false,
      needsL1: false,
      l1Dates: [],
      needsL2: false,
    };
  }

  const { system, user } = buildRoutingPrompt({
    userMessage: params.prompt,
    fileNames: params.fileNames,
    skills: params.skills,
    timeline: params.timeline,
  });

  const result = await callRoutingModel({
    model: params.model,
    modelRegistry: params.modelRegistry,
    provider: params.provider,
    system,
    user,
  });

  if (!result) {
    return {
      tools: allToolNames,
      files: allFileNames,
      promptLayer: "full",
      skillsMode: "summaries",
      skipped: false,
      needsL1: false,
      l1Dates: [],
      needsL2: false,
    };
  }

  const expandedTools = expandPacks(result.packs);

  const validTools = new Set<string>();
  for (const t of expandedTools) {
    if (allToolNames.has(t)) validTools.add(t);
  }
  for (const core of CORE_TOOLS) {
    if (allToolNames.has(core)) validTools.add(core);
  }

  const selectedFiles = new Set(result.files.filter((f) => allFileNames.has(f)));

  const promptLayer: PromptMode =
    validTools.size <= 2
      ? ("L0" as PromptMode)
      : validTools.size <= 12
        ? ("L1" as PromptMode)
        : "full";

  log.info(
    `[viking] routed: packs=[${result.packs.join(",")}] tools=[${[...validTools].join(",")}] ` +
    `files=[${[...selectedFiles].join(",")}] layer=${promptLayer} ` +
    `needsL1=${result.needsL1} l1Dates=[${(result.l1Dates ?? []).join(",")}] needsL2=${result.needsL2}`,
  );

  return {
    tools: validTools,
    files: selectedFiles,
    promptLayer,
    skillsMode: "names",
    skipped: false,
    needsL1: result.needsL1 ?? false,
    l1Dates: result.l1Dates ?? [],
    needsL2: result.needsL2 ?? false,
  };
}

// ========================
// Skills 名称+描述列表
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
