import type { IPScanner } from '../client';
import { IPScannerError } from '../errors';
import type { BulkCheckResponse, BulkEvent, BulkEventType, BulkParams, RequestOptions } from '../types';

const STREAM_TIMEOUT = 5 * 60_000;

export class Bulk {
  constructor(private readonly client: IPScanner) {}

  /** Score a list of addresses in one request. */
  check(params: BulkParams, options?: RequestOptions): Promise<BulkCheckResponse> {
    return this.client.request({ method: 'POST', path: '/v1/bulk/check', body: bulkBody(params), options });
  }

  /** Stream results as each address is scored. */
  async *stream(params: BulkParams, options?: RequestOptions): AsyncGenerator<BulkEvent, void, undefined> {
    const call = await this.client.open({
      method: 'POST',
      path: '/v1/ip/bulk',
      body: bulkBody(params),
      accept: 'application/x-ndjson',
      timeout: Math.max(this.client.timeout, STREAM_TIMEOUT),
      options,
    });
    try {
      for await (const line of readLines(call.response)) {
        yield toBulkEvent(line);
      }
    } catch (error) {
      throw call.mapError(error);
    } finally {
      call.finish();
    }
  }
}

function bulkBody(params: BulkParams) {
  return { ips: params.ips, input: params.input };
}

async function* readLines(response: Response): AsyncGenerator<string, void, undefined> {
  if (!response.body) {
    for (const line of (await response.text()).split('\n')) {
      if (line.trim()) yield line;
    }
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
    finished = true;
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Parse one NDJSON line from the bulk stream, filling omitted fields with their zero values. */
export function toBulkEvent(line: string): BulkEvent {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line) as Record<string, unknown>;
  } catch (cause) {
    throw new IPScannerError(`Could not parse bulk stream line: ${line.slice(0, 200)}`, { cause });
  }
  const s = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const n = (key: string) => (typeof raw[key] === 'number' ? (raw[key] as number) : 0);
  const b = (key: string) => raw[key] === true;

  const event: BulkEvent = {
    type: s('type') as BulkEventType,
    index: n('index'),
    total: n('total'),
    input: s('input'),
    reason: s('reason'),
    message: s('message'),
    error: s('error'),
    ip: s('ip'),
    verdict: s('verdict'),
    classification: s('classification'),
    confidence: n('confidence'),
    anonymized: b('anonymized'),
    vpnProvider: s('vpnProvider'),
    score: n('score'),
    grade: s('grade'),
    isTorExit: b('isTorExit'),
    asn: s('asn'),
    asnName: s('asnName'),
    asnType: s('asnType'),
    country: s('country'),
    processed: n('processed'),
    failed: n('failed'),
    metered: n('metered'),
    planRequired: s('planRequired'),
    locked: Array.isArray(raw.locked) ? raw.locked.filter((v): v is string => typeof v === 'string') : [],
    complete: false,
  };
  if (event.type === 'done') {
    event.complete = event.reason === 'complete' && event.processed + event.failed >= event.total;
  }
  return event;
}
