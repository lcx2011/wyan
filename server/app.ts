import Fastify, { LogController, type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  isValidPassword,
  isValidUsername,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from './auth.js';
import { passageRegistry } from '../src/data/passages/index.js';
import { ARCHIVE_NAMESPACES, isArchiveNamespace, type NamespaceRoots, type ReviewSessionAttemptResult } from './types.js';
import { ArchiveDatabase } from './db.js';

interface AppOptions {
  dbPath?: string;
  staticDir?: string;
  logger?: FastifyServerOptions['logger'];
  authEnabled?: boolean;
}

const SLOW_MS = 500;
const GUSHIWEN_ORIGIN = new URL('https://www.gushiwenku.cn');
const GUSHIWEN_USER_AGENT = 'Mozilla/5.0 (compatible; Wenyan/1.0; +https://www.gushiwenku.cn)';
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;

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

function timedLog(request: FastifyRequest, event: string, startedAt: number, extra: Record<string, unknown> = {}): void {
  const durationMs = Date.now() - startedAt;
  const fields = { event, durationMs, ...extra };
  if (durationMs > SLOW_MS) request.log.warn({ ...fields, slow: true }, 'slow operation');
  else request.log.info(fields, event);
}

function publicRoute(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/auth/');
}

function proxyPath(request: FastifyRequest): string | null {
  const rawPath = (request.raw.url ?? request.url).split('?', 1)[0];
  if (!rawPath.startsWith('/gushiwen/')) return null;
  const rawSegments = rawPath.slice('/gushiwen/'.length).split('/').filter(Boolean);
  if (rawSegments.length === 2 && rawSegments[0] === 'ajax' && rawSegments[1] === 'search') return '/ajax/search';
  if (rawSegments.length >= 3 && rawSegments[0] === 'ajax' && rawSegments[1] === 'getPoem') {
    let poemId: string;
    try {
      poemId = decodeURIComponent(rawSegments.slice(2).join('/'));
    } catch {
      return null;
    }
    if (!/^[A-Za-z0-9_/-]+$/u.test(poemId) || poemId.startsWith('/') || poemId.endsWith('/')) return null;
    return `/ajax/getPoem/${encodeURIComponent(poemId)}`;
  }
  return null;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 10 * 1024 * 1024,
    logController: new LogController({
      disableRequestLogging: (req) => req.url === '/api/health',
    }),
  });
  const database = new ArchiveDatabase(options.dbPath);
  const authEnabled = options.authEnabled ?? process.env.NODE_ENV !== 'test';
  const testUser = authEnabled ? null : database.ensureTestUser();

  app.register(fastifyCookie);
  app.decorateRequest('authUser', null);
  app.decorate('archiveDatabase', database);

  const builtins = passageRegistry.list()
    .map((meta) => passageRegistry.get(meta.id))
    .filter((passage): passage is NonNullable<typeof passage> => Boolean(passage));
  database.seedPassages(builtins);

  app.addHook('onRequest', async (request) => {
    if (!authEnabled) {
      request.authUser = testUser;
      return;
    }
    const token = request.cookies[SESSION_COOKIE];
    request.authUser = token ? database.getUserBySessionToken(hashSessionToken(token)) : null;
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!authEnabled) return;
    const path = request.url.split('?', 1)[0];
    if (publicRoute(path)) return;
    if (path.startsWith('/api/') || path.startsWith('/gushiwen/')) {
      if (!request.authUser) return reply.code(401).send({ error: '请先登录', code: 'AUTH_REQUIRED' });
    }
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    if (reply.statusCode >= 500) request.log.error({ err: error, event: 'request.failed' }, 'unhandled request error');
    else request.log.warn({ err: error, event: 'request.rejected' }, 'request rejected');
    if (reply.sent) return;
    void reply.code(500).send({ error: 'internal error', code: 'INTERNAL' });
  });

  app.addHook('onClose', async () => database.close());

  app.get('/api/health', async () => ({ ok: true, service: 'wenyan-api' }));

  app.get('/api/auth/me', async (request) => ({ user: request.authUser }));

  app.post('/api/auth/register', async (request, reply) => {
    const body = bodyRecord(request.body);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!isValidUsername(username)) {
      return reply.code(400).send({ error: '用户名需为 2-32 个字母、数字、汉字、下划线或短横线', code: 'INVALID_USERNAME' });
    }
    if (!isValidPassword(password)) {
      return reply.code(400).send({ error: '密码长度需为 8-128 位', code: 'INVALID_PASSWORD' });
    }
    try {
      const user = database.createUser(username, hashPassword(password));
      const token = createSessionToken();
      database.createSession(user.id, hashSessionToken(token), new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString());
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
      });
      return reply.code(201).send({ user });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return reply.code(409).send({ error: '用户名已存在', code: 'USERNAME_EXISTS' });
      }
      throw error;
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = bodyRecord(request.body);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const result = database.findUserForLogin(username);
    if (!result || !verifyPassword(password, result.passwordHash)) {
      return reply.code(401).send({ error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' });
    }
    const token = createSessionToken();
    database.createSession(result.user.id, hashSessionToken(token), new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString());
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return { user: result.user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) database.deleteSession(hashSessionToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/archive', async (request) => {
    const user = request.authUser;
    if (!user) return;
    const startedAt = Date.now();
    const result = database.getArchive(user.id);
    timedLog(request, 'archive.get', startedAt, { userId: user.id });
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
    const user = request.authUser;
    if (!user) return;
    const startedAt = Date.now();
    try {
      const result = database.importArchive(user.id, namespaces);
      timedLog(request, 'archive.import', startedAt, { namespaces: Object.keys(namespaces), userId: user.id });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error, event: 'archive.import', namespaces: Object.keys(namespaces), userId: user.id }, 'archive import failed');
      throw error;
    }
  });

  app.put('/api/archive/:namespace', async (request, reply) => {
    const user = request.authUser;
    if (!user) return;
    const namespace = (request.params as { namespace?: string }).namespace ?? '';
    if (!isArchiveNamespace(namespace)) {
      request.log.warn({ event: 'archive.put', code: ERROR_CODES['unknown archive namespace'], namespace, userId: user.id }, 'rejected: unknown namespace');
      return reply.code(400).send({ error: 'unknown archive namespace', code: 'UNKNOWN_NAMESPACE' });
    }
    const body = bodyRecord(request.body);
    if (typeof body.schemaVersion !== 'number' || body.data === undefined) {
      request.log.warn({ event: 'archive.put', code: ERROR_CODES['expected schemaVersion and data'], namespace, userId: user.id }, 'rejected: invalid archive body');
      return reply.code(400).send({ error: 'expected schemaVersion and data', code: 'INVALID_ARCHIVE_BODY' });
    }
    const startedAt = Date.now();
    const result = database.putNamespace(user.id, namespace, { schemaVersion: body.schemaVersion, data: body.data });
    timedLog(request, 'archive.put', startedAt, { namespace, userId: user.id });
    return reply.send(result);
  });

  app.get('/api/content/passages', async (request) => {
    const user = request.authUser;
    if (!user) return;
    const startedAt = Date.now();
    const result = { passages: database.listPassages(user.id) };
    timedLog(request, 'content.passages', startedAt, { userId: user.id });
    return result;
  });

  app.all('/gushiwen/*', async (request, reply) => {
    const upstreamPath = proxyPath(request);
    const expectedMethod = upstreamPath === '/ajax/search' ? 'POST' : upstreamPath?.startsWith('/ajax/getPoem/') ? 'GET' : null;
    if (!upstreamPath || !expectedMethod || request.method !== expectedMethod) {
      return reply.code(404).send({ error: 'unsupported gushiwen route', code: 'UPSTREAM_ROUTE_NOT_ALLOWED' });
    }
    const target = new URL(upstreamPath, GUSHIWEN_ORIGIN);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const startedAt = Date.now();
    try {
      const body = request.method === 'GET' ? undefined : JSON.stringify(request.body ?? {});
      const upstream = await fetch(target, {
        method: request.method,
        headers: {
          'user-agent': GUSHIWEN_USER_AGENT,
          ...(typeof request.headers['content-type'] === 'string' ? { 'content-type': request.headers['content-type'] } : {}),
        },
        body,
        signal: controller.signal,
      });
      const text = await upstream.text();
      if (text.length > MAX_UPSTREAM_BYTES) return reply.code(502).send({ error: 'gushiwen response too large', code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
      const upstreamType = upstream.headers.get('content-type');
      timedLog(request, 'gushiwen.proxy', startedAt, { upstream: target.pathname, status: upstream.status, bytes: text.length, userId: request.authUser?.id });
      return reply.code(upstream.status).type(upstreamType ?? 'application/json').send(text);
    } catch (error) {
      request.log.error({ err: error, event: 'gushiwen.proxy', path: upstreamPath }, 'gushiwen upstream failed');
      return reply.code(502).send({ error: 'gushiwen upstream unavailable', code: 'UPSTREAM_UNAVAILABLE' });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/review/sessions', async (request, reply) => {
    const user = request.authUser;
    if (!user) return;
    const body = bodyRecord(request.body);
    const passageId = body.passageId;
    if (passageId !== undefined && (typeof passageId !== 'string' || passageId.trim() === '')) {
      request.log.warn({ event: 'review.session', code: 'INVALID_PASSAGE_ID', userId: user.id }, 'rejected: invalid passageId');
      return reply.code(400).send({ error: 'invalid passageId', code: 'INVALID_PASSAGE_ID' });
    }
    const startedAt = Date.now();
    const result = database.createOrResumeReviewSession(user.id, typeof passageId === 'string' ? passageId : undefined);
    timedLog(request, 'review.session', startedAt, { sessionId: result.session.id, source: result.source, userId: user.id });
    return { session: result.session, source: result.source };
  });

  app.post('/api/review/reset', async (request, reply) => {
    const user = request.authUser;
    if (!user) return;
    const body = bodyRecord(request.body);
    if (typeof body.passageId !== 'string' || body.passageId.trim() === '') {
      request.log.warn({ event: 'review.reset', code: 'INVALID_PASSAGE_ID', userId: user.id }, 'rejected: invalid passageId');
      return reply.code(400).send({ error: 'invalid passageId', code: 'INVALID_PASSAGE_ID' });
    }
    const startedAt = Date.now();
    const result = database.resetPassageData(user.id, body.passageId);
    timedLog(request, 'review.reset', startedAt, { passageId: body.passageId, userId: user.id });
    return reply.send(result);
  });

  app.get('/api/review/sessions/active', async (request) => {
    const user = request.authUser;
    if (!user) return;
    const startedAt = Date.now();
    const session = database.getActiveReviewSession(user.id);
    timedLog(request, 'review.session.active', startedAt, { sessionId: session?.id ?? null, userId: user.id });
    return { session };
  });

  app.post('/api/review/sessions/:sessionId/attempts', async (request, reply) => {
    const user = request.authUser;
    if (!user) return;
    const params = request.params as { sessionId?: string };
    const body = bodyRecord(request.body);
    if (!params.sessionId || typeof body.operationId !== 'string' || typeof body.itemId !== 'string' || (body.result !== 'pass' && body.result !== 'miss')) {
      request.log.warn({ event: 'review.attempt', code: 'INVALID_REVIEW_ATTEMPT', sessionId: params.sessionId ?? null, userId: user.id }, 'rejected: invalid review attempt');
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
      const result = database.applyReviewAttempt(user.id, params.sessionId, input);
      timedLog(request, 'review.attempt', startedAt, { sessionId: params.sessionId, itemId: input.itemId, result: input.result, source: result.source, userId: user.id });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'review attempt failed';
      const status = message.includes('not found') ? 404 : message.includes('not current') ? 409 : 400;
      const code = errorCode(message);
      request.log.warn({ err: error, event: 'review.attempt', sessionId: params.sessionId, itemId: input.itemId, code, status, userId: user.id }, 'review attempt rejected');
      return reply.code(status).send({ error: message, code });
    }
  });

  app.post('/api/review/sessions/:sessionId/complete', async (request, reply) => {
    const user = request.authUser;
    if (!user) return;
    const id = (request.params as { sessionId?: string }).sessionId;
    if (!id) {
      request.log.warn({ event: 'review.complete', code: 'REVIEW_SESSION_MISSING', userId: user.id }, 'rejected: missing session id');
      return reply.code(400).send({ error: 'missing session id', code: 'REVIEW_SESSION_MISSING' });
    }
    const startedAt = Date.now();
    try {
      const session = database.completeReviewSession(user.id, id);
      timedLog(request, 'review.complete', startedAt, { sessionId: id, userId: user.id });
      return reply.send({ session });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'cannot complete session';
      const code = errorCode(message);
      request.log.warn({ err: error, event: 'review.complete', sessionId: id, code, userId: user.id }, 'review complete rejected');
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

  app.addHook('onReady', async () => {
    app.log.info({
      event: 'app.boot',
      version: process.env.npm_package_version ?? 'unknown',
      dbPath: options.dbPath ?? 'default',
      builtinPassages: builtins.length,
      node: process.version,
      authEnabled,
    }, 'wenyan-api booted');
  });

  return app;
}
