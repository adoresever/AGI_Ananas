/**
 * 钉钉消息处理
 * 
 * 实现消息解析、策略检查和 Agent 分发
 */

import type { DingtalkRawMessage, DingtalkMessageContext } from "./types.js";
import type { DingtalkConfig } from "./config.js";
import { getDingtalkRuntime, isDingtalkRuntimeInitialized } from "./runtime.js";
import { sendMessageDingtalk } from "./send.js";
import { sendMediaDingtalk } from "./media.js";
import { createLogger, type Logger } from "./logger.js";

/**
 * 策略检查结果
 */
export interface PolicyCheckResult {
  /** 是否允许处理该消息 */
  allowed: boolean;
  /** 拒绝原因（如果被拒绝） */
  reason?: string;
}

/**
 * 解析钉钉原始消息为标准化的消息上下文
 * 
 * @param raw 钉钉原始消息对象
 * @returns 解析后的消息上下文
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export function parseDingtalkMessage(raw: DingtalkRawMessage): DingtalkMessageContext {
  // 根据 conversationType 判断聊天类型
  // "1" = 单聊 (direct), "2" = 群聊 (group)
  const chatType = raw.conversationType === "2" ? "group" : "direct";
  
  // 提取消息内容
  let content = "";
  
  if (raw.msgtype === "text" && raw.text?.content) {
    // 文本消息：提取 text.content
    content = raw.text.content.trim();
  } else if (raw.msgtype === "audio" && raw.content?.recognition) {
    // 音频消息：提取语音识别文本 content.recognition
    content = raw.content.recognition.trim();
  }
  
  // 检查是否 @提及了机器人
  const mentionedBot = resolveMentionedBot(raw);
  
  // 使用 Stream 消息 ID（如果可用），确保去重稳定
  const messageId = raw.streamMessageId ?? `${raw.conversationId}_${Date.now()}`;
  
  const senderId =
    raw.senderStaffId ??
    raw.senderUserId ??
    raw.senderUserid ??
    raw.senderId;

  return {
    conversationId: raw.conversationId,
    messageId,
    senderId,
    senderNick: raw.senderNick,
    chatType,
    content,
    contentType: raw.msgtype,
    mentionedBot,
    robotCode: raw.robotCode,
  };
}

/**
 * 判断是否 @提及了机器人
 *
 * - 如果提供了 robotCode，则只在 atUsers 包含 robotCode 时判定为提及机器人
 * - 如果缺少 robotCode，则退化为“存在任意 @”的判断
 */
function resolveMentionedBot(raw: DingtalkRawMessage): boolean {
  const atUsers = raw.atUsers ?? [];
  // 只要有 @，就认为机器人被提及（钉钉群聊机器人只有被 @才会收到消息）
  return atUsers.length > 0;
}

/**
 * 检查单聊策略
 * 
 * @param params 检查参数
 * @returns 策略检查结果
 * 
 * Requirements: 5.1
 */
export function checkDmPolicy(params: {
  dmPolicy: "open" | "pairing" | "allowlist";
  senderId: string;
  allowFrom?: string[];
}): PolicyCheckResult {
  const { dmPolicy, senderId, allowFrom = [] } = params;
  
  switch (dmPolicy) {
    case "open":
      // 开放策略：允许所有单聊消息
      return { allowed: true };
    
    case "pairing":
      // 配对策略：允许所有单聊消息（配对逻辑由上层处理）
      return { allowed: true };
    
    case "allowlist":
      // 白名单策略：仅允许 allowFrom 中的发送者
      if (allowFrom.includes(senderId)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `sender ${senderId} not in DM allowlist`,
      };
    
    default:
      return { allowed: true };
  }
}

/**
 * 检查群聊策略
 * 
 * @param params 检查参数
 * @returns 策略检查结果
 * 
 * Requirements: 5.2, 5.3, 5.4
 */
export function checkGroupPolicy(params: {
  groupPolicy: "open" | "allowlist" | "disabled";
  conversationId: string;
  groupAllowFrom?: string[];
  requireMention: boolean;
  mentionedBot: boolean;
}): PolicyCheckResult {
  const { groupPolicy, conversationId, groupAllowFrom = [], requireMention, mentionedBot } = params;
  
  // 首先检查群聊策略
  switch (groupPolicy) {
    case "disabled":
      // 禁用策略：拒绝所有群聊消息
      return {
        allowed: false,
        reason: "group messages disabled",
      };
    
    case "allowlist":
      // 白名单策略：仅允许 groupAllowFrom 中的群组
      if (!groupAllowFrom.includes(conversationId)) {
        return {
          allowed: false,
          reason: `group ${conversationId} not in allowlist`,
        };
      }
      break;
    
    case "open":
      // 开放策略：允许所有群聊
      break;
    
    default:
      break;
  }
  
  // 然后检查 @提及要求
  if (requireMention && !mentionedBot) {
    return {
      allowed: false,
      reason: "message did not mention bot",
    };
  }
  
  return { allowed: true };
}


