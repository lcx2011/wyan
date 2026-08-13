import { resolve } from 'node:path';
import type { FastifyServerOptions } from 'fastify';

/**
 * 统一日志配置：Fastify 的 logger 选项（含级别、服务名、落盘 transport、health 降噪）。
 * 全部日志（请求日志、业务日志、启动日志）共用同一条管道，保证格式一致。
 *
 * - 级别：LOG_LEVEL 环境变量，生产默认 info，开发默认 debug。
 * - 落盘：LOG_FILE 指定日志文件；生产默认写到 data/logs/server.log
 *   （pino-roll 按天轮转，保留最近 7 个轮转文件 + 活动文件），开发默认仅 stdout。
 *   LOG_FILE='-' 或空字符串可强制仅 stdout。
 * - 健康检查降噪由 buildApp 的 disableRequestLogging 顶层选项承担（见 server/app.ts）。
 */
export const LOG_LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function defaultLogFile(): string | undefined {
  if (process.env.LOG_FILE !== undefined) {
    const value = process.env.LOG_FILE.trim();
    return value === '' || value === '-' ? undefined : resolve(value);
  }
  return process.env.NODE_ENV === 'production'
    ? resolve(process.cwd(), 'data', 'logs', 'server.log')
    : undefined;
}

export function loggerOptions(): NonNullable<FastifyServerOptions['logger']> {
  const logFile = defaultLogFile();
  const options: NonNullable<FastifyServerOptions['logger']> = {
    level: LOG_LEVEL,
    base: { service: 'wenyan-api' },
  };
  if (!logFile) return options;
  return {
    ...options,
    transport: {
      target: 'pino-roll',
      options: {
        file: logFile,
        frequency: 'daily',
        limit: { count: 7 },
        mkdir: true,
      },
    },
  };
}
