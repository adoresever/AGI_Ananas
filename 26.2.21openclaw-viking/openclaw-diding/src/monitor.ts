/**
 * 钉钉 Stream 连接管理
 * 
 * 使用 dingtalk-stream SDK 建立持久连接接收消息
 * 
 */

import { DWClient, TOPIC_ROBOT } from "dingtalk-stream";
import { createDingtalkClientFromConfig } from "./client.js";
import { handleDingtalkMessage } from "./bot.js";
import type { DingtalkConfig } from "./config.js";
import type { DingtalkRawMessage } from "./types.js";
import { createLogger, type Logger } from "./logger.js";

/**
 * Monitor 配置选项
 */
export interface MonitorDingtalkOpts {
  /** 钉钉渠道配置 */
  config?: {
    channels?: {
      dingtalk?: DingtalkConfig;
    };
  };
  /** 运行时环境 */
  runtime?: {
    log?: (msg: string) => void;
    error?: (msg: string) => void;
  };
  /** 中断信号，用于优雅关闭 */
  abortSignal?: AbortSignal;
  /** 账户 ID */
  accountId?: string;
}

/** 当前活跃的 Stream 客户端 */
let currentClient: DWClient | null = null;

/** 当前活跃连接的账户 ID */
let currentAccountId: string | null = null;

/** 当前 Monitor Promise */
let currentPromise: Promise<void> | null = null;

/** 停止当前 Monitor */
let currentStop: (() => void) | null = null;

/**
 * 启动钉钉 Stream 连接监控
 * 
 * 使用 DWClient 建立 Stream 连接，注册 TOPIC_ROBOT 回调处理消息。
 * 支持 abortSignal 进行优雅关闭。
 * 
 * @param opts 监控配置选项
 * @returns Promise<void> 连接关闭时 resolve
 * @throws Error 如果凭证未配置
 */
export async function monitorDingtalkProvider(opts: MonitorDingtalkOpts = {}): Promise<void> {
  const { config, runtime, abortSignal, accountId = "default" } = opts;
  
  const logger: Logger = createLogger("dingtalk", {
    log: runtime?.log,
    error: runtime?.error,
  });
  
  // Single-account: only one active connection allowed.
  if (currentClient) {
    if (currentAccountId && currentAccountId !== accountId) {
      throw new Error(`DingTalk already running for account ${currentAccountId}`);
    }
    logger.debug(`existing connection for account ${accountId} is active, reusing monitor`);
    if (currentPromise) {
      return currentPromise;
    }
    throw new Error("DingTalk monitor state invalid: active client without promise");
  }

  // Get DingTalk config.
  const dingtalkCfg = config?.channels?.dingtalk;
  if (!dingtalkCfg) {
    throw new Error("DingTalk configuration not found");
  }

  // Create Stream client.
  let client: DWClient;
  try {
    client = createDingtalkClientFromConfig(dingtalkCfg);
  } catch (err) {
    logger.error(`failed to create client: ${String(err)}`);
    throw err;
  }

  currentClient = client;
  currentAccountId = accountId;

  logger.info(`starting Stream connection for account ${accountId}...`);

  currentPromise = new Promise<void>((resolve, reject) => {
    let stopped = false;

    // Cleanup state and disconnect the client.
    const cleanup = () => {
      if (currentClient === client) {
        currentClient = null;
        currentAccountId = null;
        currentStop = null;
        currentPromise = null;
      }
      try {
        client.disconnect();
      } catch (err) {
        logger.error(`failed to disconnect client: ${String(err)}`);
      }
    };

    const finalizeResolve = () => {
      if (stopped) return;
      stopped = true;
      abortSignal?.removeEventListener("abort", handleAbort);
      cleanup();
      resolve();
    };

    const finalizeReject = (err: unknown) => {
      if (stopped) return;
      stopped = true;
      abortSignal?.removeEventListener("abort", handleAbort);
      cleanup();
      reject(err);
    };

    // Handle abort signal.
    const handleAbort = () => {
      logger.info("abort signal received, stopping Stream client");
      finalizeResolve();
    };

    // Expose a stop hook for manual shutdown.
    currentStop = () => {
      logger.info("stop requested, stopping Stream client");
      finalizeResolve();
    };

    // If already aborted, resolve immediately.
    if (abortSignal?.aborted) {
      finalizeResolve();
      return;
    }

    // Register abort handler.
    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    try {
      // Register TOPIC_ROBOT callback.
      client.registerCallbackListener(TOPIC_ROBOT, (res) => {
        const streamMessageId = res?.headers?.messageId;
        
        // 立即显式 ACK，防止钉钉重发消息
        if (streamMessageId) {
          try {
            client.socketCallBackResponse(streamMessageId, { success: true });
          } catch (ackErr) {
            logger.error(`failed to ACK message ${streamMessageId}: ${String(ackErr)}`);
          }
        }
        
        try {
          // Parse message payload.
          const rawMessage = JSON.parse(res.data) as DingtalkRawMessage;
          if (streamMessageId) {
            rawMessage.streamMessageId = streamMessageId;
          }

          // 关键业务日志：收到消息
          const content =
            (rawMessage.msgtype === "text" ? rawMessage.text?.content : undefined) ??
            rawMessage.content?.recognition ??
            "";
          const contentTrimmed = content.trim();
          const senderName = rawMessage.senderNick ?? rawMessage.senderId;
          const textPreview = contentTrimmed.slice(0, 50);
          
          logger.info(`Inbound: from=${senderName} text="${textPreview}${contentTrimmed.length > 50 ? "..." : ""}"`);
          logger.debug(`streamId=${streamMessageId ?? "none"} convo=${rawMessage.conversationId}`);

          // 异步处理消息（ACK 已在前面发送）
          void handleDingtalkMessage({
            cfg: config,
            raw: rawMessage,
            accountId,
            log: (msg: string) => logger.info(msg.replace(/^\[dingtalk\]\s*/, "")),
            error: (msg: string) => logger.error(msg.replace(/^\[dingtalk\]\s*/, "")),
          }).catch((err) => {
            logger.error(`error handling message: ${String(err)}`);
          });
        } catch (err) {
          logger.error(`error parsing message: ${String(err)}`);
        }
      });

      // Start Stream connection.
      client.connect();

      logger.info("Stream client connected");
    } catch (err) {
      logger.error(`failed to start Stream connection: ${String(err)}`);
      finalizeReject(err);
    }
  });

  return currentPromise;
}

/**
 * 停止钉钉 Monitor
 */
export function stopDingtalkMonitor(): void {
  if (currentStop) {
    currentStop();
    return;
  }
  if (currentClient) {
    try {
      currentClient.disconnect();
    } catch (err) {
      console.error(`[dingtalk] failed to disconnect client: ${String(err)}`);
    } finally {
      currentClient = null;
      currentAccountId = null;
      currentPromise = null;
      currentStop = null;
    }
  }
}

/**
 * 获取当前 Stream 客户端状态
 */
export function isMonitorActive(): boolean {
  return currentClient !== null;
}

/**
 * 获取当前活跃连接的账户 ID
 */
export function getCurrentAccountId(): string | null {
  return currentAccountId;
}
