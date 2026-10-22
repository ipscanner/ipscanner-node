import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorFromResponse } from '../src/errors';
import {
  APIError,
  AuthenticationError,
  ConnectionError,
  IPScanner,
  IPScannerError,
  NotFoundError,
  RateLimitError,
  type BulkEvent,
} from '../src/index';
import { toBulkEvent } from '../src/resources/bulk';
import { json, mockClient } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const anyText = fc.oneof(
  fc.constantFrom('', '.', '..', '...', '%2e', '%2e%2e', '/', '../x', '?a=1', '#x', '%', ' ', 'AS', ' as ', '2001:db8::1'),
  fc.string({ unit: 'binary' }),
  fc.string({ unit: 'grapheme' }),
);

describe('path parameters', () => {
  const endpoints: [string, (c: IPScanner, v: string) => Promise<unknown>, string, string][] = [
    ['ip.vpn', (c, v) => c.ip.vpn(v), '/v1/vpn/', ''],
    ['ip.proxy', (c, v) => c.ip.proxy(v), '/v1/proxy/', ''],
    ['ip.geo', (c, v) => c.ip.geo(v), '/v1/geo/', ''],
    ['ip.asn', (c, v) => c.ip.asn(v), '/v1/asn/', ''],
    ['ip.whois', (c, v) => c.ip.whois(v), '/v1/whois/', ''],
    ['ip.demo', (c, v) => c.ip.demo(v), '/v1/demo/', ''],
    ['sites.policy', (c, v) => c.sites.policy(v), '/v1/sites/', '/policy'],
    ['asnDirectory.get', (c, v) => c.asnDirectory.get(v), '/v1/asn/directory/', ''],
  ];

  it('stay one segment of the intended endpoint or reject without a request', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...endpoints), anyText, async ([name, call, prefix, suffix], input) => {
        const { client, calls } = mockClient([json(200, {})]);
        let pending: Promise<unknown> | undefined;
        expect(() => {
          pending = call(client, input);
        }).not.toThrow();
        const value = name === 'asnDirectory.get' ? input.trim().replace(/^as/i, '') : input;
        if (value === '' || value === '.' || value === '..' || LONE_SURROGATE.test(value)) {
          await expect(pending).rejects.toBeInstanceOf(IPScannerError);
          expect(calls).toHaveLength(0);
          return;
        }
        await pending;
        expect(calls).toHaveLength(1);
        const url = new URL(calls[0]!.url);
        expect(url.origin + url.pathname).toBe(calls[0]!.url);
        expect(url.pathname.startsWith(prefix) && url.pathname.endsWith(suffix)).toBe(true);
        const segment = url.pathname.slice(prefix.length, url.pathname.length - suffix.length);
        expect(segment).not.toContain('/');
        expect(decodeURIComponent(segment)).toBe(value);
      }),
      { numRuns: 500 },
    );
  });
});

describe('query strings', () => {
  const text = fc.oneof(fc.string({ unit: 'grapheme' }), fc.constantFrom('', ' ', '&', '=', '#', '?', '+', '%20', 'a&b=c'));
  const maybe = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });
  const date = fc.date({ noInvalidDate: true });

  const cases = fc.oneof(
    fc.tuple(text, maybe(fc.integer())).map(([q, limit]) => ({
      path: '/v1/asn/directory',
      query: { q, limit },
      call: (c: IPScanner) => c.asnDirectory.search(q, { limit }),
    })),
    fc.tuple(maybe(fc.integer()), maybe(fc.constantFrom('addresses' as const, 'prefixes' as const))).map(([top, by]) => ({
      path: '/v1/asn/directory',
      query: { top, by },
      call: (c: IPScanner) => c.asnDirectory.top({ top, by }),
    })),
    fc.tuple(maybe(fc.integer()), maybe(fc.integer()), maybe(text)).map(([limit, before, verdict]) => ({
      path: '/v1/ip/history',
      query: { limit, before, verdict },
      call: (c: IPScanner) => c.ip.history({ limit, before, verdict }),
    })),
    fc.tuple(maybe(fc.integer()), maybe(fc.integer())).map(([limit, before]) => ({
      path: '/v1/provenance/chain',
      query: { limit, before },
      call: (c: IPScanner) => c.provenance.chain({ limit, before }),
    })),
    fc.tuple(maybe(fc.oneof(text, date)), maybe(fc.oneof(text, date))).map(([from, to]) => ({
      path: '/v1/provenance/export',
      query: {
        from: from instanceof Date ? from.toISOString() : from,
        to: to instanceof Date ? to.toISOString() : to,
      },
      call: (c: IPScanner) => c.provenance.export({ from, to }),
    })),
  );

  it('decode back to exactly the values given, on the intended path', async () => {
    await fc.assert(
      fc.asyncProperty(cases, async ({ path, query, call }) => {
        const { client, calls } = mockClient([json(200, {})]);
        await call(client);
        const url = new URL(calls[0]!.url);
        expect(url.pathname).toBe(path);
        expect(url.hash).toBe('');
        const expected = Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]);
        expect([...url.searchParams].sort()).toEqual(expected.sort());
      }),
      { numRuns: 500 },
    );
  });
});

