/**
 * OpenViking 分层历史索引 v5.1
 *
 * 三层架构：
 * - L0: 时间线索引（始终加载，极度精简，~200-500 tok）
 *       → 什么时间做了什么事，像书的目录
 *       → 时间戳本身就是 ID（如 202602260705），一举两得
 * - L1: 关键决策摘要（按日期按需加载，~1000-2000 tok）
 *       → 每个事件的具体细节，像每章的摘要
 *       → 每条决策带 [202602260705]，关联到 L0 和 L2
 * - L2: 完整对话（按需加载，极少触发）
 *       → 原始 JSONL 文件，像书的正文
 *       → 通过时间戳 ID 从 L1/L0 定位到对应 session
 *
 * 时间戳 ID 格式: YYYYMMDDHHmm（精确到分钟，如 202602260705）
 * - 天然唯一，不需要额外字段
 * - 同时承担"可读时间"和"唯一标识"双重角色
 * - 节省 token（不需要单独的 sid:xxx 字段）
 *
 * 关联链路：
 *   L0 (时间戳ID) → L1 ([时间戳ID]) → L2 (通过 tsid-session-map.json 映射到 sessionId)
 *
 * v5.1 变更（相对 v5）：
 * - 去掉 sid:xxx，改用时间戳 ID
 * - L0 格式: "- 202602260705 | 摘要"
 * - L1 格式: "- [202602260705] 决策内容"
 * - 新增 tsid-session-map.json 映射文件
 * - loadL2Session 通过时间戳 ID 反查 sessionId 再读 JSONL
 *
 * 放置位置: src/agents/history-index.ts
 */

import fs from "node:fs";
import path from "node:path";
import { log } from "./pi-embedded-runner/logger.ts";

// ========================
// 类型定义
// ========================

/** L0 加载结果（始终加载） */
export interface L0TimelineResult {
  available: boolean;
  /** L0 时间线文本，直接注入 system prompt */
  prompt: string;
  /** L0 原始文本（不带 XML 标签，给路由模型用） */
  rawTimeline: string;
  /** 分层模式下保留的最近对话轮数 */
  recentTurns: number;
  /** 日期(YYYY-MM-DD) → 时间戳ID[] 映射 */
  dateTsidMap: Record<string, string[]>;
  /** 时间戳ID → sessionId 映射（用于 L2 加载） */
  tsidSessionMap: Record<string, string>;
}

/** L1 加载结果（按日期按需加载） */
export interface L1DecisionsResult {
  available: boolean;
  /** L1 关键决策文本 */
  prompt: string;
}

/** L2 加载结果（按需加载） */
export interface L2SessionResult {
  available: boolean;
  /** L2 完整对话文本 */
  prompt: string;
  /** 实际加载的 sessionId 列表 */
  loadedSessionIds: string[];
}

/** JSONL 中的消息条目 */
interface JournalEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
    timestamp?: number;
  };
  customType?: string;
  data?: unknown;
}

// ========================
// 常量
// ========================

const HISTORY_DIR = "history";
const TIMELINE_FILE = "timeline.md";
const DECISIONS_FILE = "decisions.md";
const TSID_MAP_FILE = "tsid-session-map.json";
const DEFAULT_RECENT_TURNS = 5;

const SUMMARY_MODEL_ID = "qwen-max-latest";
const SUMMARY_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

const MAX_MESSAGE_CHARS = 1000;
const MAX_MESSAGES_TO_READ = 20;

/** L2 加载限制：每个 session 最多读取的消息数 */
const L2_MAX_MESSAGES_PER_SESSION = 30;
/** L2 加载限制：每条消息最大字符数 */
const L2_MAX_CHARS_PER_MESSAGE = 2000;
/** L2 加载限制：最多加载的 session 数 */
const L2_MAX_SESSIONS = 2;
/** L2 加载限制：总输出最大字符数（约 4000 tok） */
const L2_MAX_TOTAL_CHARS = 12000;

// ========================
// 工具函数
// ========================

function getHistoryDir(agentDir: string): string {
  return path.join(agentDir, HISTORY_DIR);
}

function getTimelinePath(agentDir: string): string {
  return path.join(getHistoryDir(agentDir), TIMELINE_FILE);
}

function getDecisionsPath(agentDir: string): string {
  return path.join(getHistoryDir(agentDir), DECISIONS_FILE);
}

function getTsidMapPath(agentDir: string): string {
  return path.join(getHistoryDir(agentDir), TSID_MAP_FILE);
}

