// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { buildApp } from '../../server/app';
import { ArchiveDatabase } from '../../server/db';
import type { ReviewItem } from '../../src/types';

const apps: FastifyInstance[] = [];
const temporaryDirs: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  temporaryDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

async function app(staticDir = 'Z:/not-a-real-dist'): Promise<FastifyInstance> {
  const instance = buildApp({ dbPath: ':memory:', staticDir });
  apps.push(instance);
  await instance.ready();
  return instance;
}

/** 收集 pino 输出的内存流，用于断言日志行为。 */
function collectingStream(): { stream: Writable; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      try {
        lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      } catch {
        // 忽略无法解析的行（如 transport 内部错误输出）
      }
      callback();
    },
  });
  return { stream, lines };
}

/** 用收集日志的内存流构造 app，便于断言日志行为。 */
async function loggingApp(): Promise<{ instance: FastifyInstance; lines: Array<Record<string, unknown>> }> {
  const { stream, lines } = collectingStream();
  const instance = buildApp({ dbPath: ':memory:', staticDir: 'Z:/not-a-real-dist', logger: { level: 'info', stream } });
  apps.push(instance);
  await instance.ready();
  return { instance, lines };
}

async function authApp(): Promise<FastifyInstance> {
  const instance = buildApp({ dbPath: ':memory:', staticDir: 'Z:/not-a-real-dist', authEnabled: true });
  apps.push(instance);
  await instance.ready();
  return instance;
}

function sessionCookie(response: { headers: { 'set-cookie'?: unknown } }): string {
  const value = response.headers['set-cookie'];
  const cookie = Array.isArray(value) ? value[0] : value;
  expect(cookie).toBeDefined();
  return String(cookie).split(';', 1)[0];
}

function reviewItem(id: string, order: number): ReviewItem {
  return {
    id,
    dueDate: '2099-01-01',
    status: 'pending',
    attempts: 0,
    completedAt: null,
    passageId: 'test-passage',
    sentence: `提示${id}，`,
    answer: `答案${id}。`,
    sourceSentence: `答案${id}。`,
    hiddenPositions: [],
    sourceDate: '2026-08-10',
    contentVersion: 'v1',
    sentenceId: `sentence:${id}`,
    targetClauseId: `clause:${id}`,
    targetOrder: order,
    promptType: 'previous-clause',
    reason: 'mistake',
    priority: 100,
    mistakeCount: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
  };
}

async function importQueue(instance: FastifyInstance, queue: ReviewItem[]): Promise<void> {
  const response = await instance.inject({
    method: 'POST',
    url: '/api/archive/import',
    payload: { namespaces: { reviewQueue: { schemaVersion: 4, data: { queue } } } },
  });
  expect(response.statusCode).toBe(200);
}

