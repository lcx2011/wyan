import {
  migrateAttemptData,
  migrateBadgeData,
  migrateLearningData,
  migrateMistakeData,
  migrateProgressData,
  migrateReviewData,
} from '../storage/migrations';
import { transientStorageGet, transientStorageSet, withStoragePrefix } from '../storage/raw';
import { SCHEMA_VERSIONS, STORAGE_KEYS, type PersistedRoot } from '../storage/schema';
import { readRoot, withPrefix } from '../utils/storage';
import { flushArchiveSync, getPendingArchiveWrites, pauseArchiveSync, type ArchiveRootPayload } from './syncQueue';
import { markCloudAvailable, markCloudUnavailable } from './cloudStatus';
import { passageRegistry } from '../data/passages';
import type { Passage } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
type ArchiveNamespace = keyof typeof SCHEMA_VERSIONS;

function requestId(response: Response): string {
  return response.headers.get('x-request-id') ?? 'n/a';
}

interface ArchiveSnapshot {
  initialized: boolean;
  revision: number;
  namespaces: Partial<Record<ArchiveNamespace, ArchiveRootPayload>>;
}

/** Production has no browser archive to import; this is retained for tests and migration compatibility. */
function localRoots(): Partial<Record<ArchiveNamespace, ArchiveRootPayload>> {
  const roots: Partial<Record<ArchiveNamespace, ArchiveRootPayload>> = {};
  const has = (name: ArchiveNamespace) => transientStorageGet(withPrefix(STORAGE_KEYS[name])) !== null;
  if (has('learning')) roots.learning = readRoot('learning', { version: SCHEMA_VERSIONS.learning, migrate: migrateLearningData }, { entries: [], onlinePassages: {}, migrationNotices: [] });
  if (has('progress')) roots.progress = readRoot('progress', { version: SCHEMA_VERSIONS.progress, migrate: migrateProgressData }, { progress: {} });
  if (has('mistakes')) roots.mistakes = readRoot('mistakes', { version: SCHEMA_VERSIONS.mistakes, migrate: migrateMistakeData }, { mistakes: {} });
  if (has('reviewQueue')) roots.reviewQueue = readRoot('reviewQueue', { version: SCHEMA_VERSIONS.reviewQueue, migrate: migrateReviewData }, { queue: [] });
  if (has('badges')) roots.badges = readRoot('badges', { version: SCHEMA_VERSIONS.badges, migrate: migrateBadgeData }, { badges: {}, processedEventIds: [] });
  if (has('attempts')) roots.attempts = readRoot('attempts', { version: SCHEMA_VERSIONS.attempts, migrate: migrateAttemptData }, { attempts: {} });
  return roots;
}

export async function parseResponseJson(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`[archive] ${context} 返回了非 JSON 响应（HTTP ${response.status}，请求 ID：${requestId(response)}）`);
  }
}

async function requestSnapshot(path: string, init?: RequestInit): Promise<ArchiveSnapshot> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(2_000),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (error) {
    markCloudUnavailable('无法连接云端服务，请检查服务器或网络后重试。');
    throw error;
  }
  if (!response.ok) {
    markCloudUnavailable(`云端数据读取失败（HTTP ${response.status}）。`);
    throw new Error(`archive request failed: ${response.status} (reqId=${requestId(response)})`);
  }
  const body = await parseResponseJson(response, `GET ${path}`) as ArchiveSnapshot;
  markCloudAvailable();
  return body;
}

async function hydrateServerContent(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/content/passages`, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(2_000),
    });
  } catch (error) {
    markCloudUnavailable('无法读取云端篇目，请检查服务器或网络后重试。');
    throw error;
  }
  if (!response.ok) {
    markCloudUnavailable(`云端篇目读取失败（HTTP ${response.status}）。`);
    throw new Error(`content request failed: ${response.status} (reqId=${requestId(response)})`);
  }
  const body = await parseResponseJson(response, 'GET /content/passages') as { passages?: Passage[] };
  if (!Array.isArray(body.passages)) throw new Error('content response is invalid');
  passageRegistry.replaceFromServer(body.passages);
  markCloudAvailable();
}

function applyRemoteRoots(namespaces: ArchiveSnapshot['namespaces']): void {
  for (const [namespace, root] of Object.entries(namespaces)) {
    if (!root) continue;
    const key = STORAGE_KEYS[namespace as ArchiveNamespace];
    if (!key) continue;
    transientStorageSet(withStoragePrefix(key), JSON.stringify(root satisfies PersistedRoot<unknown>));
  }
}

/** The API/database is authoritative. Failure is surfaced to the boot gate. */
export async function bootstrapServerArchive(): Promise<'connected'> {
  if (import.meta.env.MODE === 'test') return 'connected';
  pauseArchiveSync(true);
  try {
    let snapshot = await requestSnapshot('/archive');
    if (!snapshot.initialized) {
      snapshot = await requestSnapshot('/archive/import', {
        method: 'POST',
        body: JSON.stringify({ namespaces: import.meta.env.MODE === 'test' ? localRoots() : {} }),
      });
    } else {
      pauseArchiveSync(false);
      if (Object.keys(getPendingArchiveWrites()).length > 0) {
        await flushArchiveSync();
        snapshot = await requestSnapshot('/archive');
      }
      pauseArchiveSync(true);
    }
    applyRemoteRoots(snapshot.namespaces);
    await hydrateServerContent();
    markCloudAvailable();
    return 'connected';
  } catch (error) {
    markCloudUnavailable('无法读取云端数据，请检查服务器或网络后重试。');
    throw error;
  } finally {
    pauseArchiveSync(false);
  }
}
