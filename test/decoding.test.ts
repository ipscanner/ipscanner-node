import { describe, expect, it } from 'vitest';
import type { BulkCheckResponse, LookupResult, VpnResponse, WhoisResult } from '../src/index';
import { json, mockClient } from './helpers';

describe('response decoding', () => {
  it('decodes a locked Free lookup with null premium fields', async () => {
    const body = {
      target: { raw: '1.1.1.1', kind: 'ipv4', ip: '1.1.1.1' },
      reserved: { reserved: false },
      verdict: { classification: 'hosting', anonymized: true, confidence: 0.9, method: 'range', evidence: ['known_infra'] },
      purity: null,
      networkClass: 'hosting',
      isVpn: false,
      isProxy: false,
      isTor: false,
      provider: null,
      vpnProvider: null,
      riskScore: 30,
      geo: {
        ip: '1.1.1.1',
        country: 'Australia',
        countryCode: 'AU',
        city: '',
        region: '',
        postalCode: null,
        latitude: null,
        longitude: null,
        timezone: 'Australia/Sydney',
        accuracyRadius: null,
      },
      at: '2026-10-09T10:00:00.123456789Z',
      locked: ['purity', 'provider', 'vpnProvider', 'geo.latitude', 'geo.longitude', 'geo.postalCode', 'geo.accuracyRadius'],
      planRequired: 'Starter',
    };
    const { client } = mockClient([json(200, body)]);
    const out: LookupResult = await client.ip.lookup('1.1.1.1');
    expect(out.purity).toBeNull();
    expect(out.provider).toBeNull();
    expect(out.vpnProvider).toBeNull();
    expect(out.geo?.latitude).toBeNull();
    expect(out.geo?.accuracyRadius).toBeNull();
    expect(out.verdict.evidence).toEqual(['known_infra']);
    expect(out.locked).toContain('geo.postalCode');
    expect(out.planRequired).toBe('Starter');
  });

  it('decodes whoisStatus on a hostname lookup and on whois', async () => {
    const { client } = mockClient([
      json(200, {
        target: { raw: 'example.com', kind: 'hostname', ip: '93.184.216.34', hostname: 'example.com' },
        networkClass: 'future_class',
        vpnProvider: null,
        whoisStatus: 'timeout',
        degraded: ['whois'],
      }),
      json(200, {
        domain: 'example.com',
        registrar: '',
        registeredOn: '',
        expiresOn: '',
        lastUpdated: '',
        nameservers: [],
        status: [],
        privacyProtection: false,
        whoisStatus: 'unavailable',
      }),
    ]);
    const lookup = await client.ip.lookup('example.com');
    expect(lookup.whoisStatus).toBe('timeout');
    expect(lookup.whois).toBeUndefined();
    expect(lookup.networkClass).toBe('future_class');

    const whois: WhoisResult = await client.ip.whois('example.com');
    expect(whois.whoisStatus).toBe('unavailable');
    expect(whois.nameservers).toEqual([]);
  });

  it('decodes vpnProvider and evidence on vpn', async () => {
    const body: VpnResponse = {
      ip: '185.65.135.1',
      isVpn: true,
      isTor: false,
      networkClass: 'vpn',
      anonymized: true,
      provider: 'M247',
      vpnProvider: 'Mullvad',
      riskScore: 80,
      evidence: ['vpn_server_list', 'vpn_operator'],
    };
    const { client } = mockClient([json(200, body)]);
    expect(await client.ip.vpn('185.65.135.1')).toEqual(body);
  });

  it('decodes locked bulk rows', async () => {
    const { client } = mockClient([
      json(200, {
        submitted: 1,
        unique: 1,
        duplicates: 0,
        invalid: [],
        summary: {},
        results: [
          {
            input: '185.65.135.1',
            ip: '185.65.135.1',
            score: null,
            grade: null,
            verdict: null,
            classification: 'vpn',
            confidence: 0.95,
            anonymized: true,
            vpnProvider: null,
            isTorExit: false,
            inVpnRange: true,
            inDatacenterRange: false,
            deductions: null,
            locked: ['score', 'grade', 'verdict', 'deductions', 'vpnProvider'],
          },
        ],
        planRequired: 'Starter',
      }),
    ]);
    const out: BulkCheckResponse = await client.bulk.check({ ips: ['185.65.135.1'] });
    const row = out.results[0]!;
    expect(row.score).toBeNull();
    expect(row.grade).toBeNull();
    expect(row.deductions).toBeNull();
    expect(row.vpnProvider).toBeNull();
    expect(row.locked).toEqual(['score', 'grade', 'verdict', 'deductions', 'vpnProvider']);
    expect(out.planRequired).toBe('Starter');
    expect(out.summary).toEqual({});
  });

  it('decodes Sponsored account type and the scripted_client signal', async () => {
    const { client } = mockClient([
      json(200, { accountType: 'Sponsored', limit: 500000, usage: 1, remaining: 499999, resetDate: '2026-11-01', daily: null, hourly: null }),
      json(200, { class: 'ai_agent', confidence: 0.7, action: 'flag', signals: { scripted_client: 'python-requests' } }),
    ]);
    expect((await client.account.limits()).accountType).toBe('Sponsored');
    expect((await client.agentscan.check({ ip: '1.2.3.4' })).signals.scripted_client).toBe('python-requests');
  });
});