function ensureHistoryDir(agentDir: string): void {
  const dir = getHistoryDir(agentDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.info(`[history] created history dir: ${dir}`);
  }
}

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * 生成时间戳 ID: YYYYMMDDHHmm（如 202602260705）
 * 同时作为可读时间和唯一标识
 */
function generateTsid(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}`;
}

function formatDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSessionsDir(agentDir: string): string {
  return path.join(path.dirname(agentDir), "sessions");
}

// ========================
// 时间戳ID → sessionId 映射
// ========================

/**
 * 读取 tsid→sessionId 映射表
 * 文件: history/tsid-session-map.json
 * 格式: { "202602260705": "640b4847-...", ... }
 */
function loadTsidSessionMap(agentDir: string): Record<string, string> {
  const mapPath = getTsidMapPath(agentDir);
  try {
    const raw = fs.readFileSync(mapPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * 保存 tsid→sessionId 映射（追加写入）
 */
function saveTsidMapping(agentDir: string, tsid: string, sessionId: string): void {
  const mapPath = getTsidMapPath(agentDir);
  const existing = loadTsidSessionMap(agentDir);
  existing[tsid] = sessionId;
  fs.writeFileSync(mapPath, JSON.stringify(existing, null, 2), "utf-8");
}

// ========================
// L0 解析
// ========================

/** 从 L0 单行中提取时间戳 ID，格式: - 202602260705 | 摘要 */
function parseTsidFromTimelineLine(line: string): string | null {
  const match = line.match(/^-\s*(\d{12})\s*\|/);
  return match ? match[1] : null;
}

/** 从时间戳 ID 中提取日期（YYYY-MM-DD 格式） */
function dateFromTsid(tsid: string): string | null {
  if (tsid.length < 8) return null;
  const year = tsid.slice(0, 4);
  const month = tsid.slice(4, 6);
  const day = tsid.slice(6, 8);
  return `${year}-${month}-${day}`;
}

/** 构建 dateTsidMap：从 timeline 文本解析出日期→tsid[] 映射 */
function buildDateTsidMap(timeline: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const lines = timeline.split("\n").filter((l) => l.trim().startsWith("-"));

  for (const line of lines) {
    const tsid = parseTsidFromTimelineLine(line);
    if (tsid) {
      const date = dateFromTsid(tsid);
      if (date) {
        if (!map[date]) map[date] = [];
        if (!map[date].includes(tsid)) {
          map[date].push(tsid);
        }
      }
    }
  }

  return map;
}

// ========================
// L1 解析：从 decisions 文本中提取时间戳 ID
// ========================

/**
 * 从 L1 文本中提取所有时间戳 ID
 * 匹配格式: [202602260705]
 */
export function extractTsids(l1Text: string): string[] {
  const ids: string[] = [];
  const regex = /\[(\d{12})\]/g;
  let match: RegExpExecArray | null;

  // biome-ignore lint: regex exec loop
  while ((match = regex.exec(l1Text)) !== null) {
    const tsid = match[1];
    if (tsid && !ids.includes(tsid)) {
      ids.push(tsid);
    }
  }

  return ids;
}

/**
 * 从 L0 的 dateTsidMap 中根据日期提取时间戳 ID 列表
 */
export function extractTsidsFromL0(
  l0Result: L0TimelineResult,
  dates?: string[],
): string[] {
  if (!dates || dates.length === 0) return [];

  const ids: string[] = [];
  for (const date of dates) {
    const tsids = l0Result.dateTsidMap[date];
    if (tsids) {
      for (const tsid of tsids) {
        if (!ids.includes(tsid)) ids.push(tsid);
      }
    }
  }

  return ids;
}

/**
 * 将时间戳 ID 列表转换为 sessionId 列表（用于 L2 加载）
 */
export function resolveSessionIdsFromTsids(
  tsids: string[],
  tsidSessionMap: Record<string, string>,
): string[] {
  const ids: string[] = [];
  for (const tsid of tsids) {
    const sid = tsidSessionMap[tsid];
    if (sid && !ids.includes(sid)) {
      ids.push(sid);
    }
  }
  return ids;
}

// ========================
// L2: 读取完整对话（内部使用）
// ========================

function readSessionMessages(sessionDir: string, sessionId: string): string {
  const jsonlPath = path.join(sessionDir, `${sessionId}.jsonl`);

  if (!fs.existsSync(jsonlPath)) {
    log.info(`[history] session file not found: ${jsonlPath}`);
    return "";
  }

  try {
    const raw = fs.readFileSync(jsonlPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);

    const messages: Array<{ role: string; text: string }> = [];

    for (const line of lines) {
      try {
        const entry: JournalEntry = JSON.parse(line);
        if (entry.type !== "message" || !entry.message) continue;

        const role = entry.message.role;
        if (role !== "user" && role !== "assistant") continue;

        let text = "";
        if (typeof entry.message.content === "string") {
          text = entry.message.content;
        } else if (Array.isArray(entry.message.content)) {
          text = entry.message.content
            .filter((block) => block.type === "text" && block.text)
            .map((block) => block.text ?? "")
            .join("\n");
        }

        if (text.trim().length > 0) {
          messages.push({ role, text: text.slice(0, MAX_MESSAGE_CHARS) });
        }
      } catch {
        // skip
      }
    }

    const recent = messages.slice(-MAX_MESSAGES_TO_READ);
    return recent.map((m) => `[${m.role}]: ${m.text}`).join("\n\n");
  } catch (err) {
    log.info(`[history] failed to read session file: ${String(err)}`);
    return "";
  }
}

// ========================
// L2: 按需加载（导出接口）
// ========================

/**
 * 按 sessionId 加载完整对话内容（L2）
 *
 * 触发条件：Viking 路由判断 needsL2: true
 * 来源：从 L1/L0 提取时间戳 ID → 通过 tsidSessionMap 转换为 sessionId → 读取 JSONL
 */
export async function loadL2Session(params: {
  agentDir: string;
  sessionIds: string[];
  maxTotalChars?: number;
}): Promise<L2SessionResult> {
  if (!params.sessionIds || params.sessionIds.length === 0) {
    return { available: false, prompt: "", loadedSessionIds: [] };
  }

  const sessionsDir = getSessionsDir(params.agentDir);
  const maxTotal = params.maxTotalChars ?? L2_MAX_TOTAL_CHARS;

  const targetIds = params.sessionIds.slice(0, L2_MAX_SESSIONS);
  const loadedParts: string[] = [];
  const loadedIds: string[] = [];
  let totalChars = 0;

  for (const sid of targetIds) {
    if (totalChars >= maxTotal) break;

    const jsonlPath = path.join(sessionsDir, `${sid}.jsonl`);
    if (!fs.existsSync(jsonlPath)) {
      log.info(`[history] L2 session not found: ${jsonlPath}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(jsonlPath, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);

      const messages: Array<{ role: string; text: string }> = [];

      for (const line of lines) {
        try {
          const entry: JournalEntry = JSON.parse(line);
          if (entry.type !== "message" || !entry.message) continue;

          const role = entry.message.role;
          if (role !== "user" && role !== "assistant") continue;

          let text = "";
          if (typeof entry.message.content === "string") {
            text = entry.message.content;
          } else if (Array.isArray(entry.message.content)) {
            text = entry.message.content
              .filter((block) => block.type === "text" && block.text)
              .map((block) => block.text ?? "")
              .join("\n");
          }

          if (text.trim().length > 0) {
            messages.push({ role, text: text.slice(0, L2_MAX_CHARS_PER_MESSAGE) });
          }
        } catch {
          // skip
        }
      }

      const recent = messages.slice(-L2_MAX_MESSAGES_PER_SESSION);
      const sessionText = recent.map((m) => `[${m.role}]: ${m.text}`).join("\n\n");

      if (sessionText.length > 0) {
        const remaining = maxTotal - totalChars;
        const truncated = sessionText.length > remaining
          ? sessionText.slice(0, remaining) + "\n...(truncated)"
          : sessionText;

        loadedParts.push(`### Session: ${sid}\n\n${truncated}`);
        loadedIds.push(sid);
        totalChars += truncated.length;
      }
    } catch (err) {
      log.info(`[history] L2 failed to read session ${sid}: ${String(err)}`);
    }
  }

  if (loadedParts.length === 0) {
    log.info(`[history] L2: no sessions loaded from [${targetIds.join(", ")}]`);
    return { available: false, prompt: "", loadedSessionIds: [] };
  }

  const content = loadedParts.join("\n\n---\n\n");
  const prompt = `<full_conversation>\n以下是相关的完整对话记录：\n\n${content}\n</full_conversation>`;

  log.info(`[history] L2 loaded: ${loadedIds.length} sessions, ${totalChars} chars`);

  return {
    available: true,
    prompt,
    loadedSessionIds: loadedIds,
  };
}

