import type { IPScanner } from '../client';
import type {
  AgentscanBatchLine,
  AgentscanBatchResponse,
  AgentscanCheckParams,
  AgentscanCheckResponse,
  AgentscanSelfParams,
  AgentscanSelfResponse,
  AgentscanVerifyParams,
  AgentscanVerifyResponse,
  AllowlistResponse,
  RequestOptions,
} from '../types';

export class Agentscan {
  constructor(private readonly client: IPScanner) {}

  /** Classify one request as human, known bot, AI agent or malicious automation. */
  check(params: AgentscanCheckParams, options?: RequestOptions): Promise<AgentscanCheckResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/agentscan/check',
      body: {
        ip: params.ip,
        user_agent: params.userAgent,
        ja4: params.ja4,
        headers: params.headers,
        headless_flags: params.headlessFlags,
        request_id: params.requestId,
      },
      options,
    });
  }

  /** Classify up to 25000 parsed access-log lines. */
  batch(lines: AgentscanBatchLine[], options?: RequestOptions): Promise<AgentscanBatchResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/agentscan/batch',
      body: {
        lines: lines.map((l) => ({
          line: l.line,
          ip: l.ip,
          user_agent: l.userAgent,
          ja4: l.ja4,
          headers: l.headers,
        })),
      },
      options,
    });
  }

  /** Check a crawler claim against what its operator publishes. Pass bot or userAgent. */
  verify(params: AgentscanVerifyParams, options?: RequestOptions): Promise<AgentscanVerifyResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/agentscan/verify',
      body: { ip: params.ip, bot: params.bot, user_agent: params.userAgent },
      options,
    });
  }

  allowlist(options?: RequestOptions): Promise<AllowlistResponse> {
    return this.client.request({ method: 'GET', path: '/v1/agentscan/allowlist', options });
  }

  /** Classify the calling connection, or the values given. Not metered. */
  selfCheck(params: AgentscanSelfParams = {}, options?: RequestOptions): Promise<AgentscanSelfResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/agentscan/self',
      body: { ip: params.ip, user_agent: params.userAgent, headers: params.headers, ja4: params.ja4 },
      options,
    });
  }
}