describe('request headers', () => {
  const text = fc.string({ unit: 'binary' });
  const visitorHeaders = fc.dictionary(text, text, { maxKeys: 6 });
  const wire = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

  it('carry visitor data only in the JSON body', async () => {
    await fc.assert(
      fc.asyncProperty(text, text, fc.option(text, { nil: undefined }), visitorHeaders, async (ip, ua, ja4, headers) => {
        const { client, calls } = mockClient([json(200, {})]);
        await client.agentscan.check({ ip, userAgent: ua, ja4, headers });
        await client.edge.check({ ip, userAgent: ua, ja4, headers });
        for (const call of calls) {
          expect([...call.headers.keys()].sort()).toEqual(['accept', 'authorization', 'content-type', 'user-agent']);
          expect(call.headers.get('authorization')).toBe('Bearer pk_test_123');
          expect(call.body).toEqual(wire({ ip, user_agent: ua, ja4, headers }));
        }
      }),
    );
  });

  it('never send the API key to gate.verify', async () => {
    await fc.assert(
      fc.asyncProperty(text, text, async (secret, token) => {
        const { client, calls } = mockClient([json(200, { success: true })]);
        await client.gate.verify({ secret, token });
        expect(calls[0]!.headers.has('authorization')).toBe(false);
        expect(calls[0]!.body).toEqual(wire({ secret, token }));
      }),
    );
  });

  it('send any API key as one Authorization value or fail before sending', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(text, fc.constantFrom(' ', 'pk_live_1\r\nX-Injected: 1', 'pk\0', ' pk_live_2 ')), async (apiKey) => {
        const sent: Request[] = [];
        const client = new IPScanner({
          apiKey,
          baseUrl: 'https://api.test',
          maxRetries: 0,
          fetch: async (url, init) => {
            const request = new Request(url, init);
            sent.push(request);
            return json(200, {});
          },
        });
        const key = apiKey.trim();
        const outcome = await client.account.limits().then(
          () => undefined,
          (error: unknown) => error,
        );
        if (outcome !== undefined) {
          expect(outcome).toBeInstanceOf(IPScannerError);
          expect(sent).toHaveLength(0);
          return;
        }
        const names = [...sent[0]!.headers.keys()].sort();
        expect(names).toEqual(key ? ['accept', 'authorization', 'user-agent'] : ['accept', 'user-agent']);
        if (key) expect(sent[0]!.headers.get('authorization')).toBe(`Bearer ${key}`);
      }),
    );
  });
});