// ========================
// LLM 调用
// ========================

function resolveDashscopeApiKey(): string {
  const envKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (envKey) return envKey;

  try {
    const configPath = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "~",
      ".openclaw",
      "openclaw.json",
    );
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const apiKey = config?.models?.providers?.dashscope?.apiKey?.trim();
    if (apiKey) return apiKey;
  } catch {
    // ignore
  }

  log.info("[history] no dashscope apiKey found, summary disabled");
  return "";
}

async function callSummaryLLM(params: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string | null> {
  try {
    const url = `${SUMMARY_BASE_URL}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL_ID,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        max_tokens: params.maxTokens ?? 500,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.info(`[history] summary LLM error ${response.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    log.info(`[history] summary LLM call failed: ${String(err)}`);
    return null;
  }
}

// ========================
// 写入：每轮结束后从 L2 生成 L0 + L1
// ========================

export async function appendTimelineEntry(params: {
  agentDir: string;
  sessionKey: string;
  sessionId: string;
  prompt: string;
  assistantTexts: string[];
  toolMetas: Array<{ toolName: string }>;
  durationMs: number;
  model?: unknown;
  modelRegistry?: unknown;
  provider?: string;
}): Promise<void> {
  try {
    ensureHistoryDir(params.agentDir);

    const apiKey = resolveDashscopeApiKey();
    const tsid = generateTsid();
    const dateStr = formatDate();
    const sessionId = params.sessionId || params.sessionKey;

    // 保存 tsid→sessionId 映射
    saveTsidMapping(params.agentDir, tsid, sessionId);

    const sessionsDir = getSessionsDir(params.agentDir);
    const fullConversation = readSessionMessages(sessionsDir, sessionId);

    if (!apiKey || !fullConversation) {
      const promptHead = params.prompt.slice(0, 80).replace(/\n/g, " ");
      const fallbackLine = `- ${tsid} | ${promptHead}...\n`;
      fs.appendFileSync(getTimelinePath(params.agentDir), fallbackLine, "utf-8");
      log.info(`[history] L0 fallback (apiKey=${!!apiKey} conv=${!!fullConversation})`);
      return;
    }

    const toolList = params.toolMetas.map((t) => t.toolName).join(", ") || "无";

    const system = `你是一个技术记录助手。根据完整对话内容，生成两部分输出。使用中文。

严格按以下格式输出，不要输出任何其他内容：

[L0]
{一句话极简概括，10-20字，只说做了什么事，不要带任何前缀符号}

[L1]
{如果本轮有关键技术内容，列出具体细节；如果只是闲聊/问候，输出"无"}

L0 是时间线目录，要极度精简，像书的章节标题。注意：只输出摘要文本本身，不要输出时间戳、不要输出"- "前缀，这些由系统自动添加。

L1 是详细摘要，要包含具体的：
- 技术方案（用了什么库、什么方法）
- 文件路径、配置参数的具体值
- 代码改动（改了哪个文件、具体改了什么逻辑、为什么改）
- bug 根因和修复方式
- 确认的结论和共识

L1 每条要有足够的细节，让人不看原文也能知道具体怎么做的。每条决策用 "- " 开头，一行一条。`;

    const user = `===== 完整对话 =====
${fullConversation}

===== 使用的工具 =====
${toolList}

请按格式生成 [L0] 和 [L1]。`;

    const result = await callSummaryLLM({ apiKey, system, user, maxTokens: 800 });

    if (!result) {
      const promptHead = params.prompt.slice(0, 60).replace(/\n/g, " ");
      fs.appendFileSync(
        getTimelinePath(params.agentDir),
        `- ${tsid} | ${promptHead}...\n`,
        "utf-8",
      );
      log.info(`[history] L0 fallback (LLM failed)`);
      return;
    }

    const parsed = parseSummaryResult(result);

    // 写入 L0（代码拼接时间戳ID，不让 LLM 生成）
    if (parsed.l0) {
      let l0Summary = parsed.l0;
      // 去掉 LLM 可能残留的前缀
      l0Summary = l0Summary.replace(/^-\s*/, "").replace(/^\d{12}\s*\|\s*/, "");

      const l0Line = `- ${tsid} | ${l0Summary}`;
      fs.appendFileSync(getTimelinePath(params.agentDir), l0Line + "\n", "utf-8");
      log.info(`[history] L0 appended: ${l0Line.slice(0, 100)}`);
    }

    // 写入 L1（每条决策添加 [tsid] 前缀）
    if (parsed.l1) {
      const l1WithTsid = addTsidToL1(parsed.l1, tsid);
      const decisionsPath = getDecisionsPath(params.agentDir);
      const existing = safeReadFile(decisionsPath).trim();

      const todayHeader = `## ${dateStr}`;
      if (existing.includes(todayHeader)) {
        fs.appendFileSync(decisionsPath, "\n" + l1WithTsid + "\n", "utf-8");
      } else {
        const separator = existing.length > 0 ? "\n\n" : "";
        fs.appendFileSync(
          decisionsPath,
          separator + todayHeader + "\n\n" + l1WithTsid + "\n",
          "utf-8",
        );
      }
      log.info(`[history] L1 appended (${l1WithTsid.length} chars) tsid=${tsid}`);
    } else {
      log.info("[history] L1: no decisions this turn");
    }
  } catch (err) {
    log.warn(`[history] append failed: ${String(err)}`);
  }
}

/**
 * 给 L1 的每条决策添加 [tsid] 前缀
 * 输入: "- 决策1\n- 决策2"
 * 输出: "- [202602260705] 决策1\n- [202602260705] 决策2"
 */
function addTsidToL1(l1Text: string, tsid: string): string {
  const lines = l1Text.split("\n");
  const tagged = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      // 检查是否已经有 [12位数字]
      if (trimmed.match(/^- \[\d{12}\]/)) {
        return line;
      }
      return line.replace(/^(\s*- )/, `$1[${tsid}] `);
    }
    return line;
  });
  return tagged.join("\n");
}

