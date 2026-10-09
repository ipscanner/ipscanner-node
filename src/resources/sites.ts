import type { IPScanner } from '../client';
import type { RequestOptions, SitePolicyResponse } from '../types';

export class Sites {
  constructor(private readonly client: IPScanner) {}

  /** The policy a site enforces. Not metered. */
  policy(id: string, options?: RequestOptions): Promise<SitePolicyResponse> {
    return this.client.request({ method: 'GET', path: `/v1/sites/${encodeURIComponent(id)}/policy`, options });
  }
}