describe('single archive API', () => {
  it('starts without identity and exposes the server-owned content catalog', async () => {
    const instance = await app();
    const health = await instance.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toEqual({ ok: true, service: 'wenyan-api' });

    const before = await instance.inject({ method: 'GET', url: '/api/archive' });
    expect(before.json()).toMatchObject({ initialized: false, revision: 0, namespaces: {} });

    const content = await instance.inject({ method: 'GET', url: '/api/content/passages' });
    expect(content.json<{ passages: unknown[] }>().passages).toHaveLength(5);
  });

  it('serves the SPA shell while keeping unknown API routes as JSON 404 responses', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wenyan-static-'));
    temporaryDirs.push(directory);
    writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Wenyan shell</title>');
    const instance = await app(directory);

    const route = await instance.inject({ method: 'GET', url: '/learn/some-passage' });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('Wenyan shell');

    const missingApi = await instance.inject({ method: 'GET', url: '/api/unknown' });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.json()).toEqual({ error: 'not found' });
  });

  it('materializes and removes an online passage with the learning archive', async () => {
    const instance = await app();
    const online = {
      id: 'online:test', sourceType: 'online', sourceId: 'test', contentVersion: 'v1',
      title: '测试在线篇目', author: '佚名', dynasty: '未知', cachedAt: '2026-08-10T00:00:00.000Z', segments: [],
    };
    await instance.inject({
      method: 'PUT', url: '/api/archive/learning',
      payload: { schemaVersion: 2, data: { entries: [{ id: online.id, addedAt: online.cachedAt }], onlinePassages: { [online.id]: online }, migrationNotices: [] } },
    });
    expect((await instance.inject({ method: 'GET', url: '/api/content/passages' })).json<{ passages: unknown[] }>().passages).toHaveLength(6);

    await instance.inject({
      method: 'PUT', url: '/api/archive/learning',
      payload: { schemaVersion: 2, data: { entries: [], onlinePassages: {}, migrationNotices: [] } },
    });
    expect((await instance.inject({ method: 'GET', url: '/api/content/passages' })).json<{ passages: unknown[] }>().passages).toHaveLength(5);
  });

  it('imports the browser archive, creates one persistent group, and resumes it', async () => {
    const instance = await app();
    await importQueue(instance, [reviewItem('a', 0), reviewItem('b', 3)]);

    const created = await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} });
    const first = created.json<{ session: { id: string; state: { items: ReviewItem[] } }; source: string }>();
    expect(first.source).toBe('created');
    expect(first.session.state.items).toHaveLength(2);

    const resumed = await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} });
    expect(resumed.json()).toMatchObject({ source: 'resumed', session: { id: first.session.id } });
  });

  it('resets one passage archive and its remote review session', async () => {
    const instance = await app();
    await importQueue(instance, [reviewItem('a', 0), { ...reviewItem('b', 3), passageId: 'other-passage' }]);

    const created = (await instance.inject({
      method: 'POST',
      url: '/api/review/sessions',
      payload: { passageId: 'test-passage' },
    })).json<{ session: { status: string } }>();
    expect(created.session.status).toBe('active');

    const reset = await instance.inject({
      method: 'POST',
      url: '/api/review/reset',
      payload: { passageId: 'test-passage' },
    });
    expect(reset.statusCode).toBe(200);

    const archive = (await instance.inject({ method: 'GET', url: '/api/archive' })).json<{
      namespaces: { reviewQueue: { data: { queue: ReviewItem[] } } };
      activeReviewSession: null;
    }>();
    expect(archive.namespaces.reviewQueue.data.queue.map((item) => item.passageId)).toEqual(['other-passage']);
    expect(archive.activeReviewSession).toBeNull();
  });

  it('applies attempts idempotently and commits completed items to the archive', async () => {
    const instance = await app();
    await importQueue(instance, [reviewItem('a', 0), reviewItem('b', 3)]);
    const created = (await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} }))
      .json<{ session: { id: string; state: { items: ReviewItem[] } } }>();
    const sessionId = created.session.id;
    const firstId = created.session.state.items[0].id;

    const first = await instance.inject({
      method: 'POST',
      url: `/api/review/sessions/${encodeURIComponent(sessionId)}/attempts`,
      payload: { operationId: 'op-1', itemId: firstId, result: 'pass' },
    });
    expect(first.json()).toMatchObject({ source: 'updated', session: { state: { completedCount: 1 } } });

    const duplicate = await instance.inject({
      method: 'POST',
      url: `/api/review/sessions/${encodeURIComponent(sessionId)}/attempts`,
      payload: { operationId: 'op-1', itemId: firstId, result: 'pass' },
    });
    expect(duplicate.json()).toMatchObject({ source: 'already-applied', session: { state: { completedCount: 1 } } });

    const nextId = first.json<{ session: { state: { items: ReviewItem[] } } }>().session.state.items[0].id;
    const completed = await instance.inject({
      method: 'POST',
      url: `/api/review/sessions/${encodeURIComponent(sessionId)}/attempts`,
      payload: { operationId: 'op-2', itemId: nextId, result: 'pass' },
    });
    expect(completed.json()).toMatchObject({ session: { status: 'completed', state: { completed: true, completedCount: 2 } } });

    const archive = (await instance.inject({ method: 'GET', url: '/api/archive' })).json<{
      revision: number;
      namespaces: { reviewQueue: { data: { queue: ReviewItem[] } } };
      activeReviewSession: null;
    }>();
    expect(archive.revision).toBeGreaterThan(1);
    expect(archive.activeReviewSession).toBeNull();
    expect(archive.namespaces.reviewQueue.data.queue.every((item) => item.status === 'completed')).toBe(true);
  });

  it('persists a missed item in the active session for refresh recovery', async () => {
    const instance = await app();
    await importQueue(instance, [reviewItem('a', 0), reviewItem('b', 3), reviewItem('c', 6)]);
    const created = (await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} }))
      .json<{ session: { id: string; state: { items: ReviewItem[] } } }>();
    const currentId = created.session.state.items[0].id;

    await instance.inject({
      method: 'POST',
      url: `/api/review/sessions/${encodeURIComponent(created.session.id)}/attempts`,
      payload: { operationId: 'miss-1', itemId: currentId, result: 'miss' },
    });
    const active = (await instance.inject({ method: 'GET', url: '/api/review/sessions/active' })).json<{
      session: { id: string; state: { revision: number; items: ReviewItem[] } };
    }>();
    expect(active.session.id).toBe(created.session.id);
    expect(active.session.state.revision).toBe(1);
    expect(active.session.state.items[2]).toMatchObject({ id: currentId, attempts: 1 });
  });

  it('returns explicit client errors for invalid archive and review transitions', async () => {
    const instance = await app();
    expect((await instance.inject({ method: 'PUT', url: '/api/archive/not-a-namespace', payload: {} })).statusCode).toBe(400);
    expect((await instance.inject({ method: 'PUT', url: '/api/archive/progress', payload: { schemaVersion: '2', data: {} } })).statusCode).toBe(400);
    expect((await instance.inject({ method: 'PUT', url: '/api/archive/progress', payload: { schemaVersion: 2 } })).statusCode).toBe(400);
    expect((await instance.inject({ method: 'POST', url: '/api/review/sessions/missing/attempts', payload: {} })).statusCode).toBe(400);
    expect((await instance.inject({
      method: 'POST',
      url: '/api/review/sessions/missing/attempts',
      payload: { operationId: 'missing-session', itemId: 'item', result: 'pass' },
    })).statusCode).toBe(404);
    expect((await instance.inject({ method: 'POST', url: '/api/review/sessions/missing/complete', payload: {} })).statusCode).toBe(400);

    await importQueue(instance, [reviewItem('a', 0), reviewItem('b', 3)]);
    const created = (await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} }))
      .json<{ session: { id: string; state: { items: ReviewItem[] } } }>();
    const wrongCurrent = await instance.inject({
      method: 'POST',
      url: `/api/review/sessions/${created.session.id}/attempts`,
      payload: { operationId: 'wrong-current', itemId: created.session.state.items[1].id, result: 'pass' },
    });
    expect(wrongCurrent.statusCode).toBe(409);

    const incomplete = await instance.inject({ method: 'POST', url: `/api/review/sessions/${created.session.id}/complete`, payload: {} });
    expect(incomplete.statusCode).toBe(400);
  });

  it('accepts a completed empty group and rejects attempts against it', async () => {
    const instance = await app();
    const created = (await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} }))
      .json<{ session: { id: string; status: string } }>();
    expect(created.session.status).toBe('completed');

    const completed = await instance.inject({ method: 'POST', url: `/api/review/sessions/${created.session.id}/complete`, payload: {} });
    expect(completed.statusCode).toBe(200);
    const rejected = await instance.inject({
      method: 'POST',
      url: `/api/review/sessions/${created.session.id}/attempts`,
      payload: { operationId: 'after-complete', itemId: 'anything', result: 'pass', occurredAt: '2026-08-10T00:00:00.000Z' },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json<{ error: string }>().error).toContain('not active');
  });

  it('materializes defensive archive shapes without corrupting valid rows', async () => {
    const instance = await app();
    const put = (namespace: string, data: unknown) => instance.inject({
      method: 'PUT',
      url: `/api/archive/${namespace}`,
      payload: { schemaVersion: 1, data },
    });

    expect((await put('learning', { entries: {}, onlinePassages: null })).statusCode).toBe(200);
    expect((await put('learning', {
      entries: [null, { id: 'missing-date' }, { id: 'online:defensive', addedAt: '2026-08-10T00:00:00.000Z' }],
      onlinePassages: {
        invalid: {},
        'online:defensive': {
          id: 'online:defensive', sourceType: 'online', sourceId: 'defensive', contentVersion: 'v1',
          title: '防御数据', author: '佚名', dynasty: '未知', cachedAt: '2026-08-10T00:00:00.000Z', segments: [],
        },
      },
    })).statusCode).toBe(200);
    expect((await put('progress', { progress: {
      missing: null,
      complete: { contentVersion: 'v1', updatedAt: '2026-08-10T00:00:00.000Z' },
    } })).statusCode).toBe(200);
    expect((await put('mistakes', { mistakes: {
      ignored: null,
      mixed: [null, { sentenceKey: 'missing-date' }, { sentenceKey: 'sentence', date: '2026-08-10' }],
    } })).statusCode).toBe(200);
    expect((await put('attempts', { attempts: {
      ignored: null,
      open: { passageId: 'p1' },
      done: { passageId: 'p1', completedAt: '2026-08-10T00:00:00.000Z' },
    } })).statusCode).toBe(200);
    expect((await put('badges', { badges: null, processedEventIds: null })).statusCode).toBe(200);
    expect((await put('badges', { badges: { earned: [] }, processedEventIds: ['event'] })).statusCode).toBe(200);
    expect((await put('reviewQueue', { queue: [{ ...reviewItem('without-clause', 0), targetClauseId: undefined }] })).statusCode).toBe(200);

    const archive = (await instance.inject({ method: 'GET', url: '/api/archive' })).json<{
      initialized: boolean;
      namespaces: Record<string, unknown>;
    }>();
    expect(archive.initialized).toBe(true);
    expect(Object.keys(archive.namespaces)).toEqual(expect.arrayContaining([
      'learning', 'progress', 'mistakes', 'attempts', 'badges', 'reviewQueue',
    ]));
    expect((await instance.inject({ method: 'GET', url: '/api/content/passages' })).json<{ passages: Array<{ id: string }> }>().passages)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'online:defensive' })]));
  });
});

