import { afterEach, describe, expect, it, vi } from 'vitest';
import IPScannerDefault, { ConnectionError, IPScanner, TimeoutError } from '../src/index';
import { json, mockClient } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('client', () => {
  it('exports the client as default', () => {
    expect(IPScannerDefault).toBe(IPScanner);
  });

  it('sends the bearer key, user agent and json headers', async () => {
    const { client, calls } = mockClient([json(200, { ip: '1.1.1.1' })]);
    await client.ip.lookup('1.1.1.1');
    const call = calls[0]!;
    expect(call.url).toBe('https://api.test/v1/ip/lookup');
    expect(call.method).toBe('POST');
    expect(call.headers.get('authorization')).toBe('Bearer pk_test_123');
    expect(call.headers.get('user-agent')).toBe('ipscanner-node/0.1.0');
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.headers.get('accept')).toBe('application/json');
    expect(call.body).toEqual({ target: '1.1.1.1' });
  });

  it('omits the authorization header without a key', async () => {
    vi.stubEnv('IPSCANNER_API_KEY', '');
    const { client, calls } = mockClient([json(200, {})], { apiKey: undefined });
    expect(client.apiKey).toBeUndefined();
    await client.ip.demo('8.8.8.8');
    expect(calls[0]!.headers.has('authorization')).toBe(false);
    expect(calls[0]!.headers.has('content-type')).toBe(false);
    expect(calls[0]!.method).toBe('GET');
  });

  it('reads the key and base url from the environment', () => {
    vi.stubEnv('IPSCANNER_API_KEY', ' pk_test_env ');
    vi.stubEnv('IPSCANNER_API_URL', 'https://self.hosted/');
    const client = new IPScanner();
    expect(client.apiKey).toBe('pk_test_env');
    expect(client.baseUrl).toBe('https://self.hosted');
  });

  it('lets an explicit empty key override the environment', () => {
    vi.stubEnv('IPSCANNER_API_KEY', 'pk_test_env');
    expect(new IPScanner({ apiKey: '' }).apiKey).toBeUndefined();
  });

  it('escapes IPv6 addresses in the path', async () => {
    const { client, calls } = mockClient([json(200, {})]);
    await client.ip.vpn('2001:db8::1');
    await client.ip.geo('2001:db8::1');
    expect(calls[0]!.url).toBe('https://api.test/v1/vpn/2001%3Adb8%3A%3A1');
    expect(calls[1]!.url).toBe('https://api.test/v1/geo/2001%3Adb8%3A%3A1');
  });

  it('retries GET requests on 503 and succeeds', async () => {
    vi.useFakeTimers();
    let n = 0;
    const { client, calls } = mockClient([
      () => (++n < 3 ? json(503, { error: 'server_error', message: 'down' }) : json(200, { ok: true })),
    ]);
    const promise = client.provenance.verify();
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it('gives up after maxRetries', async () => {
    vi.useFakeTimers();
    const { client, calls } = mockClient([json(502, { error: 'server_error', message: 'bad gateway' })], {
      maxRetries: 1,
    });
    const promise = client.ip.vpn('1.1.1.1');
    const assertion = expect(promise).rejects.toMatchObject({ status: 502 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(calls).toHaveLength(2);
  });

  it('retries GET requests on network errors', async () => {
    vi.useFakeTimers();
    let n = 0;
    const { client, calls } = mockClient([
      () => {
        if (++n === 1) throw new TypeError('fetch failed');
        return json(200, { count: 1 });
      },
    ]);
    const promise = client.crawlers.list();
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ count: 1 });
    expect(calls).toHaveLength(2);
  });

  it('never retries POST requests', async () => {
    const { client, calls } = mockClient([json(503, { error: 'server_error', message: 'down' })]);
    await expect(client.ip.lookup('1.1.1.1')).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it('never retries 429', async () => {
    const { client, calls } = mockClient([json(429, { error: 'rate_limit_exceeded', message: 'slow', retryAfter: 1 })]);
    await expect(client.ip.vpn('1.1.1.1')).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(1);
  });

  it('wraps network failures in ConnectionError', async () => {
    const { client } = mockClient(
      [
        () => {
          throw new TypeError('fetch failed');
        },
      ],
      { maxRetries: 0 },
    );
    await expect(client.ip.vpn('1.1.1.1')).rejects.toBeInstanceOf(ConnectionError);
  });

  it('throws TimeoutError when the request takes too long', async () => {
    const hang = (_: unknown, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const { client } = mockClient([hang], { timeout: 20, maxRetries: 0 });
    await expect(client.ip.lookup('1.1.1.1')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('passes a caller abort through without retrying', async () => {
    const controller = new AbortController();
    const { client, calls } = mockClient([
      (_, init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          controller.abort();
        }),
    ]);
    const error = await client.ip.vpn('1.1.1.1', { signal: controller.signal }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ConnectionError);
    expect((error as Error).name).toBe('AbortError');
    expect(calls).toHaveLength(1);
  });
});
