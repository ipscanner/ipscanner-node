import type { IPScanner } from '../client';
import type { GateVerifyParams, GateVerifyResponse, RequestOptions } from '../types';

export class Gate {
  constructor(private readonly client: IPScanner) {}

  /** Redeem a gate token with the site secret. Sends no API key and is never retried. */
  verify(params: GateVerifyParams, options?: RequestOptions): Promise<GateVerifyResponse> {
    return this.client.request({
      method: 'POST',
      path: '/v1/gate/verify',
      body: { secret: params.secret, token: params.token, remote_ip: params.remoteIp },
      auth: false,
      options,
    });
  }
}