/**
 * 入站消息上下文
 * 用于传递给 Moltbot 核心的标准化上下文
 */
export interface InboundContext {
  /** 消息正文 */
  Body: string;
  /** 原始消息正文 */
  RawBody: string;
  /** 命令正文 */
  CommandBody: string;
  /** 发送方标识 */
  From: string;
  /** 接收方标识 */
  To: string;
  /** 会话键 */
  SessionKey: string;
  /** 账户 ID */
  AccountId: string;
  /** 聊天类型 */
  ChatType: "direct" | "group";
  /** 群组主题（群聊时） */
  GroupSubject?: string;
  /** 发送者名称 */
  SenderName?: string;
  /** 发送者 ID */
  SenderId: string;
  /** 渠道提供者 */
  Provider: "dingtalk";
  /** 消息 ID */
  MessageSid: string;
  /** 时间戳 */
  Timestamp: number;
  /** 是否被 @提及 */
  WasMentioned: boolean;
  /** 命令是否已授权 */
  CommandAuthorized: boolean;
  /** 原始渠道 */
  OriginatingChannel: "dingtalk";
  /** 原始接收方 */
  OriginatingTo: string;
}

/**
 * 构建入站消息上下文
 * 
 * @param ctx 解析后的消息上下文
 * @param sessionKey 会话键
 * @param accountId 账户 ID
 * @returns 入站消息上下文
 * 
 * Requirements: 6.4
 */
export function buildInboundContext(
  ctx: DingtalkMessageContext,
  sessionKey: string,
  accountId: string,
): InboundContext {
  const isGroup = ctx.chatType === "group";
  
  // 构建 From 和 To 标识
  const from = isGroup
    ? `dingtalk:group:${ctx.conversationId}`
    : `dingtalk:${ctx.senderId}`;
  const to = isGroup
    ? `chat:${ctx.conversationId}`
    : `user:${ctx.senderId}`;
  
  return {
    Body: ctx.content,
    RawBody: ctx.content,
    CommandBody: ctx.content,
    From: from,
    To: to,
    SessionKey: sessionKey,
    AccountId: accountId,
    ChatType: ctx.chatType,
    GroupSubject: isGroup ? ctx.conversationId : undefined,
    SenderName: ctx.senderNick,
    SenderId: ctx.senderId,
    Provider: "dingtalk",
    MessageSid: ctx.messageId,
    Timestamp: Date.now(),
    WasMentioned: ctx.mentionedBot,
    CommandAuthorized: true,
    OriginatingChannel: "dingtalk",
    OriginatingTo: to,
  };
}

