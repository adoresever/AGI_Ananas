/**
 * OpenViking 分层路由器
 *
 * 在 session 创建前，用一次轻量模型调用判断用户意图，
 * 决定需要加载哪些工具 Schema、Bootstrap 文件、System Prompt section。
 *
 * 核心原则：Skills 优先。如果用户意图匹配某个 skill，优先通过 exec 执行 skill，
 * 而不是选择功能相似的内置工具（如 canvas）。
 *
 * 用 fetch 调 OpenAI 兼容 API，通过 ModelRegistry.getApiKey() 获取真实 token。
 *
 * 放置位置: src/agents/viking-router.ts
 */

import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { log } from "./pi-embedded-runner/logger.js";
import type { PromptMode } from "./system-prompt.js";

// ========================
// 总开关
// ========================
// true  = 启用 Viking 分层路由（按需加载工具/文件/prompt）
// false = 回到原本行为（全量加载所有资源）
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

// Skill 索引条目：name + description，从 SKILL.md frontmatter 提取
export interface SkillIndexEntry {
  name: string;
  description: string;
}

// ========================
// 判断是否跳过路由
// ========================

function shouldSkipRouting(): boolean {
  return !VIKING_ENABLED;
}

// ========================
// 从实际工具动态生成索引
// ========================

function buildToolIndex(tools: AgentToolLike[]): string {
  return tools
    .map((t) => {
      const desc = t.description ? t.description.split(".")[0].trim() : t.name;
      return `  - ${t.name}: ${desc}`;
    })
    .join("\n");
}

// ========================
// 从实际 skills 动态生成索引（带 description）
// ========================

function buildSkillIndex(skills: SkillIndexEntry[]): string {
  if (skills.length === 0) return "  (none)";
  return skills
    .map((s) => {
      if (s.description) {
        return `  - ${s.name}: ${s.description}`;
      }
      return `  - ${s.name}`;
    })
    .join("\n");
}

// ========================
// 从实际文件动态生成索引（带描述）
// ========================

const FILE_DESCRIPTIONS: Record<string, string> = {
  "AGENTS.md": "Agent core rules: session flow, safety, module index",
  "SOUL.md": "Agent personality, tone, character (needed for any conversation)",
  "TOOLS.md": "Local environment notes (SSH, cameras, TTS voices)",
  "IDENTITY.md": "Agent identity: name, emoji, avatar (needed for any conversation)",
  "USER.md": "User information and preferences (needed for personalized responses)",
  "HEARTBEAT.md": "Heartbeat task checklist for periodic checks",
  "BOOTSTRAP.md": "First-run setup guide (only needed on first run)",
};

function buildFileIndex(fileNames: string[]): string {
  return fileNames
    .map((name) => {
      const desc = FILE_DESCRIPTIONS[name] ?? "workspace file";
      return `  - ${name}: ${desc}`;
    })
    .join("\n");
}

// ========================
// 构建路由 prompt
// ========================

function buildRoutingPrompt(params: {
  userMessage: string;
  toolIndex: string;
  fileNames: string[];
  skills: SkillIndexEntry[];
}): { system: string; user: string } {
  const system = `You are a resource router. Based on the user message, select which tools and files are needed.
Reply with ONLY a JSON object, no other text, no markdown.`;

  const fileIndex = buildFileIndex(params.fileNames);
  const skillIndex = buildSkillIndex(params.skills);

  const user = `User message: "${params.userMessage}"

Available tools:
${params.toolIndex}

Available files:
${fileIndex}

Available skills (execute via exec tool):
${skillIndex}

Reply JSON:
{"tools":["tool names needed"],"files":["file names needed"],"needsFullPrompt":false,"reason":"why"}

Rules (in priority order):
1. SKILLS FIRST: Check if any skill's description or trigger words match the user's task. If yes, include "exec" tool (all skills run via exec). Do NOT use built-in tools (like canvas/browser) when a skill already handles the task.
2. For ANY conversation (including greetings): include SOUL.md, IDENTITY.md, USER.md
3. For safety/rules questions: include AGENTS.md
4. For heartbeat/cron tasks: include HEARTBEAT.md
5. For first-run setup: include BOOTSTRAP.md
6. File operations (no matching skill): include read/write/edit/exec
7. Web search (no matching skill): include web_search/web_fetch
8. Send messages: include message tool
9. Memory recall needed: include memory_search/memory_get
10. Simple chat (greetings/casual/knowledge with no skill match): tools=[]
11. When unsure about tools, include more rather than fewer
12. When unsure about files, include fewer rather than more`;

  return { system, user };
}

