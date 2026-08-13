import Fastify, { LogController, type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { passageRegistry } from '../src/data/passages/index.js';
import { ARCHIVE_NAMESPACES, isArchiveNamespace, type NamespaceRoots, type ReviewSessionAttemptResult } from './types.js';
import { ArchiveDatabase } from './db.js';

interface AppOptions {
  dbPath?: string;
  staticDir?: string;
  logger?: FastifyServerOptions['logger'];
}

/** 超过该耗时（毫秒）的操作用 warn 记录，用于发现事件循环阻塞。 */
const SLOW_MS = 500;

/** 错误码：与响应体 error 字段一一对应，便于日志与客户端侧关联。 */
const ERROR_CODES: Record<string, string> = {
  'unknown archive namespace': 'UNKNOWN_NAMESPACE',
  'expected schemaVersion and data': 'INVALID_ARCHIVE_BODY',
  'invalid passageId': 'INVALID_PASSAGE_ID',
  'invalid review attempt': 'INVALID_REVIEW_ATTEMPT',
  'missing session id': 'REVIEW_SESSION_MISSING',
  'review session not found': 'REVIEW_SESSION_NOT_FOUND',
  'review session is not active': 'REVIEW_SESSION_INACTIVE',
  'review session is not complete': 'REVIEW_SESSION_INCOMPLETE',
  'review item is not current': 'REVIEW_ITEM_NOT_CURRENT',
};

function errorCode(message: string): string {
  return ERROR_CODES[message] ?? 'REQUEST_INVALID';
}

function bodyRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** 结构化耗时日志：慢操作（>SLOW_MS）升级为 warn。 */
function timedLog(request: FastifyRequest, event: string, startedAt: number, extra: Record<string, unknown> = {}): void {
  const durationMs = Date.now() - startedAt;
  const fields = { event, durationMs, ...extra };
  if (durationMs > SLOW_MS) request.log.warn({ ...fields, slow: true }, 'slow operation');
  else request.log.info(fields, event);
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 10 * 1024 * 1024,
    // 健康检查探活高频访问，按请求抑制其访问日志（LogController，fastify@6 将移除顶层 disableRequestLogging）。
    logController: new LogController({
      disableRequestLogging: (req) => req.url === '/api/health',
    }),
  });
  const database = new ArchiveDatabase(options.dbPath);
  app.decorate('archiveDatabase', database);

  const builtins = passageRegistry.list()
    .map((meta) => passageRegistry.get(meta.id))
    .filter((passage): passage is NonNullable<typeof passage> => Boolean(passage));
  database.seedPassages(builtins);

  // 把 Fastify 内部的 request.id 透出为响应头，前端报错时可凭同一 ID 关联服务端日志。
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // 统一错误出口：5xx 记录完整错误（含 stack），4xx 只记录概要；响应体带错误码。
  app.setErrorHandler((error, request, reply) => {
    if (reply.statusCode >= 500) request.log.error({ err: error, event: 'request.failed' }, 'unhandled request error');
    else request.log.warn({ err: error, event: 'request.rejected' }, 'request rejected');
    if (reply.sent) return;
    void reply.code(500).send({ error: 'internal error', code: 'INTERNAL' });
  });

  app.addHook('onClose', async () => database.close());

  app.get('/api/health', async () => ({ ok: true, service: 'wenyan-api' }));

  app.get('/api/archive', async (request) => {
    const startedAt = Date.now();
    const result = database.getArchive();
    timedLog(request, 'archive.get', startedAt);
    return result;
  });

  app.post('/api/archive/import', async (request, reply) => {
    const input = bodyRecord(request.body);
    const raw = bodyRecord(input.namespaces);
    const namespaces: NamespaceRoots = {};
    for (const name of ARCHIVE_NAMESPACES) {
      const value = bodyRecord(raw[name]);
      if (value.data !== undefined && typeof value.schemaVersion === 'number') {
        namespaces[name] = { schemaVersion: value.schemaVersion, data: value.data };
      }
    }
    const startedAt = Date.now();
    try {
      const result = database.importArchive(namespaces);
      // 只记 namespace 清单与耗时，不记录 body（用户完整存档，体积大且含隐私）。
      timedLog(request, 'archive.import', startedAt, { namespaces: Object.keys(namespaces) });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error, event: 'archive.import', namespaces: Object.keys(namespaces) }, 'archive import failed');
      throw error;
    }
  });

  app.put('/api/archive/:namespace', async (request, reply) => {
    const namespace = (request.params as { namespace?: string }).namespace ?? '';
    if (!isArchiveNamespace(namespace)) {
      request.log.warn({ event: 'archive.put', code: ERROR_CODES['unknown archive namespace'], namespace }, 'rejected: unknown namespace');
      return reply.code(400).send({ error: 'unknown archive namespace', code: 'UNKNOWN_NAMESPACE' });
    }
    const body = bodyRecord(request.body);
    if (typeof body.schemaVersion !== 'number' || body.data === undefined) {
      request.log.warn({ event: 'archive.put', code: ERROR_CODES['expected schemaVersion and data'], namespace }, 'rejected: invalid archive body');
      return reply.code(400).send({ error: 'expected schemaVersion and data', code: 'INVALID_ARCHIVE_BODY' });
    }
    const startedAt = Date.now();
    const result = database.putNamespace(namespace, { schemaVersion: body.schemaVersion, data: body.data });
    timedLog(request, 'archive.put', startedAt, { namespace });
    return reply.send(result);
  });

  app.get('/api/content/passages', async (request) => {
    const startedAt = Date.now();
    const result = { passages: database.listPassages() };
    timedLog(request, 'content.passages', startedAt);
    return result;
  });

  // gushiwenku 反向代理：开发时由 Vite proxy（vite.config.ts）承担，生产环境本服务托管前端时
  // 必须在此转发，否则 /gushiwen/* 会落入 SPA fallback 返回 index.html，在线搜索降级为仅内置篇目。
  const gushiwenBase = process.env.GUSHIWEN_BASE ?? 'https://www.gushiwenku.cn';
  app.all('/gushiwen/*', async (request, reply) => {
    const rawUrl = request.raw.url ?? request.url;
    const target = new URL(rawUrl.replace(/^\/gushiwen/, ''), gushiwenBase);
    const method = request.method;
    const headers: Record<string, string> = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    };
    const contentType = request.headers['content-type'];
    if (typeof contentType === 'string' && contentType.length > 0) headers['content-type'] = contentType;
    const controller = new AbortController();
    // 与前端 fetchWithTimeout（search 8s / getPoem 10s）对齐，避免前端 abort 后服务端仍悬挂
    const timer = setTimeout(() => controller.abort(), 10000);
    const startedAt = Date.now();
    try {
      const body = method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(request.body ?? {});
      const upstream = await fetch(target, { method, headers, body, signal: controller.signal });
      const text = await upstream.text();
      const upstreamType = upstream.headers.get('content-type');
      timedLog(request, 'gushiwen.proxy', startedAt, { upstream: target.toString(), status: upstream.status, bytes: text.length });
      return reply.code(upstream.status).type(upstreamType ?? 'application/json').send(text);
    } catch (error) {
      request.log.error({ err: error, event: 'gushiwen.proxy', url: target.toString() }, 'gushiwen upstream failed');
      return reply.code(502).send({ error: 'gushiwen upstream unavailable', code: 'UPSTREAM_UNAVAILABLE' });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/review/sessions', async (request, reply) => {
    const body = bodyRecord(request.body);
    const passageId = body.passageId;
    if (passageId !== undefined && (typeof passageId !== 'string' || passageId.trim() === '')) {
      request.log.warn({ event: 'review.session', code: 'INVALID_PASSAGE_ID' }, 'rejected: invalid passageId');
      return reply.code(400).send({ error: 'invalid passageId', code: 'INVALID_PASSAGE_ID' });
    }
    const startedAt = Date.now();
    const result = database.createOrResumeReviewSession(typeof passageId === 'string' ? passageId : undefined);
    timedLog(request, 'review.session', startedAt, { sessionId: result.session.id, source: result.source });
    return { session: result.session, source: result.source };
  });

  app.post('/api/review/reset', async (request, reply) => {
    const body = bodyRecord(request.body);
    if (typeof body.passageId !== 'string' || body.passageId.trim() === '') {
      request.log.warn({ event: 'review.reset', code: 'INVALID_PASSAGE_ID' }, 'rejected: invalid passageId');
      return reply.code(400).send({ error: 'invalid passageId', code: 'INVALID_PASSAGE_ID' });
    }
    const startedAt = Date.now();
    const result = database.resetPassageData(body.passageId);
    timedLog(request, 'review.reset', startedAt, { passageId: body.passageId });
    return reply.send(result);
  });

  app.get('/api/review/sessions/active', async (request) => {
    const startedAt = Date.now();
    const session = database.getActiveReviewSession();
    timedLog(request, 'review.session.active', startedAt, { sessionId: session?.id ?? null });
    return { session };
  });

  app.post('/api/review/sessions/:sessionId/attempts', async (request, reply) => {
    const params = request.params as { sessionId?: string };
    const body = bodyRecord(request.body);
    if (!params.sessionId || typeof body.operationId !== 'string' || typeof body.itemId !== 'string' || (body.result !== 'pass' && body.result !== 'miss')) {
      request.log.warn({ event: 'review.attempt', code: 'INVALID_REVIEW_ATTEMPT', sessionId: params.sessionId ?? null }, 'rejected: invalid review attempt');
      return reply.code(400).send({ error: 'invalid review attempt', code: 'INVALID_REVIEW_ATTEMPT' });
    }
    const input: ReviewSessionAttemptResult = {
      operationId: body.operationId,
      itemId: body.itemId,
      result: body.result,
      occurredAt: typeof body.occurredAt === 'string' ? body.occurredAt : undefined,
    };
    const startedAt = Date.now();
    try {
      const result = database.applyReviewAttempt(params.sessionId, input);
      timedLog(request, 'review.attempt', startedAt, { sessionId: params.sessionId, itemId: input.itemId, result: input.result, source: result.source });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'review attempt failed';
      const status = message.includes('not found') ? 404 : message.includes('not current') ? 409 : 400;
      const code = errorCode(message);
      request.log.warn({ err: error, event: 'review.attempt', sessionId: params.sessionId, itemId: input.itemId, code, status }, 'review attempt rejected');
      return reply.code(status).send({ error: message, code });
    }
  });

  app.post('/api/review/sessions/:sessionId/complete', async (request, reply) => {
    const id = (request.params as { sessionId?: string }).sessionId;
    if (!id) {
      request.log.warn({ event: 'review.complete', code: 'REVIEW_SESSION_MISSING' }, 'rejected: missing session id');
      return reply.code(400).send({ error: 'missing session id', code: 'REVIEW_SESSION_MISSING' });
    }
    const startedAt = Date.now();
    try {
      const session = database.completeReviewSession(id);
      timedLog(request, 'review.complete', startedAt, { sessionId: id });
      return reply.send({ session });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'cannot complete session';
      const code = errorCode(message);
      request.log.warn({ err: error, event: 'review.complete', sessionId: id, code }, 'review complete rejected');
      return reply.code(400).send({ error: message, code });
    }
  });

  const staticDir = options.staticDir ?? resolve(process.cwd(), 'dist');
  if (existsSync(staticDir)) {
    void app.register(fastifyStatic, { root: staticDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        request.log.warn({ event: 'route.not_found', url: request.raw.url }, 'unknown api route');
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // 生命周期日志：启动时记录版本、DB 路径、内置篇目数，便于排查"跑的哪份代码/哪个存档"。
  app.addHook('onReady', async () => {
    app.log.info({
      event: 'app.boot',
      version: process.env.npm_package_version ?? 'unknown',
      dbPath: options.dbPath ?? 'default',
      builtinPassages: builtins.length,
      node: process.version,
    }, 'wenyan-api booted');
  });

  return app;
}