describe('authentication and user isolation', () => {
  it('registers, logs in, protects archives, and isolates users', async () => {
    const instance = await authApp();
    expect((await instance.inject({ method: 'GET', url: '/api/archive' })).statusCode).toBe(401);

    const registered = await instance.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: 'alice-password' },
    });
    expect(registered.statusCode).toBe(201);
    const aliceCookie = sessionCookie(registered);

    const put = await instance.inject({
      method: 'PUT',
      url: '/api/archive/progress',
      headers: { cookie: aliceCookie },
      payload: { schemaVersion: 4, data: { progress: { alice: { contentVersion: 'v1' } } } },
    });
    expect(put.statusCode).toBe(200);

    const duplicate = await instance.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: 'another-password' },
    });
    expect(duplicate.statusCode).toBe(409);

    const login = await instance.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'alice-password' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ user: { username: 'alice' } });

    const bob = await instance.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'bob', password: 'bob-password' },
    });
    const bobArchive = await instance.inject({ method: 'GET', url: '/api/archive', headers: { cookie: sessionCookie(bob) } });
    expect(bobArchive.json()).toMatchObject({ initialized: false, namespaces: {} });

    const aliceArchive = await instance.inject({ method: 'GET', url: '/api/archive', headers: { cookie: aliceCookie } });
    expect(aliceArchive.json()).toMatchObject({ initialized: true, namespaces: { progress: { data: { progress: { alice: { contentVersion: 'v1' } } } } } });
  });

  it('only proxies the fixed gushiwen routes and never follows a caller-supplied origin', async () => {
    const instance = await authApp();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const registered = await instance.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'proxy-user', password: 'proxy-password' },
    });
    const cookie = sessionCookie(registered);
    expect((await instance.inject({ method: 'GET', url: '/gushiwen/http://127.0.0.1:1/', headers: { cookie } })).statusCode).toBe(404);
    expect((await instance.inject({ method: 'POST', url: '/gushiwen/ajax/search?target=http://127.0.0.1:1', headers: { cookie }, payload: { key: 'x' } })).statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://www.gushiwenku.cn/ajax/search'), expect.objectContaining({ method: 'POST' }));
  });
});