describe('error responses', () => {
  const numberish = fc.oneof(
    fc.integer().map(String),
    fc.double().map(String),
    fc.date({ noInvalidDate: true }).map((d) => d.toUTCString()),
    fc.constantFrom('', ' ', '1e400', 'Infinity', '-0', '-30', '0x10', ' 12 ', 'soon'),
    fc.string({ unit: 'grapheme-ascii' }),
  );
  const headerNames = fc.constantFrom(
    'x-ratelimit-meter',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-ratelimit-daily-limit',
    'x-ratelimit-daily-remaining',
    'x-ratelimit-daily-reset',
    'x-ratelimit-hourly-limit',
    'x-ratelimit-hourly-remaining',
    'x-ratelimit-hourly-reset',
    'x-ratelimit-usage-percent',
    'x-quota-upgrade-url',
    'retry-after',
  );
  const body = fc.oneof(
    fc.string({ unit: 'binary' }),
    fc.jsonValue().map((v) => JSON.stringify(v)),
    fc
      .record(
        {
          error: fc.oneof(fc.string(), fc.jsonValue()),
          message: fc.oneof(fc.string(), fc.jsonValue()),
          retryAfter: fc.oneof(fc.double(), fc.jsonValue()),
          limit: fc.jsonValue(),
          details: fc.jsonValue(),
          upgrade: fc.jsonValue(),
        },
        { requiredKeys: [] },
      )
      .map((v) => JSON.stringify(v)),
  );

  it('decode any status, body and rate limit headers into the right error', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        fc.string({ unit: 'grapheme-ascii' }),
        body,
        fc.dictionary(headerNames, numberish),
        (status, statusText, text, headerValues) => {
          const err = errorFromResponse(status, statusText, text, new Headers(headerValues));
          expect(err).toBeInstanceOf(APIError);
          expect(err.status).toBe(status);
          if (status === 401 || status === 403) expect(err).toBeInstanceOf(AuthenticationError);
          else if (status === 404) expect(err).toBeInstanceOf(NotFoundError);
          else if (status === 429) expect(err).toBeInstanceOf(RateLimitError);
          else expect(err.constructor).toBe(APIError);
          expect(typeof err.message === 'string' && err.message.length > 0).toBe(true);
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {}
          const code = (parsed as { error?: unknown } | null)?.error;
          expect(err.code).toBe(
            typeof parsed === 'object' && !Array.isArray(parsed) && typeof code === 'string' ? code : `http_${status}`,
          );
          if (err.details !== undefined) expect(typeof err.details === 'object' && !Array.isArray(err.details)).toBe(true);
          if (!(err instanceof RateLimitError)) return;
          for (const value of Object.values(err.rateLimit)) {
            if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
          }
          const retryAfter = err.rateLimit.retryAfter;
          if (retryAfter !== undefined) expect(retryAfter).toBeGreaterThanOrEqual(0);
          for (const value of [err.retryAfter, err.limit, err.usage, err.remaining, err.needed]) {
            if (value !== undefined) expect(Number.isFinite(value)).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('bulk stream', () => {
  const event = fc.record(
    {
      type: fc.constantFrom('meta', 'result', 'error', 'done'),
      index: fc.nat(),
      total: fc.nat(),
      input: fc.string({ unit: 'grapheme' }),
      ip: fc.oneof(fc.ipV4(), fc.ipV6()),
      verdict: fc.string(),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
      anonymized: fc.boolean(),
      asnName: fc.string({ unit: 'grapheme' }),
      country: fc.string({ unit: 'grapheme', maxLength: 3 }),
      reason: fc.constantFrom('complete', 'cancelled', 'quota'),
      processed: fc.nat(),
      failed: fc.nat(),
      locked: fc.array(fc.oneof(fc.string(), fc.jsonValue())),
    },
    { requiredKeys: ['type'] },
  );

  function checkTypes(e: BulkEvent): void {
    for (const key of [
      'type',
      'input',
      'reason',
      'message',
      'error',
      'ip',
      'verdict',
      'classification',
      'vpnProvider',
      'grade',
      'asn',
      'asnName',
      'asnType',
      'country',
      'planRequired',
    ] as const) {
      expect(typeof e[key]).toBe('string');
    }
    for (const key of ['index', 'total', 'confidence', 'score', 'processed', 'failed', 'metered'] as const) {
      expect(typeof e[key]).toBe('number');
    }
    for (const key of ['anonymized', 'isTorExit', 'complete'] as const) expect(typeof e[key]).toBe('boolean');
    expect(e.locked.every((v) => typeof v === 'string')).toBe(true);
    if (e.complete) expect(e.type === 'done' && e.reason === 'complete').toBe(true);
  }

  it('decodes any line into a typed event or an IPScannerError', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ unit: 'binary' }),
          fc.jsonValue().map((v) => JSON.stringify(v)),
          event.map((e) => JSON.stringify(e)),
        ),
        (line) => {
          let parsed: BulkEvent;
          try {
            parsed = toBulkEvent(line);
          } catch (error) {
            expect(error).toBeInstanceOf(IPScannerError);
            return;
          }
          checkTypes(parsed);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('yields the same events however the stream is chunked', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(event, { minLength: 1, maxLength: 8 }),
        fc.array(fc.nat(), { maxLength: 12 }),
        fc.boolean(),
        async (events, cuts, trailingNewline) => {
          const text = events.map((e) => JSON.stringify(e)).join('\n') + (trailingNewline ? '\n' : '');
          const bytes = new TextEncoder().encode(text);
          const points = [0, ...cuts.map((c) => c % (bytes.length + 1)), bytes.length].sort((a, b) => a - b);
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              for (let i = 1; i < points.length; i++) controller.enqueue(bytes.slice(points[i - 1], points[i]));
              controller.close();
            },
          });
          const { client } = mockClient([() => new Response(body)]);
          const got: BulkEvent[] = [];
          for await (const e of client.bulk.stream({ ips: ['192.0.2.1'] })) got.push(e);
          expect(got).toEqual(events.map((e) => toBulkEvent(JSON.stringify(e))));
        },
      ),
    );
  });
});

