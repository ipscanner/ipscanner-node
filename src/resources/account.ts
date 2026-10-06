import type { IPScanner } from '../client';
import type { LimitsResponse, RequestOptions, UsageResponse } from '../types';

export class Account {
  constructor(private readonly client: IPScanner) {}

  limits(options?: RequestOptions): Promise<LimitsResponse> {
    return this.client.request({ method: 'GET', path: '/v1/user/limits', options });
  }

  usage(options?: RequestOptions): Promise<UsageResponse> {
    return this.client.request({ method: 'GET', path: '/v1/usage/summary', options });
  }
}
