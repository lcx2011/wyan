import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReviewSession } from '../../src/domain/review/session';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => vi.unstubAllGlobals());

describe('review API client', () => {
  it('creates a remote session and submits an idempotent attempt payload', async () => {
    const state = createReviewSession([]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        source: 'created', session: { id: 'session-1', status: 'active', state, createdAt: 'now', updatedAt: 'now' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        source: 'updated', session: { id: 'session-1', status: 'completed', state, createdAt: 'now', updatedAt: 'later' },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../../src/api/review');
    api.setReviewApiEnabled(true);

    await expect(api.createOrResumeRemoteReviewSession()).resolves.toMatchObject({ id: 'session-1' });
    await expect(api.submitRemoteReviewAttempt('session-1', 'item-1', 'pass')).resolves.toMatchObject({ status: 'completed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/review/sessions');
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ itemId: 'item-1', result: 'pass' });
    expect(typeof body.operationId).toBe('string');
  });

  it('falls back to local mode when the review API fails or is disabled', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const api = await import('../../src/api/review');
    api.setReviewApiEnabled(true);
    await expect(api.createOrResumeRemoteReviewSession()).resolves.toBeNull();
    await expect(api.submitRemoteReviewAttempt('missing', 'item', 'miss')).resolves.toBeNull();

    api.setReviewApiEnabled(false);
    await expect(api.createOrResumeRemoteReviewSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
