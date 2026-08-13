import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../../src/api/fetchWithRetry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('retries transient network failures and then returns the successful response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchWithRetry('/api/health', {}, { timeoutMs: 100, retryDelayMs: [0], retries: 1 });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 5xx responses but does not retry ordinary client errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await expect(fetchWithRetry('/api/archive', {}, { timeoutMs: 100, retryDelayMs: [0], retries: 1 })).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset().mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(fetchWithRetry('/api/auth/me', {}, { timeoutMs: 100, retryDelayMs: [0], retries: 2 })).resolves.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops retrying when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      controller.abort();
      init?.signal?.throwIfAborted();
      return new Response('{}', { status: 200 });
    });

    await expect(fetchWithRetry('/api/health', { signal: controller.signal }, { timeoutMs: 100, retryDelayMs: [0], retries: 2 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
