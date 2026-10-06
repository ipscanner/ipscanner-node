import type { IPScanner } from '../client';
import type {
  ChainParams,
  ChainResponse,
  ExportParams,
  JurisdictionsResponse,
  ProvenanceCheckParams,
  ProvenanceCheckResponse,
  ProvenanceVerifyAnchoredResponse,
  ProvenanceVerifyResponse,
  RequestOptions,
} from '../types';

export class Provenance {
  constructor(private readonly client: IPScanner) {}

  /** Classify an address against a jurisdiction policy and write an attestation. */
  check(params: ProvenanceCheckParams, options?: RequestOptions): Promise<ProvenanceCheckResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/provenance/check',
      body: {
        ip: params.ip,
        claimed_jurisdiction: params.claimedJurisdiction,
        request_context: params.requestContext,
      },
      options,
    });
  }

  /** Recompute the whole attestation chain. */
  verify(options?: RequestOptions): Promise<ProvenanceVerifyResponse> {
    return this.client.request({ method: 'GET', path: '/v1/provenance/verify', options });
  }

  /** Verify the chain and return the latest daily anchor. */
  verifyAnchored(options?: RequestOptions): Promise<ProvenanceVerifyAnchoredResponse> {
    return this.client.request({ method: 'POST', path: '/v1/provenance/verify', body: {}, options });
  }

  chain(params: ChainParams = {}, options?: RequestOptions): Promise<ChainResponse> {
    return this.client.request({
      method: 'GET',
      path: '/v1/provenance/chain',
      query: { limit: params.limit, before: params.before },
      options,
    });
  }

  jurisdictions(options?: RequestOptions): Promise<JurisdictionsResponse> {
    return this.client.request({ method: 'GET', path: '/v1/provenance/jurisdictions', options });
  }

  /** Attestations as CSV text. */
  export(params: ExportParams = {}, options?: RequestOptions): Promise<string> {
    return this.client.requestText({
      method: 'GET',
      path: '/v1/provenance/export',
      query: { from: dateParam(params.from), to: dateParam(params.to) },
      accept: 'text/csv',
      options,
    });
  }
}

function dateParam(value: string | Date | undefined): string | undefined {
  return value instanceof Date ? value.toISOString() : value;
}
