import { describe, expect, it } from 'vitest';
import { APIError, AuthenticationError, NotFoundError, RateLimitError } from '../src/index';
import { json, mockClient } from './helpers';

describe('errors', () => {
  it('maps 401 and 403 to AuthenticationError', async () => {
    const { client } = mockClient([json(401, { error: 'invalid_api_key', message: 'Invalid API key' })]);
    const err = await client.account.limits().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err).toMatchObject({ status: 401, code: 'invalid_api_key', message: 'Invalid API key' });

    const suspended = mockClient([json(403, { error: 'account_suspended', message: 'Suspended' })]);
    await expect(suspended.client.account.usage()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('maps 404 to NotFoundError', async () => {
    const { client } = mockClient([json(404, { error: 'not_found', message: 'No such ASN' })]);
    const err = await client.asnDirectory.get('AS99999999').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(APIError);
    expect(err).toMatchObject({ code: 'not_found' });
  });

  it('exposes details on bulk 400s', async () => {
    const body = { error: 'bad_request', message: 'No valid IP addresses found', details: { invalid: ['nope'] } };
    const { client } = mockClient([json(400, body)]);
    const err = (await client.bulk.check({ ips: ['nope'] }).catch((e: unknown) => e)) as APIError;
    expect(err.code).toBe('bad_request');
    expect(err.details).toEqual({ invalid: ['nope'] });
    expect(err.body).toEqual(body);
  });

  it('handles non-JSON error bodies', async () => {
    const { client } = mockClient([new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })], {
      maxRetries: 0,
    });
    const err = (await client.ip.vpn('1.1.1.1').catch((e: unknown) => e)) as APIError;
    expect(err).toBeInstanceOf(APIError);
    expect(err.code).toBe('http_502');
    expect(err.message).toBe('Bad Gateway');
    expect(err.body).toBe('<html>bad gateway</html>');
  });

  it('parses the quota 429 body', async () => {
    const body = {
      error: 'rate_limit_exceeded',
      reason: 'insufficient_for_batch',
      message: 'This batch needs 500 lookups and 400 are left.',
      meter: 'request',
      plan: 'Starter',
      limit: 150000,
      usage: 149600,
      remaining: 400,
      needed: 500,
      resetDate: '2026-11-01',
      resetAt: '2026-11-01T00:00:00Z',
      retryAfter: 3600,
      softBlock: false,
      upgrade: { recommendedPlan: 'Pro', url: 'https://ipscanner.io/pricing', message: 'Upgrade' },
    };
    const { client } = mockClient([
      json(429, body, {
        'Retry-After': '60',
        'X-RateLimit-Limit': '150000',
        'X-RateLimit-Remaining': '400',
        'X-RateLimit-Meter': 'request',
        'X-Quota-Upgrade-Plan': 'Pro',
      }),
    ]);
    const err = (await client.bulk.check({ ips: ['1.1.1.1'] }).catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).toMatchObject({
      status: 429,
      code: 'rate_limit_exceeded',
      reason: 'insufficient_for_batch',
      retryAfter: 3600,
      resetAt: '2026-11-01T00:00:00Z',
      limit: 150000,
      usage: 149600,
      remaining: 400,
      needed: 500,
      plan: 'Starter',
      upgradeUrl: 'https://ipscanner.io/pricing',
    });
    expect(err.rateLimit).toEqual({
      meter: 'request',
      limit: 150000,
      remaining: 400,
      upgradePlan: 'Pro',
      retryAfter: 60,
    });
  });

  it('falls back to the Retry-After header', async () => {
    const { client } = mockClient([
      json(429, { error: 'rate_limit_exceeded', message: 'Too many requests' }, { 'Retry-After': '30' }),
    ]);
    const err = (await client.ip.demo('1.1.1.1').catch((e: unknown) => e)) as RateLimitError;
    expect(err.retryAfter).toBe(30);
    expect(err.reason).toBeUndefined();
    expect(err.needed).toBeUndefined();
  });

  it('falls back to the upgrade url header', async () => {
    const { client } = mockClient([
      json(429, { error: 'rate_limit_exceeded', message: 'x' }, { 'X-Quota-Upgrade-Url': 'https://ipscanner.io/up' }),
    ]);
    const err = (await client.ip.lookup('1.1.1.1').catch((e: unknown) => e)) as RateLimitError;
    expect(err.upgradeUrl).toBe('https://ipscanner.io/up');
    expect(err.retryAfter).toBeUndefined();
  });
});