function parseSummaryResult(raw: string): { l0: string; l1: string } {
  const result = { l0: "", l1: "" };

  const l0Match = raw.match(/\[L0\]\s*\n([\s\S]*?)(?=\[L1\]|$)/);
  if (l0Match) {
    const firstLine = l0Match[1].trim().split("\n")[0]?.trim();
    if (firstLine) result.l0 = firstLine;
  }

  if (!result.l0) {
    const firstLine = raw.split("\n").find((l) => l.trim().length > 0 && !l.includes("[L0]") && !l.includes("[L1]"))?.trim();
    result.l0 = firstLine ?? "(摘要生成失败)";
  }

  const l1Match = raw.match(/\[L1\]\s*\n([\s\S]*?)$/);
  if (l1Match) {
    const l1Text = l1Match[1].trim();
    if (l1Text && l1Text !== "无" && !l1Text.startsWith("无")) {
      result.l1 = l1Text;
    }
  }

  return result;
}

// ========================
// 读取 L0（始终加载）
// ========================

export async function loadL0Timeline(params: {
  agentDir: string;
}): Promise<L0TimelineResult> {
  const timelinePath = getTimelinePath(params.agentDir);
  const timeline = safeReadFile(timelinePath).trim();

  if (!timeline) {
    return {
      available: false,
      prompt: "",
      rawTimeline: "",
      recentTurns: DEFAULT_RECENT_TURNS,
      dateTsidMap: {},
      tsidSessionMap: {},
    };
  }

  const dateTsidMap = buildDateTsidMap(timeline);
  const tsidSessionMap = loadTsidSessionMap(params.agentDir);

  const prompt = `<conversation_timeline>\n以下是历史对话的时间线索引：\n${timeline}\n</conversation_timeline>`;

  log.info(`[history] L0 loaded: ${timeline.length} chars, dates: ${Object.keys(dateTsidMap).length}`);

  return {
    available: true,
    prompt,
    rawTimeline: timeline,
    recentTurns: DEFAULT_RECENT_TURNS,
    dateTsidMap,
    tsidSessionMap,
  };
}

