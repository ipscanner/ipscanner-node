import type { IPScanner } from '../client';
import type { CrawlersResponse, RequestOptions } from '../types';

export class Crawlers {
  constructor(private readonly client: IPScanner) {}

  /** Crawlers that can be verified, and how. Keyless. */
  list(options?: RequestOptions): Promise<CrawlersResponse> {
    return this.client.request({ method: 'GET', path: '/v1/crawlers', options });
  }
}
