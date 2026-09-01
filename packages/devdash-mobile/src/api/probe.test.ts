import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeServer } from './probe';

function mockFetch(res: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue(res) as never;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('probeServer', () => {
  it('accepts a 401 carrying JSON', async () => {
    mockFetch({ status: 401, headers: new Headers({ 'content-type': 'application/json' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('ok');
  });

  it('rejects a 401 that is not JSON', async () => {
    mockFetch({ status: 401, headers: new Headers({ 'content-type': 'text/html' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('not-devdash');
  });

  it('rejects a 200', async () => {
    mockFetch({ status: 200, headers: new Headers({ 'content-type': 'text/html' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('not-devdash');
  });

  it('rejects a 404', async () => {
    mockFetch({ status: 404, headers: new Headers({ 'content-type': 'application/json' }) });
    await expect(probeServer('https://x.test')).resolves.toBe('not-devdash');
  });

  it('reports an unreachable host', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed')) as never;
    await expect(probeServer('https://x.test')).resolves.toBe('unreachable');
  });

  it('separates a certificate failure from a network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('The certificate for this server is invalid')) as never;
    await expect(probeServer('https://x.test')).resolves.toBe('tls');
  });

  it('calls /api/projects on the given origin', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 401, headers: new Headers({ 'content-type': 'application/json' }) });
    globalThis.fetch = spy as never;
    await probeServer('https://x.test');
    expect(spy.mock.calls[0][0]).toBe('https://x.test/api/projects');
  });
});