// ========================
// 读取 L1（按日期/时间戳ID 按需加载）
// ========================

/**
 * 从 decisions.md 中提取指定日期和/或时间戳 ID 的决策内容
 *
 * decisions.md 格式：
 * ## 2026-02-24
 * - [202602241600] 决策1
 * - [202602241600] 决策2
 *
 * ## 2026-02-26
 * - [202602260705] 决策3
 *
 * 过滤优先级：
 * 1. 如果指定了 tsids，精确匹配包含这些时间戳 ID 的条目
 * 2. 如果指定了 dates，加载整个日期段
 * 3. 都不指定则加载全部
 */
export async function loadL1Decisions(params: {
  agentDir: string;
  /** 指定要加载的日期列表 */
  dates?: string[];
  /** 指定要加载的时间戳 ID 列表（更精确的过滤） */
  tsids?: string[];
}): Promise<L1DecisionsResult> {
  const decisionsPath = getDecisionsPath(params.agentDir);
  const fullContent = safeReadFile(decisionsPath).trim();

  if (!fullContent) {
    return { available: false, prompt: "" };
  }

  // 优先按时间戳 ID 过滤（最精确）
  if (params.tsids && params.tsids.length > 0) {
    const tsidSet = new Set(params.tsids);
    const filteredLines: string[] = [];
    let currentDateHeader = "";

    for (const line of fullContent.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.match(/^## \d{4}-\d{2}-\d{2}$/)) {
        currentDateHeader = trimmed;
        continue;
      }

      const tsidMatch = trimmed.match(/\[(\d{12})\]/);
      if (tsidMatch && tsidSet.has(tsidMatch[1])) {
        if (currentDateHeader && !filteredLines.includes(currentDateHeader)) {
          if (filteredLines.length > 0) filteredLines.push("");
          filteredLines.push(currentDateHeader);
          filteredLines.push("");
        }
        filteredLines.push(trimmed);
      }
    }

    if (filteredLines.length === 0) {
      log.info(`[history] L1: no decisions found for tsids [${params.tsids.join(", ")}]`);
      return { available: false, prompt: "" };
    }

    const filteredContent = filteredLines.join("\n");
    const prompt = `<key_decisions>\n以下是相关时间点的关键决策和技术细节：\n${filteredContent}\n</key_decisions>`;
    log.info(`[history] L1 loaded (tsids: ${params.tsids.join(", ")}): ${filteredContent.length} chars`);
    return { available: true, prompt };
  }

  // 按日期过滤
  if (params.dates && params.dates.length > 0) {
    const requestedDates = new Set(params.dates);
    const sections = parseDecisionsByDate(fullContent);
    const matched: string[] = [];

    for (const [date, content] of sections) {
      if (requestedDates.has(date)) {
        matched.push(`## ${date}\n\n${content}`);
      }
    }

    if (matched.length === 0) {
      log.info(`[history] L1: no decisions found for dates [${params.dates.join(", ")}]`);
      return { available: false, prompt: "" };
    }

    const filteredContent = matched.join("\n\n");
    const prompt = `<key_decisions>\n以下是 ${params.dates.join(", ")} 的关键决策和技术细节：\n${filteredContent}\n</key_decisions>`;
    log.info(`[history] L1 loaded (dates: ${params.dates.join(", ")}): ${filteredContent.length} chars`);
    return { available: true, prompt };
  }

  // 无过滤，加载全部
  const prompt = `<key_decisions>\n以下是历史对话中提取的关键决策和技术细节：\n${fullContent}\n</key_decisions>`;
  log.info(`[history] L1 loaded (all): ${fullContent.length} chars`);
  return { available: true, prompt };
}

