import {
  migrateAttemptData,
  migrateBadgeData,
  migrateLearningData,
  migrateMistakeData,
  migrateProgressData,
  migrateReviewData,
} from '../storage/migrations';
import { SCHEMA_VERSIONS, STORAGE_KEYS, type PersistedRoot } from '../storage/schema';
import { readRoot, withPrefix } from '../utils/storage';
import { flushArchiveSync, getPendingArchiveWrites, pauseArchiveSync, type ArchiveRootPayload } from './syncQueue';
import { passageRegistry } from '../data/passages';
import type { Passage } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
type ArchiveNamespace = keyof typeof SCHEMA_VERSIONS;

/** 后端透出的请求 ID：服务端日志用同一 ID 关联，便于排障。 */
function requestId(response: Response): string {
  return response.headers.get('x-request-id') ?? 'n/a';
}

interface ArchiveSnapshot {
  initialized: boolean;
  revision: number;
  namespaces: Partial<Record<ArchiveNamespace, ArchiveRootPayload>>;
}

function localRoots(): Partial<Record<ArchiveNamespace, ArchiveRootPayload>> {
  const roots: Partial<Record<ArchiveNamespace, ArchiveRootPayload>> = {};
  const has = (name: ArchiveNamespace) => window.localStorage.getItem(withPrefix(STORAGE_KEYS[name])) !== null;
  if (has('learning')) roots.learning = readRoot('learning', { version: SCHEMA_VERSIONS.learning, migrate: migrateLearningData }, { entries: [], onlinePassages: {}, migrationNotices: [] });
  if (has('progress')) roots.progress = readRoot('progress', { version: SCHEMA_VERSIONS.progress, migrate: migrateProgressData }, { progress: {} });
  if (has('mistakes')) roots.mistakes = readRoot('mistakes', { version: SCHEMA_VERSIONS.mistakes, migrate: migrateMistakeData }, { mistakes: {} });
  if (has('reviewQueue')) roots.reviewQueue = readRoot('reviewQueue', { version: SCHEMA_VERSIONS.reviewQueue, migrate: migrateReviewData }, { queue: [] });
  if (has('badges')) roots.badges = readRoot('badges', { version: SCHEMA_VERSIONS.badges, migrate: migrateBadgeData }, { badges: {}, processedEventIds: [] });
  if (has('attempts')) roots.attempts = readRoot('attempts', { version: SCHEMA_VERSIONS.attempts, migrate: migrateAttemptData }, { attempts: {} });
  return roots;
}

/**
 * 把响应体解析为 JSON。若后端返回的是 HTML（例如静态托管把 /api/* 请求
 * SPA 兜底重定向到 index.html 时，状态码 200 但 body 不是 JSON），
 * 抛带上下文的错误而非生僻的 SyntaxError，便于排查"后端未部署"类问题。
 */
export async function parseResponseJson(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `[archive] ${context} 返回了非 JSON 响应（HTTP ${response.status}，Content-Type: ${response.headers.get('content-type') ?? '未知'}，请求 ID: ${requestId(response)}）。` +
        '后端可能未部署，或请求被 SPA 兜底重定向到了 index.html。',
    );
  }
}

async function requestSnapshot(path: string, init?: RequestInit): Promise<ArchiveSnapshot> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(2_000),
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`archive request failed: ${response.status} (reqId=${requestId(response)})`);
  return (await parseResponseJson(response, `GET ${path}`)) as ArchiveSnapshot;
}

async function hydrateServerContent(): Promise<void> {
  const response = await fetch(`${API_BASE}/content/passages`, { signal: AbortSignal.timeout(2_000) });
  if (!response.ok) throw new Error(`content request failed: ${response.status} (reqId=${requestId(response)})`);
  const body = (await parseResponseJson(response, 'GET /content/passages')) as { passages?: Passage[] };
  if (Array.isArray(body.passages)) passageRegistry.replaceFromServer(body.passages);
}

function applyRemoteRoots(namespaces: ArchiveSnapshot['namespaces']): void {
  for (const [namespace, root] of Object.entries(namespaces)) {
    if (!root) continue;
    const key = STORAGE_KEYS[namespace as ArchiveNamespace];
    if (!key) continue;
    window.localStorage.setItem(withPrefix(key), JSON.stringify(root satisfies PersistedRoot<unknown>));
  }
}

/** Existing browser data initializes an empty SQLite archive exactly once. */
export async function bootstrapServerArchive(): Promise<'connected' | 'offline'> {
  if (import.meta.env.MODE === 'test') return 'offline';
  pauseArchiveSync(true);
  try {
    let snapshot = await requestSnapshot('/archive');
    if (!snapshot.initialized) {
      snapshot = await requestSnapshot('/archive/import', {
        method: 'POST',
        body: JSON.stringify({ namespaces: localRoots() }),
      });
    } else {
      pauseArchiveSync(false);
      if (Object.keys(getPendingArchiveWrites()).length > 0) {
        await flushArchiveSync();
        snapshot = await requestSnapshot('/archive');
      }
      pauseArchiveSync(true);
      applyRemoteRoots(snapshot.namespaces);
    }
    await hydrateServerContent();
    return 'connected';
  } catch (error) {
    console.warn('[archive] 后端不可用，继续使用本地存档', error);
    return 'offline';
  } finally {
    pauseArchiveSync(false);
  }
}
