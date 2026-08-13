import { markCloudAvailable, markCloudUnavailable } from './cloudStatus';

export interface ArchiveRootPayload {
  schemaVersion: number;
  data: unknown;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
let flushTimer: number | null = null;
let activeFlush: Promise<void> | null = null;
let paused = false;
let syncEnabled = import.meta.env.MODE !== 'test';
// Deliberately memory-only. A failed request must not leave a durable browser outbox.
let outbox: Record<string, ArchiveRootPayload> = {};

function isEnabled(): boolean {
  return syncEnabled;
}

function readOutbox(): Record<string, ArchiveRootPayload> {
  return outbox;
}

function writeOutbox(value: Record<string, ArchiveRootPayload>): void {
  outbox = value;
}

export function pauseArchiveSync(value: boolean): void {
  paused = value;
}

/** Test and embedding hook; production keeps synchronization enabled by default. */
export function setArchiveSyncEnabled(value: boolean): void {
  syncEnabled = value;
}

export function getPendingArchiveWrites(): Record<string, ArchiveRootPayload> {
  return readOutbox();
}

export function queueArchiveWrite(namespace: string, root: ArchiveRootPayload): void {
  if (paused || !isEnabled()) return;
  writeOutbox({ ...readOutbox(), [namespace]: root });
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushArchiveSync();
  }, import.meta.env.MODE === 'test' ? 250 : 0);
}

async function sendRoot(namespace: string, root: ArchiveRootPayload): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/archive/${encodeURIComponent(namespace)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(root),
    });
  } catch (error) {
    markCloudUnavailable('云端暂时不可用，本次操作未完成，请重新连接后重试。');
    throw error;
  }
  if (!response.ok) {
    markCloudUnavailable(`云端保存失败（HTTP ${response.status}），请重新连接后重试。`);
    throw new Error(`archive sync failed: ${response.status} (reqId=${response.headers.get('x-request-id') ?? 'n/a'})`);
  }
  markCloudAvailable();
}

export async function flushArchiveSync(): Promise<void> {
  if (paused || !isEnabled()) return;
  if (activeFlush) return activeFlush;
  activeFlush = (async () => {
    const pending = readOutbox();
    for (const [namespace, root] of Object.entries(pending)) {
      try {
        await sendRoot(namespace, root);
        const latest = readOutbox();
        if (JSON.stringify(latest[namespace]) === JSON.stringify(root)) {
          delete latest[namespace];
          writeOutbox(latest);
        }
      } catch {
        break;
      }
    }
  })().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}
