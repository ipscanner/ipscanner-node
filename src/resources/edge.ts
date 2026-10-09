import type { IPScanner } from '../client';
import type { EdgeCheckParams, EdgeCheckResponse, RequestOptions } from '../types';

export class Edge {
  constructor(private readonly client: IPScanner) {}

  /** Agentscan verdict, network check and traffic class for one visitor. Metered as 2 requests. */
  check(params: EdgeCheckParams, options?: RequestOptions): Promise<EdgeCheckResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/edge/check',
      body: {
        site: params.site,
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
}
