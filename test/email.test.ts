import { describe, expect, it } from 'vitest';
import type { EmailCheck, GateVerifyResponse, ProxyResponse, VpnResponse } from '../src/index';
import { VERSION } from '../src/index';
import { json, mockClient } from './helpers';

describe('email', () => {
  it('posts email.check with the key and decodes the answer', async () => {
    const answer = {
      email: 'jane@outlok.com',
      status: 'risky',
      reason: 'typo',
      suggestion: 'jane@outlook.com',
      domain: 'outlok.com',
      checks: { syntax: true, mx: null, disposable: false, role: false, freeProvider: false },
      mailbox: 'not_checked',
    };
    const { client, calls } = mockClient([json(200, answer)]);
    const out: EmailCheck = await client.email.check('jane@outlok.com');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.test/v1/email/check');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer pk_test_123');
    expect(calls[0]!.body).toEqual({ email: 'jane@outlok.com' });
    expect(out.suggestion).toBe('jane@outlook.com');
    expect(out.checks.mx).toBeNull();
  });

  it('sends the email on gate.verify and decodes the email object', async () => {
    const { client, calls } = mockClient([json(200, {
      success: true, class: 'human', action: 'block', mode: 'enforce', confidence: 0.6,
      network: { classification: 'residential_clean', anonymized: false, provider: null, vpn_provider: null },
      signals: [], hostname: 'example.com', issued_at: '2026-10-14T10:00:00Z', ip_match: true,
      email: { status: 'risky', reason: 'disposable', suggestion: null, domain: 'mailinator.com', action: 'block' },
    })]);
    const out: GateVerifyResponse = await client.gate.verify({ secret: 'gs_x', token: 't', email: 'x@mailinator.com' });
    expect(calls[0]!.body).toEqual({ secret: 'gs_x', token: 't', email: 'x@mailinator.com' });
    expect(out.email?.action).toBe('block');
    expect(out.email?.reason).toBe('disposable');
  });

  it('types purity and the locked count on vpn and proxy', async () => {
    const { client } = mockClient([
      json(200, {
        ip: '1.2.3.4', isVpn: true, isTor: false, networkClass: 'vpn', anonymized: true, provider: 'M247', vpnProvider: 'NordVPN',
        riskScore: 90, purity: { score: 40, grade: 'C', verdict: 'dirty', deductions: [{ factor: 'vpn_range', points: 30, detail: 'x' }] },
      }),
    ]);
    const v: VpnResponse = await client.ip.vpn('1.2.3.4');
    expect(v.purity?.deductions).toHaveLength(1);
    const locked = mockClient([json(200, {
      ip: '5.6.7.8', isProxy: false, isTor: false, networkClass: 'hosting', anonymized: true, provider: null, vpnProvider: null,
      riskScore: 60, purity: null, deductionCount: 3, locked: ['purity', 'provider', 'vpnProvider'], planRequired: 'Starter',
    })]);
    const p: ProxyResponse = await locked.client.ip.proxy('5.6.7.8');
    expect(p.purity).toBeNull();
    expect(p.deductionCount).toBe(3);
  });

  it('identifies as 0.3.0', async () => {
    const { client, calls } = mockClient([json(200, { email: 'a@b.io', status: 'valid' })]);
    await client.email.check('a@b.io');
    expect(VERSION).toBe('0.3.0');
    expect(calls[0]!.headers.get('user-agent')).toBe('ipscanner-node/0.3.0');
  });
});