describe('legacy archive migration', () => {
  it('moves the old single archive into admin', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wenyan-legacy-'));
    temporaryDirs.push(directory);
    const filename = join(directory, 'legacy.sqlite');
    const legacy = new Database(filename);
    legacy.exec(`
      CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE archive_namespaces (namespace TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE content_passages (id TEXT PRIMARY KEY, source_type TEXT NOT NULL DEFAULT 'builtin', content_version TEXT NOT NULL, passage_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE learning_entries (passage_id TEXT PRIMARY KEY, added_at TEXT NOT NULL);
      INSERT INTO app_meta VALUES ('archive_initialized', '1');
      INSERT INTO app_meta VALUES ('archive_revision', '12');
      INSERT INTO archive_namespaces VALUES ('progress', 4, '{"progress":{"legacy":{"contentVersion":"v1"}}}', '2026-08-12T00:00:00.000Z');
    `);
    legacy.close();

    const previousPassword = process.env.WENYAN_ADMIN_PASSWORD;
    process.env.WENYAN_ADMIN_PASSWORD = 'migration-password';
    const migrated = new ArchiveDatabase(filename);
    const admin = migrated.findUserForLogin('admin');
    expect(admin?.user.username).toBe('admin');
    expect(migrated.getArchive(admin?.user.id ?? -1)).toMatchObject({ initialized: true, revision: 12, namespaces: { progress: { data: { progress: { legacy: { contentVersion: 'v1' } } } } } });
    migrated.close();
    if (previousPassword === undefined) delete process.env.WENYAN_ADMIN_PASSWORD;
    else process.env.WENYAN_ADMIN_PASSWORD = previousPassword;
  });
});

