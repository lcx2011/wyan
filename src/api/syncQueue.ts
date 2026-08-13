import { withStoragePrefix } from '../storage/raw';

export interface ArchiveRootPayload {
  schemaVersion: number;
  data: unknown;
}

const OUTBOX_KEY = withStoragePrefix('serverOutbox');
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
let flushTimer: number | null = null;
let activeFlush: Promise<void> | null = null;
let paused = false;
let syncEnabled = import.meta.env.MODE !== 'test';

function isEnabled(): boolean {
  return syncEnabled;
}

function readOutbox(): Record<string, ArchiveRootPayload> {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    const value = raw ? JSON.parse(raw) as unknown : {};
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, ArchiveRootPayload>
      : {};
  } catch {
    return {};
  }
}

function writeOutbox(value: Record<string, ArchiveRootPayload>): void {
  try {
    if (Object.keys(value).length === 0) window.localStorage.removeItem(OUTBOX_KEY);
    else window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(value));
  } catch {
    // The local store reports quota failures; sync retries on the next write/startup.
  }
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
  }, 250);
}

async function sendRoot(namespace: string, root: ArchiveRootPayload): Promise<void> {
  const response = await fetch(`${API_BASE}/archive/${encodeURIComponent(namespace)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(root),
  });
  if (!response.ok) throw new Error(`archive sync failed: ${response.status} (reqId=${response.headers.get('x-request-id') ?? 'n/a'})`);
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