/**
 * 解析 decisions.md，按日期分割成 Map<date, content>
 */
function parseDecisionsByDate(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const dateHeaderRegex = /^## (\d{4}-\d{2}-\d{2})$/gm;

  let lastDate: string | null = null;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // biome-ignore lint: regex exec loop
  while ((match = dateHeaderRegex.exec(content)) !== null) {
    if (lastDate !== null) {
      const sectionContent = content.slice(lastIndex, match.index).trim();
      if (sectionContent) {
        const existing = sections.get(lastDate) ?? "";
        sections.set(lastDate, existing ? existing + "\n" + sectionContent : sectionContent);
      }
    }
    lastDate = match[1];
    lastIndex = match.index + match[0].length;
  }

  if (lastDate !== null) {
    const sectionContent = content.slice(lastIndex).trim();
    if (sectionContent) {
      const existing = sections.get(lastDate) ?? "";
      sections.set(lastDate, existing ? existing + "\n" + sectionContent : sectionContent);
    }
  }

  return sections;
}

// ========================
// 兼容函数
// ========================

export async function maybeTriggerL1Summary(params: {
  agentDir: string;
  config?: unknown;
  model?: unknown;
  modelRegistry?: unknown;
  provider?: string;
}): Promise<void> {
  log.info("[history] L1 realtime extraction enabled, batch trigger skipped");
}

export async function loadLayeredHistory(params: {
  agentDir: string;
  sessionKey: string;
  config?: unknown;
}): Promise<{ enabled: boolean; prompt: string; recentTurns: number }> {
  const l0 = await loadL0Timeline({ agentDir: params.agentDir });
  return {
    enabled: l0.available,
    prompt: l0.prompt,
    recentTurns: l0.recentTurns,
  };
}