describe('backend logging', () => {
  it('emits structured business events with duration and exposes x-request-id', async () => {
    const { instance, lines } = await loggingApp();

    const health = await instance.inject({ method: 'GET', url: '/api/health' });
    expect(health.headers['x-request-id']).toBeDefined();

    await importQueue(instance, [reviewItem('a', 0)]);
    expect(lines.some((line) => line.event === 'archive.import' && typeof line.durationMs === 'number')).toBe(true);

    const created = await instance.inject({ method: 'POST', url: '/api/review/sessions', payload: {} });
    expect(lines.some((line) => line.event === 'review.session' && line.source === 'created')).toBe(true);
    expect(created.headers['x-request-id']).toBeDefined();
  });

  it('records rejected requests with error codes', async () => {
    const { instance, lines } = await loggingApp();

    const bad = await instance.inject({ method: 'PUT', url: '/api/archive/not-a-namespace', payload: {} });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: 'unknown archive namespace', code: 'UNKNOWN_NAMESPACE' });
    expect(lines.some((line) => line.event === 'archive.put' && line.code === 'UNKNOWN_NAMESPACE')).toBe(true);

    const rejected = await instance.inject({
      method: 'POST',
      url: '/api/review/sessions/missing/attempts',
      payload: { operationId: 'missing-session', itemId: 'item', result: 'pass' },
    });
    expect(rejected.statusCode).toBe(404);
    expect(rejected.json()).toMatchObject({ error: 'review session not found', code: 'REVIEW_SESSION_NOT_FOUND' });
  });

  it('silences health probe access logs via disableRequestLogging', async () => {
    const { instance, lines } = await loggingApp();

    await instance.inject({ method: 'GET', url: '/api/health' });
    await instance.inject({ method: 'GET', url: '/api/archive' });

    const healthLogged = lines.some((line) => {
      const req = line.req as { url?: string } | undefined;
      return req?.url === '/api/health';
    });
    expect(healthLogged).toBe(false);
    expect(lines.some((line) => {
      const req = line.req as { url?: string } | undefined;
      return req?.url === '/api/archive';
    })).toBe(true);
  });
});
