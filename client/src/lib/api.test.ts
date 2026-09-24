import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Silent session renewal. The access cookie lives 15 minutes and nothing
 * used to renew it, so every session ended there. These pin the renewal,
 * and — because refresh rotates the token server-side — that concurrent
 * 401s share ONE refresh instead of racing into a replay rejection.
 */

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('api 401 handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('refreshes once and retries the original request', async () => {
    let expired = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/refresh')) {
        expired = false;
        return json(200, { ok: true });
      }
      return expired ? json(401, { error: 'expired' }) : json(200, { user: { name: 'A' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await import('./api');

    await expect(api.get('/api/auth/me')).resolves.toEqual({ user: { name: 'A' } });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/auth/refresh'))).toHaveLength(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    let expired = true;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/auth/refresh')) {
        await gate;
        expired = false;
        return json(200, { ok: true });
      }
      return expired ? json(401, { error: 'expired' }) : json(200, { ok: url });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await import('./api');

    const all = Promise.all([api.get('/api/a'), api.get('/api/b'), api.get('/api/c')]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await all;
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/auth/refresh'))).toHaveLength(1);
  });

  it('gives up with the 401 when the refresh itself is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: 'nope' }))
    );
    const { api, ApiClientError } = await import('./api');
    await expect(api.get('/api/auth/me')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('never tries to refresh around a failed login', async () => {
    const fetchMock = vi.fn(async () => json(401, { error: 'wrong password' }));
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await import('./api');
    await expect(api.post('/api/auth/login', { phone: 'x', password: 'y' })).rejects.toThrow('wrong password');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
