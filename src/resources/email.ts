import type { IPScanner } from '../client';
import type { EmailCheck, RequestOptions } from '../types';

export class Email {
  constructor(private readonly client: IPScanner) {}

  /** Check one address: syntax, throwaway domains, mail servers, typos and role addresses. One request. */
  check(email: string, options?: RequestOptions): Promise<EmailCheck> {
    return this.client.request({ method: 'POST', path: '/v1/email/check', body: { email }, options });
  }
}
