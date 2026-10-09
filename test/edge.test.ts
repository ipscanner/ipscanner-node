import { describe, expect, it } from 'vitest';
import type { EdgeCheckResponse, GateVerifyResponse, SitePolicyResponse } from '../src/index';
import { json, mockClient } from './helpers';

describe('edge, sites and gate', () => {
  it('sends edge.check as a snake_case POST and decodes the answer', async () => {
    const answer = {
      class: 'vpn',
      agent: { class: 'human', confidence: 0.8, action: 'allow', signals: { scripted_client: '' } },
      network: {
        networkClass: 'vpn',
        anonymized: true,
        riskScore: 80,
        provider: 'M247',
        vpnProvider: 'Mullvad',
        evidence: ['vpn_server_list'],
        country: 'SE',
        asn: 9009,
        asnName: 'M247 Europe SRL',
      },
      site: { id: 'site_abc', mode: 'enforce', policyVersion: 3 },
      somethingNew: 1,
    };
    const { client, calls } = mockClient([json(200, answer)]);
    const out: EdgeCheckResponse = await client.edge.check({
      ip: '185.65.135.1',
      site: 'site_abc',
      userAgent: 'Mozilla/5.0',
      headlessFlags: { webdriver: false },
      requestId: 'req-9',
    });

    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.test/v1/edge/check');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer pk_test_123');
    expect(calls[0]!.body).toEqual({
      site: 'site_abc',
      ip: '185.65.135.1',
      user_agent: 'Mozilla/5.0',
      headless_flags: { webdriver: false },
      request_id: 'req-9',
    });
    expect(out.class).toBe('vpn');
    expect(out.network?.vpnProvider).toBe('Mullvad');
    expect(out.network?.evidence).toEqual(['vpn_server_list']);
    expect(out.network?.asn).toBe(9009);
    expect(out.site).toEqual({ id: 'site_abc', mode: 'enforce', policyVersion: 3 });
    expect(out.locked).toBeUndefined();
  });

  it('decodes a degraded, locked edge answer', async () => {
    const { client } = mockClient([
      json(200, {
        class: 'relay',
        agent: null,
        network: { networkClass: 'relay', anonymized: true, riskScore: 40, provider: null, vpnProvider: null },
        site: null,
        degraded: ['agent'],
        locked: ['network.provider', 'network.vpnProvider'],
        planRequired: 'Starter',
      }),
    ]);
    const out = await client.edge.check({ ip: '172.224.226.1' });
    expect(out.agent).toBeNull();
    expect(out.site).toBeNull();
    expect(out.degraded).toEqual(['agent']);
    expect(out.network).toMatchObject({ networkClass: 'relay', provider: null, vpnProvider: null });
    expect(out.locked).toEqual(['network.provider', 'network.vpnProvider']);
    expect(out.planRequired).toBe('Starter');
  });

  it('gets sites.policy with an escaped id', async () => {
    const body = {
      site: 'site abc',
      mode: 'monitor',
      policy: { verified_bot: 'allow', vpn: 'flag', malicious_automation: 'block' },
      version: 4,
      updatedAt: '2026-10-09T10:00:00.123456789Z',
    };
    const { client, calls } = mockClient([json(200, body)]);
    const out: SitePolicyResponse = await client.sites.policy('site abc');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.test/v1/sites/site%20abc/policy');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer pk_test_123');
    expect(out).toEqual(body);
  });

  it('posts gate.verify without the API key and decodes the wire names', async () => {
    const answer = {
      success: true,
      class: 'human',
      action: 'allow',
      mode: 'enforce',
      confidence: 0.912,
      network: { classification: 'vpn', anonymized: true, provider: null, vpn_provider: null },
      signals: ['vpn_server_list'],
      hostname: 'shop.example.com',
      issued_at: '2026-10-09T10:00:00Z',
      ip_match: false,
      locked: ['network.provider', 'network.vpn_provider'],
      planRequired: 'Starter',
    };
    const { client, calls } = mockClient([json(200, answer)]);
    const out: GateVerifyResponse = await client.gate.verify({
      secret: 'gs_secret',
      token: 'tok',
      remoteIp: '203.0.113.7',
    });

    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.test/v1/gate/verify');
    expect(calls[0]!.headers.has('authorization')).toBe(false);
    expect(calls[0]!.headers.get('content-type')).toBe('application/json');
    expect(calls[0]!.body).toEqual({ secret: 'gs_secret', token: 'tok', remote_ip: '203.0.113.7' });
    expect(out.ip_match).toBe(false);
    expect(out.issued_at).toBe('2026-10-09T10:00:00Z');
    expect(out.network.vpn_provider).toBeNull();
    expect(out.locked).toEqual(['network.provider', 'network.vpn_provider']);

    await client.gate.verify({ secret: 'gs_secret', token: 'tok2' });
    expect(calls[1]!.body).toEqual({ secret: 'gs_secret', token: 'tok2' });
  });

  it('never retries gate.verify', async () => {
    const { client, calls } = mockClient([
      json(503, { success: false, error: 'unavailable', message: 'Try again' }),
      json(200, { success: true }),
    ]);
    await expect(client.gate.verify({ secret: 'gs_x', token: 't' })).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
    });
    expect(calls).toHaveLength(1);
  });
});