describe('retries', () => {
  const failure = fc.constantFrom(502, 503, 504, 'network' as const);
  const outcome = fc.oneof(failure, fc.constantFrom(200, 404, 429, 500));
  const outcomes = fc
    .tuple(fc.array(failure, { maxLength: 45, size: 'max' }), fc.array(outcome, { maxLength: 5 }))
    .map(([streak, rest]) => [...streak, ...rest]);
  const retryable = (o: number | 'network') => o === 'network' || o === 502 || o === 503 || o === 504;

  it('retry only failed GETs, at most maxRetries times, with a bounded growing backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        outcomes,
        fc.integer({ min: 0, max: 40 }),
        fc.boolean(),
        async (outcomes, maxRetries, post) => {
          vi.useFakeTimers();
          const at: number[] = [];
          const { client } = mockClient(
            [
              () => {
                const o = outcomes[at.length] ?? 200;
                at.push(Date.now());
                if (o === 'network') throw new TypeError('fetch failed');
                return json(o, o === 200 ? { ok: true } : { error: 'server_error', message: 'down' });
              },
            ],
            { maxRetries },
          );
          const pending = (post ? client.ip.lookup('192.0.2.1') : client.account.limits()).then(
            () => undefined,
            (error: unknown) => error,
          );
          await vi.runAllTimersAsync();
          const result = await pending;
          vi.useRealTimers();

          const retries = post ? 0 : maxRetries;
          let attempts = 1;
          while (attempts - 1 < retries && retryable(outcomes[attempts - 1] ?? 200)) attempts++;
          expect(at).toHaveLength(attempts);
          const last = outcomes[attempts - 1] ?? 200;
          if (last === 200) expect(result).toBeUndefined();
          else if (last === 'network') expect(result).toBeInstanceOf(ConnectionError);
          else expect(result).toMatchObject({ status: last });

          const waits = at.slice(1).map((t, i) => t - at[i]!);
          waits.forEach((wait, i) => {
            expect(wait).toBeGreaterThanOrEqual(500);
            expect(wait).toBeLessThanOrEqual(30_000);
            if (i > 0) expect(wait).toBeGreaterThanOrEqual(waits[i - 1]!);
          });
        },
      ),
    );
  });
});

describe('timeouts', () => {
  const slow = (_: unknown, init: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(json(200, { ok: true })), 5);
      init.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });

  it('never fire before a generous timeout, however large', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: 1_000, max: 2 ** 31 - 1 }),
          fc.double({ min: 2 ** 31 - 1, noNaN: true }),
          fc.constantFrom(2 ** 31, 2 ** 32, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Infinity),
        ),
        fc.boolean(),
        async (timeout, perRequest) => {
          const { client } = mockClient([slow], perRequest ? { maxRetries: 0 } : { timeout, maxRetries: 0 });
          await expect(client.account.limits(perRequest ? { timeout } : undefined)).resolves.toEqual({ ok: true });
        },
      ),
      { numRuns: 40 },
    );
  });
});
