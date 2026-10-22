import type { IPScanner } from '../client';
import { pathParam } from '../path';
import type { RequestOptions, SitePolicyResponse } from '../types';

export class Sites {
  constructor(private readonly client: IPScanner) {}

  /** The policy a site enforces. Not metered. */
  async policy(id: string, options?: RequestOptions): Promise<SitePolicyResponse> {
    return this.client.request({ method: 'GET', path: `/v1/sites/${pathParam(id)}/policy`, options });
  }
}
