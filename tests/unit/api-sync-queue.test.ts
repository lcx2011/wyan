import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function syncModule() {
  const module = await import('../../src/api/syncQueue');
  module.setArchiveSyncEnabled(true);
  return module;
}

const root = (value: number) => ({ schemaVersion: 3, data: { value } });

describe('archive outbox synchronization', () => {
  it('debounces writes and removes a namespace after a successful upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const module = await syncModule();

    module.queueArchiveWrite('progress', root(1));
    expect(module.getPendingArchiveWrites()).toHaveProperty('progress');
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(module.getPendingArchiveWrites()).toEqual({});
    expect(fetchMock).toHaveBeenCalledWith('/api/archive/progress', expect.objectContaining({ method: 'PUT' }));
  });

  it('keeps failed writes and retries them later', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const module = await syncModule();

    module.queueArchiveWrite('learning', root(1));
    await module.flushArchiveSync();
    expect(module.getPendingArchiveWrites()).toHaveProperty('learning');

    fetchMock.mockResolvedValue({ ok: true });
    await module.flushArchiveSync();
    expect(module.getPendingArchiveWrites()).toEqual({});
  });

  it('reuses the active flush and never deletes a newer write', async () => {
    let release: ((value: { ok: boolean }) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<{ ok: boolean }>((resolve) => {
      release = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);
    const module = await syncModule();

    module.queueArchiveWrite('mistakes', root(1));
    const first = module.flushArchiveSync();
    const second = module.flushArchiveSync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    module.queueArchiveWrite('mistakes', root(2));
    release?.({ ok: true });
    await Promise.all([first, second]);

    expect(module.getPendingArchiveWrites()).toMatchObject({ mistakes: root(2) });
    fetchMock.mockResolvedValue({ ok: true });
    await module.flushArchiveSync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(module.getPendingArchiveWrites()).toEqual({});
  });

  it('does not enqueue while paused', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const module = await syncModule();
    module.pauseArchiveSync(true);
    module.queueArchiveWrite('badges', root(1));
    expect(module.getPendingArchiveWrites()).toEqual({});
    await module.flushArchiveSync();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
