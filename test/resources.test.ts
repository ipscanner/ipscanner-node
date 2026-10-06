import { describe, expect, it } from 'vitest';
import { json, mockClient } from './helpers';

describe('resources', () => {
  it('sends snake_case bodies for agentscan.check', async () => {
    const { client, calls } = mockClient([json(200, { class: 'human' })]);
    await client.agentscan.check({
      ip: '1.2.3.4',
      userAgent: 'curl/8',
      ja4: 't13d',
      headers: { accept: '*/*' },
      headlessFlags: { webdriver: true },
      requestId: 'req-1',
    });
    expect(calls[0]!.url).toBe('https://api.test/v1/agentscan/check');
    expect(calls[0]!.body).toEqual({
      ip: '1.2.3.4',
      user_agent: 'curl/8',
      ja4: 't13d',
      headers: { accept: '*/*' },
      headless_flags: { webdriver: true },
      request_id: 'req-1',
    });
  });

  it('drops omitted optional fields from bodies', async () => {
    const { client, calls } = mockClient([json(200, {})]);
    await client.agentscan.check({ ip: '1.2.3.4' });
    expect(calls[0]!.body).toEqual({ ip: '1.2.3.4' });
  });

  it('sends snake_case lines for agentscan.batch', async () => {
    const { client, calls } = mockClient([json(200, { results: [] })]);
    await client.agentscan.batch([
      { line: 1, ip: '1.2.3.4', userAgent: 'GPTBot/1.0' },
      { line: 2, ip: '5.6.7.8', ja4: 'x', headers: { a: 'b' } },
    ]);
    expect(calls[0]!.body).toEqual({
      lines: [
        { line: 1, ip: '1.2.3.4', user_agent: 'GPTBot/1.0' },
        { line: 2, ip: '5.6.7.8', ja4: 'x', headers: { a: 'b' } },
      ],
    });
  });

  it('sends snake_case bodies for verify, selfCheck and provenance.check', async () => {
    const { client, calls } = mockClient([json(200, {})]);
    await client.agentscan.verify({ ip: '66.249.66.1', userAgent: 'Googlebot' });
    await client.agentscan.selfCheck();
    await client.agentscan.selfCheck({ userAgent: 'x' });
    await client.provenance.check({ ip: '1.2.3.4', claimedJurisdiction: 'EU', requestContext: { path: '/' } });
    expect(calls.map((c) => c.body)).toEqual([
      { ip: '66.249.66.1', user_agent: 'Googlebot' },
      {},
      { user_agent: 'x' },
      { ip: '1.2.3.4', claimed_jurisdiction: 'EU', request_context: { path: '/' } },
    ]);
  });

  it('builds query strings and skips undefined values', async () => {
    const { client, calls } = mockClient([json(200, {})]);
    await client.ip.history({ limit: 10, verdict: 'dirty' });
    await client.ip.history();
    await client.provenance.chain({ limit: 50, before: 99 });
    await client.asnDirectory.top({ top: 5, by: 'prefixes' });
    await client.asnDirectory.search('comcast', { limit: 3 });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.test/v1/ip/history?limit=10&verdict=dirty',
      'https://api.test/v1/ip/history',
      'https://api.test/v1/provenance/chain?limit=50&before=99',
      'https://api.test/v1/asn/directory?top=5&by=prefixes',
      'https://api.test/v1/asn/directory?q=comcast&limit=3',
    ]);
  });

  it('accepts an AS-prefixed number for asnDirectory.get', async () => {
    const { client, calls } = mockClient([json(200, { asn: 15169 })]);
    await client.asnDirectory.get('AS15169');
    await client.asnDirectory.get(13335);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.test/v1/asn/directory/15169',
      'https://api.test/v1/asn/directory/13335',
    ]);
  });

  it('routes every resource to the right endpoint', async () => {
    const { client, calls } = mockClient([json(200, {})]);
    await client.ip.proxy('1.1.1.1');
    await client.ip.asn('1.1.1.1');
    await client.ip.whois('example.com');
    await client.ip.myip();
    await client.agentscan.allowlist();
    await client.provenance.verifyAnchored();
    await client.provenance.jurisdictions();
    await client.account.limits();
    await client.account.usage();
    await client.crawlers.list();
    expect(calls.map((c) => `${c.method} ${c.url.replace('https://api.test', '')}`)).toEqual([
      'GET /v1/proxy/1.1.1.1',
      'GET /v1/asn/1.1.1.1',
      'GET /v1/whois/example.com',
      'GET /v1/myip',
      'GET /v1/agentscan/allowlist',
      'POST /v1/provenance/verify',
      'GET /v1/provenance/jurisdictions',
      'GET /v1/user/limits',
      'GET /v1/usage/summary',
      'GET /v1/crawlers',
    ]);
    expect(calls[5]!.body).toEqual({});
  });

  it('returns provenance.export as raw CSV', async () => {
    const csv = 'id,ts,ip\n1,2026-10-01T00:00:00Z,1.2.3.4\n';
    const { client, calls } = mockClient([new Response(csv, { headers: { 'Content-Type': 'text/csv' } })]);
    const out = await client.provenance.export({ from: '2026-10-01', to: new Date('2026-10-02T00:00:00Z') });
    expect(out).toBe(csv);
    expect(calls[0]!.url).toBe(
      'https://api.test/v1/provenance/export?from=2026-10-01&to=2026-10-02T00%3A00%3A00.000Z',
    );
    expect(calls[0]!.headers.get('accept')).toBe('text/csv');
  });
});