/**
 * 处理钉钉入站消息
 * 
 * 集成消息解析、策略检查和 Agent 分发
 * 
 * @param params 处理参数
 * @returns Promise<void>
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export async function handleDingtalkMessage(params: {
  cfg: unknown; // ClawdbotConfig
  raw: DingtalkRawMessage;
  accountId?: string;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}): Promise<void> {
  const {
    cfg,
    raw,
    accountId = "default",
  } = params;
  
  // 创建日志器
  const logger: Logger = createLogger("dingtalk", {
    log: params.log,
    error: params.error,
  });
  
  // 解析消息
  const ctx = parseDingtalkMessage(raw);
  const isGroup = ctx.chatType === "group";
  
  logger.debug(`received message from ${ctx.senderId} in ${ctx.conversationId} (${ctx.chatType})`);
  
  // 获取钉钉配置
  const dingtalkCfg = (cfg as Record<string, unknown>)?.channels as Record<string, unknown> | undefined;
  const channelCfg = dingtalkCfg?.dingtalk as DingtalkConfig | undefined;
  
  // 策略检查
  if (isGroup) {
    const groupPolicy = channelCfg?.groupPolicy ?? "allowlist";
    const groupAllowFrom = channelCfg?.groupAllowFrom ?? [];
    const requireMention = channelCfg?.requireMention ?? true;
    
    const policyResult = checkGroupPolicy({
      groupPolicy,
      conversationId: ctx.conversationId,
      groupAllowFrom,
      requireMention,
      mentionedBot: ctx.mentionedBot,
    });
    
    if (!policyResult.allowed) {
      logger.debug(`policy rejected: ${policyResult.reason}`);
      return;
    }
  } else {
    const dmPolicy = channelCfg?.dmPolicy ?? "pairing";
    const allowFrom = channelCfg?.allowFrom ?? [];
    
    const policyResult = checkDmPolicy({
      dmPolicy,
      senderId: ctx.senderId,
      allowFrom,
    });
    
    if (!policyResult.allowed) {
      logger.debug(`policy rejected: ${policyResult.reason}`);
      return;
    }
  }
  
  // 检查运行时是否已初始化
  if (!isDingtalkRuntimeInitialized()) {
    logger.warn("runtime not initialized, skipping dispatch");
    return;
  }
  
  try {
    // 获取完整的 Moltbot 运行时（包含 core API）
    const core = getDingtalkRuntime();
    
    // 检查必要的 API 是否存在
    if (!core.channel?.routing?.resolveAgentRoute) {
      logger.debug("core.channel.routing.resolveAgentRoute not available, skipping dispatch");
      return;
    }
    
    if (!core.channel?.reply?.dispatchReplyFromConfig) {
      logger.debug("core.channel.reply.dispatchReplyFromConfig not available, skipping dispatch");
      return;
    }

    if (!core.channel?.reply?.createReplyDispatcher && !core.channel?.reply?.createReplyDispatcherWithTyping) {
      logger.debug("core.channel.reply dispatcher factory not available, skipping dispatch");
      return;
    }
    
    // 解析路由
    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "dingtalk",
      peer: {
        kind: isGroup ? "group" : "dm",
        id: isGroup ? ctx.conversationId : ctx.senderId,
      },
    });
    
    // 构建入站上下文
    const inboundCtx = buildInboundContext(ctx, route.sessionKey, route.accountId);

    // 如果有 finalizeInboundContext，使用它
    const finalCtx = core.channel.reply.finalizeInboundContext
      ? core.channel.reply.finalizeInboundContext(inboundCtx)
      : inboundCtx;

    const dingtalkCfg = channelCfg;
    if (!dingtalkCfg) {
      logger.warn("channel config missing, skipping dispatch");
      return;
    }

    const textApi = core.channel?.text;
    
    const textChunkLimit =
      textApi?.resolveTextChunkLimit?.({
        cfg,
        channel: "dingtalk",
        defaultLimit: dingtalkCfg.textChunkLimit ?? 4000,
      }) ?? (dingtalkCfg.textChunkLimit ?? 4000);
    const chunkMode = textApi?.resolveChunkMode?.(cfg, "dingtalk");
    // 钉钉不支持 Markdown 表格和代码块，强制使用 bullets 模式转换为列表
    const tableMode = "bullets";

    const deliver = async (payload: { text?: string; mediaUrl?: string; mediaUrls?: string[] }) => {
      const targetId = isGroup ? ctx.conversationId : ctx.senderId;
      const chatType = isGroup ? "group" : "direct";

      const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
      if (mediaUrls.length > 0) {
        for (const mediaUrl of mediaUrls) {
          await sendMediaDingtalk({
            cfg: dingtalkCfg,
            to: targetId,
            mediaUrl,
            chatType,
          });
        }
        return;
      }

      const rawText = payload.text ?? "";
      if (!rawText.trim()) return;
      
      // 转换表格：使用 Moltbot 核心的转换，不可用时直接用原始文本
      const converted = textApi?.convertMarkdownTables
        ? textApi.convertMarkdownTables(rawText, tableMode)
        : rawText;
      
      const chunks =
        textApi?.chunkTextWithMode && typeof textChunkLimit === "number" && textChunkLimit > 0
          ? textApi.chunkTextWithMode(converted, textChunkLimit, chunkMode)
          : [converted];

      for (const chunk of chunks) {
        await sendMessageDingtalk({
          cfg: dingtalkCfg,
          to: targetId,
          text: chunk,
          chatType,
        });
      }
    };

    const humanDelay = core.channel.reply.resolveHumanDelayConfig
      ? core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId)
      : undefined;

    const dispatcherResult = core.channel.reply.createReplyDispatcherWithTyping
      ? core.channel.reply.createReplyDispatcherWithTyping({
          deliver: async (payload: unknown) => {
            await deliver(payload as { text?: string; mediaUrl?: string; mediaUrls?: string[] });
          },
          humanDelay,
          onError: (err: unknown, info: { kind: string }) => {
            logger.error(`${info.kind} reply failed: ${String(err)}`);
          },
        })
      : {
          dispatcher: core.channel.reply.createReplyDispatcher?.({
            deliver: async (payload: unknown) => {
              await deliver(payload as { text?: string; mediaUrl?: string; mediaUrls?: string[] });
            },
            humanDelay,
            onError: (err: unknown, info: { kind: string }) => {
              logger.error(`${info.kind} reply failed: ${String(err)}`);
            },
          }),
          replyOptions: {},
          markDispatchIdle: () => undefined,
        };

    if (!dispatcherResult.dispatcher) {
      logger.debug("dispatcher not available, skipping dispatch");
      return;
    }

    logger.debug(`dispatching to agent (session=${route.sessionKey})`);

    // 分发消息
    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: finalCtx,
      cfg,
      dispatcher: dispatcherResult.dispatcher,
      replyOptions: dispatcherResult.replyOptions,
    });

    dispatcherResult.markDispatchIdle?.();

    logger.debug(`dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
  } catch (err) {
    logger.error(`failed to dispatch message: ${String(err)}`);
  }
}
