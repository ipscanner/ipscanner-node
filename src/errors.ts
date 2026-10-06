export interface RateLimitHeaders {
  meter?: string;
  limit?: number;
  remaining?: number;
  reset?: number;
  dailyLimit?: number;
  dailyRemaining?: number;
  dailyReset?: number;
  hourlyLimit?: number;
  hourlyRemaining?: number;
  hourlyReset?: number;
  usagePercent?: number;
  upgradeHint?: string;
  upgradeUrl?: string;
  upgradePlan?: string;
  retryAfter?: number;
}

/** Base class for every error thrown by this SDK. */
export class IPScannerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** The API answered with a non-2xx status. */
export class APIError extends IPScannerError {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly body: unknown;
  readonly headers: Headers;

  constructor(status: number, code: string, message: string, body: unknown, headers: Headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
    this.headers = headers;
    const details = isObject(body) ? body.details : undefined;
    this.details = isObject(details) ? details : undefined;
  }
}

/** 401 or 403: the key is missing, invalid, or the account is suspended. */
export class AuthenticationError extends APIError {}

/** 404. */
export class NotFoundError extends APIError {}

/** 429: a quota or rate limit was hit. */
export class RateLimitError extends APIError {
  readonly reason: string | undefined;
  /** Seconds to wait before retrying. */
  readonly retryAfter: number | undefined;
  readonly resetAt: string | undefined;
  readonly limit: number | undefined;
  readonly usage: number | undefined;
  readonly remaining: number | undefined;
  readonly needed: number | undefined;
  readonly plan: string | undefined;
  readonly upgradeUrl: string | undefined;
  readonly rateLimit: RateLimitHeaders;

  constructor(status: number, code: string, message: string, body: unknown, headers: Headers) {
    super(status, code, message, body, headers);
    const b = isObject(body) ? body : {};
    this.rateLimit = parseRateLimitHeaders(headers);
    this.reason = str(b.reason);
    this.retryAfter = num(b.retryAfter) ?? this.rateLimit.retryAfter;
    this.resetAt = str(b.resetAt);
    this.limit = num(b.limit);
    this.usage = num(b.usage);
    this.remaining = num(b.remaining);
    this.needed = num(b.needed);
    this.plan = str(b.plan);
    const upgrade = isObject(b.upgrade) ? b.upgrade : {};
    this.upgradeUrl = str(upgrade.url) ?? this.rateLimit.upgradeUrl;
  }
}

/** The request never got a response: DNS, TLS, connection reset and so on. */
export class ConnectionError extends IPScannerError {}

/** The request took longer than the configured timeout. */
export class TimeoutError extends ConnectionError {}

export function errorFromResponse(
  status: number,
  statusText: string,
  text: string,
  headers: Headers,
): APIError {
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  let code = `http_${status}`;
  let message = statusText || `HTTP ${status}`;
  if (isObject(body) && typeof body.error === 'string') {
    code = body.error;
    if (typeof body.message === 'string' && body.message) message = body.message;
  }

  if (status === 401 || status === 403) return new AuthenticationError(status, code, message, body, headers);
  if (status === 404) return new NotFoundError(status, code, message, body, headers);
  if (status === 429) return new RateLimitError(status, code, message, body, headers);
  return new APIError(status, code, message, body, headers);
}

export function parseRateLimitHeaders(headers: Headers): RateLimitHeaders {
  const h = (name: string) => headers.get(name) ?? undefined;
  const n = (name: string) => num(h(name));
  const out: RateLimitHeaders = {
    meter: h('x-ratelimit-meter'),
    limit: n('x-ratelimit-limit'),
    remaining: n('x-ratelimit-remaining'),
    reset: n('x-ratelimit-reset'),
    dailyLimit: n('x-ratelimit-daily-limit'),
    dailyRemaining: n('x-ratelimit-daily-remaining'),
    dailyReset: n('x-ratelimit-daily-reset'),
    hourlyLimit: n('x-ratelimit-hourly-limit'),
    hourlyRemaining: n('x-ratelimit-hourly-remaining'),
    hourlyReset: n('x-ratelimit-hourly-reset'),
    usagePercent: n('x-ratelimit-usage-percent'),
    upgradeHint: h('x-quota-upgrade-hint'),
    upgradeUrl: h('x-quota-upgrade-url'),
    upgradePlan: h('x-quota-upgrade-plan'),
    retryAfter: parseRetryAfter(h('retry-after')),
  };
  for (const key of Object.keys(out) as (keyof RateLimitHeaders)[]) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = num(value);
  if (seconds !== undefined) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
