import type { IPScanner } from '../client';
import type {
  AsnResponse,
  GeolocationResponse,
  HistoryParams,
  HistoryResponse,
  LookupResult,
  MyIpResponse,
  ProxyResponse,
  RequestOptions,
  VpnResponse,
  WhoisResult,
} from '../types';

export class IP {
  constructor(private readonly client: IPScanner) {}

  /** Full lookup for an IPv4, IPv6, CIDR or hostname target. */
  lookup(target: string, options?: RequestOptions): Promise<LookupResult> {
    return this.client.request({ method: 'POST', path: '/v1/ip/lookup', body: { target }, options });
  }

  vpn(ip: string, options?: RequestOptions): Promise<VpnResponse> {
    return this.client.request({ method: 'GET', path: `/v1/vpn/${encodeURIComponent(ip)}`, options });
  }

  proxy(ip: string, options?: RequestOptions): Promise<ProxyResponse> {
    return this.client.request({ method: 'GET', path: `/v1/proxy/${encodeURIComponent(ip)}`, options });
  }

  geo(ip: string, options?: RequestOptions): Promise<GeolocationResponse> {
    return this.client.request({ method: 'GET', path: `/v1/geo/${encodeURIComponent(ip)}`, options });
  }

  asn(ip: string, options?: RequestOptions): Promise<AsnResponse> {
    return this.client.request({ method: 'GET', path: `/v1/asn/${encodeURIComponent(ip)}`, options });
  }

  whois(domain: string, options?: RequestOptions): Promise<WhoisResult> {
    return this.client.request({ method: 'GET', path: `/v1/whois/${encodeURIComponent(domain)}`, options });
  }

  /** Recent lookups made with this account, newest first. */
  history(params: HistoryParams = {}, options?: RequestOptions): Promise<HistoryResponse> {
    return this.client.request({
      method: 'GET',
      path: '/v1/ip/history',
      query: { limit: params.limit, before: params.before, verdict: params.verdict },
      options,
    });
  }

  /** Keyless demo lookup, rate limited per caller IP. */
  demo(ip: string, options?: RequestOptions): Promise<LookupResult> {
    return this.client.request({ method: 'GET', path: `/v1/demo/${encodeURIComponent(ip)}`, options });
  }

  /** The caller's own public address, located. Keyless. */
  myip(options?: RequestOptions): Promise<MyIpResponse> {
    return this.client.request({ method: 'GET', path: '/v1/myip', options });
  }
}
