import { ConnectionError, IPScannerError, TimeoutError, errorFromResponse } from './errors';
import { Account } from './resources/account';
import { Agentscan } from './resources/agentscan';
import { AsnDirectory } from './resources/asn-directory';
import { Bulk } from './resources/bulk';
import { Crawlers } from './resources/crawlers';
import { Edge } from './resources/edge';
import { Gate } from './resources/gate';
import { IP } from './resources/ip';
import { Provenance } from './resources/provenance';
import { Sites } from './resources/sites';
import type { RequestOptions } from './types';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export const VERSION = '0.2.0';
export const DEFAULT_BASE_URL = 'https://ipscanner.io';
export const DEFAULT_TIMEOUT = 30_000;
export const DEFAULT_MAX_RETRIES = 2;

const RETRY_STATUSES = new Set([502, 503, 504]);

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** API key. Defaults to the IPSCANNER_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to IPSCANNER_API_URL, then https://ipscanner.io. */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
  /** Retries for GET requests on network errors and 502/503/504. Defaults to 2. */
  maxRetries?: number;
  /** Custom fetch implementation. Defaults to the global fetch. */
  fetch?: FetchLike;
}

/** @internal */
export interface APIRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  options?: RequestOptions;
  accept?: string;
  timeout?: number;
  /** Set to false to never send the API key. */
  auth?: boolean;
}

/** @internal */
export interface OpenCall {
  response: Response;
  finish: () => void;
  mapError: (error: unknown) => unknown;
}

export class IPScanner {
  readonly apiKey: string | undefined;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;

  readonly ip: IP;
  readonly bulk: Bulk;
  readonly agentscan: Agentscan;
  readonly provenance: Provenance;
  readonly account: Account;
  readonly asnDirectory: AsnDirectory;
  readonly crawlers: Crawlers;
  readonly edge: Edge;
  readonly sites: Sites;
  readonly gate: Gate;

  private readonly fetchFn: FetchLike;

  constructor(options: ClientOptions = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey.trim() || undefined : env('IPSCANNER_API_KEY');
    this.baseUrl = (options.baseUrl ?? env('IPSCANNER_API_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    const custom = options.fetch;
    this.fetchFn = (input, init) => {
      const f = custom ?? globalThis.fetch;
      if (typeof f !== 'function') {
        throw new IPScannerError('No fetch implementation found. Pass one with the fetch option.');
      }
      return f(input, init);
    };

    this.ip = new IP(this);
    this.bulk = new Bulk(this);
    this.agentscan = new Agentscan(this);
    this.provenance = new Provenance(this);
    this.account = new Account(this);
    this.asnDirectory = new AsnDirectory(this);
    this.crawlers = new Crawlers(this);
    this.edge = new Edge(this);
    this.sites = new Sites(this);
    this.gate = new Gate(this);
  }

  /** @internal */
  async request<T>(req: APIRequest): Promise<T> {
    const text = await this.requestText(req);
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new IPScannerError(`Could not parse the response from ${req.path} as JSON.`, { cause });
    }
  }

  /** @internal */
  async requestText(req: APIRequest): Promise<string> {
    const call = await this.open(req);
    try {
      return await call.response.text();
    } catch (error) {
      throw call.mapError(error);
    } finally {
      call.finish();
    }
  }

  /** @internal */
  async open(req: APIRequest): Promise<OpenCall> {
    const url = this.buildUrl(req.path, req.query);
    const headers: Record<string, string> = {
      Accept: req.accept ?? 'application/json',
      'User-Agent': `ipscanner-node/${VERSION}`,
    };
    if (this.apiKey && req.auth !== false) headers.Authorization = `Bearer ${this.apiKey}`;
    let body: string | undefined;
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }

    const timeout = req.options?.timeout ?? req.timeout ?? this.timeout;
    const userSignal = req.options?.signal;
    const retries = req.method === 'GET' ? Math.max(0, this.maxRetries) : 0;

    for (let attempt = 0; ; attempt++) {
      const call = startCall(timeout, userSignal);
      let error: unknown;
      try {
        const response = await this.fetchFn(url, { method: req.method, headers, body, signal: call.signal });
        if (response.ok) {
          return { response, finish: call.finish, mapError: call.mapError };
        }
        const text = await response.text();
        call.finish();
        error = errorFromResponse(response.status, response.statusText, text, response.headers);
        if (attempt < retries && RETRY_STATUSES.has(response.status)) {
          await sleep(backoff(attempt), userSignal);
          continue;
        }
      } catch (caught) {
        call.finish();
        error = call.mapError(caught);
        if (attempt < retries && error instanceof ConnectionError) {
          await sleep(backoff(attempt), userSignal);
          continue;
        }
      }
      throw error;
    }
  }

  private buildUrl(path: string, query?: APIRequest['query']): string {
    let url = this.baseUrl + path;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }
    return url;
  }
}

function startCall(timeout: number, userSignal: AbortSignal | undefined) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const onAbort = () => controller.abort(userSignal?.reason);
  if (userSignal) {
    if (userSignal.aborted) onAbort();
    else userSignal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    finish() {
      clearTimeout(timer);
      userSignal?.removeEventListener('abort', onAbort);
    },
    mapError(error: unknown): unknown {
      if (error instanceof IPScannerError) return error;
      if (userSignal?.aborted) return error;
      if (timedOut) return new TimeoutError(`Request timed out after ${timeout}ms.`, { cause: error });
      const detail = error instanceof Error ? error.message : String(error);
      return new ConnectionError(`Could not reach the IPScanner API: ${detail}`, { cause: error });
    },
  };
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function env(name: string): string | undefined {
  try {
    if (typeof process === 'undefined' || !process?.env) return undefined;
    const value = process.env[name];
    return value && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
