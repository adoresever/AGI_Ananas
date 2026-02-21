/**
 * 钉钉插件日志工具
 *
 * 提供分级日志功能:
 * - info: 关键业务日志（默认显示）
 * - debug: 调试日志（带 [DEBUG] 标记）
 * - error: 错误日志
 * - warn: 警告日志
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * 创建带前缀的日志器
 *
 * @param prefix 日志前缀（如 "dingtalk"）
 * @param opts 可选的日志输出函数
 * @returns Logger 实例
 */
export function createLogger(
  prefix: string,
  opts?: {
    log?: (msg: string) => void;
    error?: (msg: string) => void;
  }
): Logger {
  const logFn = opts?.log ?? console.log;
  const errorFn = opts?.error ?? console.error;

  return {
    debug: (msg: string) => logFn(`[${prefix}] [DEBUG] ${msg}`),
    info: (msg: string) => logFn(`[${prefix}] ${msg}`),
    warn: (msg: string) => logFn(`[${prefix}] [WARN] ${msg}`),
    error: (msg: string) => errorFn(`[${prefix}] [ERROR] ${msg}`),
  };
}

/**
 * 默认钉钉日志器
 */
export const dingtalkLogger = createLogger("dingtalk");