// ========================
// 用 fetch 调 OpenAI 兼容 API
// ========================

interface RoutingModelResult {
  tools: string[];
  files: string[];
  needsFullPrompt: boolean;
}

async function callRoutingModel(params: {
  model: Model<Api>;
  modelRegistry: ModelRegistry;
  provider: string;
  system: string;
  user: string;
}): Promise<RoutingModelResult> {
  try {
    const apiKey = await params.modelRegistry.getApiKey(params.model) ?? "";

    const baseUrl = (
      typeof params.model.baseUrl === "string" ? params.model.baseUrl.trim() : ""
    ) || "http://localhost:11434/v1";
    const modelId = params.model.id ?? params.model.name ?? "default";

    const url = `${baseUrl}/chat/completions`;
    log.info(`[viking] routing call: model=${modelId} url=${url} hasKey=${apiKey.length > 0}`);

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
        max_tokens: 300,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.info(`[viking] routing API error ${response.status}: ${errText.slice(0, 200)}`);
      return { tools: [], files: [], needsFullPrompt: true };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const responseText = data.choices?.[0]?.message?.content ?? "";
    log.info(`[viking] routing response: ${responseText.slice(0, 300)}`);

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.info(`[viking] response not JSON, fallback to full`);
      return { tools: [], files: [], needsFullPrompt: true };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
      needsFullPrompt: Boolean(parsed.needsFullPrompt),
    };
  } catch (err) {
    log.info(`[viking] routing call failed, fallback to full: ${String(err)}`);
    return { tools: [], files: [], needsFullPrompt: true };
  }
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
  // 总开关：关闭时回到原本全量行为
  if (shouldSkipRouting()) {
    return {
      tools: new Set(params.tools.map((t) => t.name)),
      files: new Set(params.fileNames),
      promptLayer: "full",
      skillsMode: "summaries",
      skipped: true,
    };
  }

  // 空消息：最小资源
  if (!params.prompt || params.prompt.trim().length === 0) {
    return {
      tools: new Set<string>(),
      files: new Set<string>(),
      promptLayer: "L0" as PromptMode,
      skillsMode: "names",
      skipped: false,
    };
  }

  const toolIndex = buildToolIndex(params.tools);
  const { system, user } = buildRoutingPrompt({
    userMessage: params.prompt,
    toolIndex,
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

  // AI 判断需要全量 → 降级
  if (result.needsFullPrompt) {
    return {
      tools: new Set(params.tools.map((t) => t.name)),
      files: new Set(params.fileNames),
      promptLayer: "full",
      skillsMode: "summaries",
      skipped: false,
    };
  }

  // 完全由 AI 决定，无硬编码保底
  const selectedTools = new Set(result.tools);
  const selectedFiles = new Set(result.files);

  const promptLayer: PromptMode =
    selectedTools.size <= 3
      ? ("L0" as PromptMode)
      : selectedTools.size <= 10
        ? ("L1" as PromptMode)
        : "full";

  log.info(
    `[viking] routed: tools=[${[...selectedTools].join(",")}] files=[${[...selectedFiles].join(",")}] layer=${promptLayer}`,
  );

  return {
    tools: selectedTools,
    files: selectedFiles,
    promptLayer,
    skillsMode: promptLayer === ("L0" as PromptMode) ? "names" : "summaries",
    skipped: false,
  };
}

// ========================
// Skills 名称列表（L0 用）
// ========================

export function buildSkillNamesOnlyPrompt(skillNames: string[]): string {
  if (skillNames.length === 0) return "";
  return [
    "## Skills",
    `Available: ${skillNames.join(", ")}. Use \`read\` on the skill's SKILL.md when needed.`,
  ].join("\n");
}
