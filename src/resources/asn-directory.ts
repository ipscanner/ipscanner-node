import type { IPScanner } from '../client';
import type {
  AsnDetail,
  AsnSearchParams,
  AsnSearchResponse,
  AsnTopParams,
  AsnTopResponse,
  RequestOptions,
} from '../types';

export class AsnDirectory {
  constructor(private readonly client: IPScanner) {}

  /** The largest networks by announced addresses or prefixes. Keyless. */
  top(params: AsnTopParams = {}, options?: RequestOptions): Promise<AsnTopResponse> {
    return this.client.request({
      method: 'GET',
      path: '/v1/asn/directory',
      query: { top: params.top, by: params.by },
      options,
    });
  }

  /** Search autonomous systems by name or number. Keyless. */
  search(q: string, params: AsnSearchParams = {}, options?: RequestOptions): Promise<AsnSearchResponse> {
    return this.client.request({
      method: 'GET',
      path: '/v1/asn/directory',
      query: { q, limit: params.limit },
      options,
    });
  }

  /** One autonomous system. Accepts 15169 or "AS15169". Keyless. */
  get(asn: number | string, options?: RequestOptions): Promise<AsnDetail> {
    const value = String(asn).trim().replace(/^as/i, '');
    return this.client.request({ method: 'GET', path: `/v1/asn/directory/${encodeURIComponent(value)}`, options });
  }
}
