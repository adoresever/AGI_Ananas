// 钉钉类型定义

import type { DingtalkConfig } from "./config.js";

export type { DingtalkConfig };

/**
 * 钉钉原始消息结构
 * 从 Stream SDK 回调接收的原始消息格式
 */
export interface DingtalkRawMessage {
  /** 发送者 ID */
  senderId: string;
  /** Stream 消息 ID（从 headers.messageId 透传） */
  streamMessageId?: string;
  /** 发送者 staffId（部分事件提供） */
  senderStaffId?: string;
  /** 发送者 userId（部分事件提供） */
  senderUserId?: string;
  /** 发送者 userid（部分事件提供） */
  senderUserid?: string;
  /** 发送者昵称 */
  senderNick: string;
  /** 会话类型: "1" = 单聊, "2" = 群聊 */
  conversationType: "1" | "2";
  /** 会话 ID */
  conversationId: string;
  /** 消息类型: text, audio, image, file 等 */
  msgtype: string;
  /** 文本消息内容 */
  text?: { content: string };
  /** 富媒体消息内容 */
  content?: {
    /** 下载码 */
    downloadCode?: string;
    /** 音频时长（秒） */
    duration?: number;
    /** 语音识别文本 */
    recognition?: string;
    /** 文件名 */
    fileName?: string;
  };
  /** @提及的用户列表 */
  atUsers?: Array<{ dingtalkId: string }>;
  /** 机器人 Code (clientId) */
  robotCode?: string;
}

/**
 * 解析后的消息上下文
 * 用于内部处理的标准化消息格式
 */
export interface DingtalkMessageContext {
  /** 会话 ID */
  conversationId: string;
  /** 消息 ID */
  messageId: string;
  /** 发送者 ID */
  senderId: string;
  /** 发送者昵称 */
  senderNick?: string;
  /** 聊天类型: direct = 单聊, group = 群聊 */
  chatType: "direct" | "group";
  /** 消息内容 */
  content: string;
  /** 内容类型 */
  contentType: string;
  /** 是否 @提及了机器人 */
  mentionedBot: boolean;
  /** 机器人 Code */
  robotCode?: string;
}

/**
 * 发送消息结果
 */
export interface DingtalkSendResult {
  /** 消息 ID */
  messageId: string;
  /** 会话 ID */
  conversationId: string;
}

/**
 * 解析后的钉钉账户配置
 * 用于 ChannelPlugin config 适配器
 */
export interface ResolvedDingtalkAccount {
  /** 账户 ID */
  accountId: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否已配置（有凭证） */
  configured: boolean;
  /** 客户端 ID */
  clientId?: string;
}
