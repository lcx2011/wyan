import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function archiveModule() {
  return import('../../src/api/archive');
}

describe('parseResponseJson（后端返回非 JSON 时的防御性解析）', () => {
  it('解析正常的 JSON 响应', async () => {
    const { parseResponseJson } = await archiveModule();
    const response = new Response(JSON.stringify({ ok: true, service: 'wenyan-api' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(parseResponseJson(response, 'GET /api/archive')).resolves.toEqual({ ok: true, service: 'wenyan-api' });
  });

  it('后端返回 HTML（SPA 兜底）时抛出描述性错误，而不是裸 SyntaxError', async () => {
    const { parseResponseJson } = await archiveModule();
    const response = new Response('<!doctype html><html><body>index.html</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const error = await parseResponseJson(response, 'GET /api/archive').then(
      () => { throw new Error('expected reject'); },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('非 JSON 响应');
    expect((error as Error).message).toContain('GET /api/archive');
  });

  it('空响应体同样报描述性错误', async () => {
    const { parseResponseJson } = await archiveModule();
    const response = new Response('', { status: 200, headers: { 'content-type': 'text/plain' } });
    await expect(parseResponseJson(response, 'GET /archive')).rejects.toThrow(/非 JSON 响应/);
  });
});
