import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGushiPoem, searchGushi, toLocalPassage } from '../../src/api/gushiwen';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('gushiwen API client', () => {
  it('posts search parameters and parses an array response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 1, uuid: 'u1', name: '出师表', author: '诸葛亮' },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchGushi('出师表', 2)).resolves.toEqual([
      { id: 1, uuid: 'u1', name: '出师表', author: '诸葛亮' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/gushiwen/ajax/search', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ key: '出师表', type: '1', page: 2 }),
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects malformed and non-2xx search responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));
    await expect(searchGushi('x')).rejects.toThrow('在线搜索返回格式异常');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));
    await expect(searchGushi('x')).rejects.toThrow('HTTP 502');
  });

  it('fetches a poem detail and converts it to the local formal passage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: { name: '学而', author: '孔子', chaodai: '先秦' },
      poem_data: { content: [{ yuanwen: '学而时习之。', yiwen: '学习后经常温习。' }] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const detail = await fetchGushiPoem('uuid/1');
    expect(detail.title?.name).toBe('学而');
    expect(fetchMock).toHaveBeenCalledWith('/gushiwen/ajax/getPoem/uuid%2F1', expect.objectContaining({
      method: 'GET', signal: expect.any(AbortSignal),
    }));

    const passage = await toLocalPassage(detail, 'online:uuid-1');
    expect(passage).toMatchObject({ id: 'online:uuid-1', title: '学而', author: '孔子', dynasty: '先秦' });
    expect(passage.segments.flatMap((segment) => segment.cards.flatMap((card) => card.sentences)).map((sentence) => sentence.text))
      .toEqual(['学而时习之。']);
  });

  it('aborts a request at the configured timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));

    const pending = searchGushi('超时');
    const rejection = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
  });
});
