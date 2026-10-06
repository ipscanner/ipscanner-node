import { describe, expect, it } from 'vitest';
import { IPScannerError, RateLimitError, type BulkEvent } from '../src/index';
import { json, mockClient } from './helpers';

function ndjson(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
}

async function collect(iter: AsyncIterable<BulkEvent>): Promise<BulkEvent[]> {
  const out: BulkEvent[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

const lines = [
  '{"type":"meta","total":3,"processed":1,"failed":1,"metered":3}\n',
  '{"type":"result","total":3,"input":"1.1.1.1","ip":"1.1.1.1","verdict":"clean","classification":"hosting","confidence":0.9,"score":95,"grade":"S","asn":"AS13335","asnName":"Cloudflare","asnType":"hosting","country":"US"}\n',
  '{"type":"result","index":1,"total":3,"input":"8.8.8.8","ip":"8.8.8.8","verdict":"clean","anonymized":true,"isTorExit":true,"score":40,"grade":"C"}\n',
  '{"type":"error","index":2,"input":"10.0.0.1","ip":"10.0.0.1","reason":"reserved","message":"Private","error":"Private"}\n',
  '{"type":"done","reason":"complete","processed":2,"failed":1,"total":3}\n',
];

describe('bulk.stream', () => {
  it('parses events split across chunks mid-line', async () => {
    const all = lines.join('');
    const chunks = [all.slice(0, 17), all.slice(17, 150), all.slice(150, 151), all.slice(151, 400), all.slice(400)];
    const { client, calls } = mockClient([ndjson(chunks)]);
    const events = await collect(client.bulk.stream({ ips: ['1.1.1.1', '8.8.8.8', '10.0.0.1'] }));

    expect(calls[0]!.url).toBe('https://api.test/v1/ip/bulk');
    expect(calls[0]!.headers.get('accept')).toBe('application/x-ndjson');
    expect(calls[0]!.body).toEqual({ ips: ['1.1.1.1', '8.8.8.8', '10.0.0.1'] });
    expect(events.map((e) => e.type)).toEqual(['meta', 'result', 'result', 'error', 'done']);

    const [meta, first, second, error, done] = events as [BulkEvent, BulkEvent, BulkEvent, BulkEvent, BulkEvent];
    expect(meta).toMatchObject({ total: 3, processed: 1, failed: 1, metered: 3, index: 0, complete: false });
    expect(first.index).toBe(0);
    expect(first).toMatchObject({ ip: '1.1.1.1', anonymized: false, isTorExit: false, reason: '', error: '' });
    expect(second).toMatchObject({ index: 1, anonymized: true, isTorExit: true, asn: '', country: '', confidence: 0 });
    expect(error).toMatchObject({ index: 2, reason: 'reserved', score: 0, grade: '' });
    expect(done).toMatchObject({ reason: 'complete', processed: 2, failed: 1, total: 3, complete: true });
  });

  it('handles a multi-byte character split across chunks and no trailing newline', async () => {
    const line = '{"type":"result","ip":"1.1.1.1","asnName":"Türk Telekom"}';
    const bytes = new TextEncoder().encode(line);
    const cut = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const { client } = mockClient([new Response(body)]);
    const events = await collect(client.bulk.stream({ input: '1.1.1.1' }));
    expect(events).toHaveLength(1);
    expect(events[0]!.asnName).toBe('Türk Telekom');
  });

  it('marks a done event cut short by the server deadline as incomplete', async () => {
    const { client } = mockClient([
      ndjson(['{"type":"meta","total":5}\n', '{"type":"done","reason":"complete","processed":3,"total":5}\n']),
    ]);
    const events = await collect(client.bulk.stream({ ips: ['1.1.1.1'] }));
    expect(events.at(-1)).toMatchObject({ type: 'done', complete: false, failed: 0 });
  });

  it('marks a quota_exceeded done event as incomplete', async () => {
    const { client } = mockClient([
      ndjson(['{"type":"done","reason":"quota_exceeded","processed":2,"failed":0,"total":2,"message":"limit"}\n']),
    ]);
    const [done] = await collect(client.bulk.stream({ ips: ['1.1.1.1'] }));
    expect(done).toMatchObject({ complete: false, message: 'limit' });
  });

  it('throws pre-stream errors as normal API errors', async () => {
    const { client } = mockClient([
      json(429, { error: 'rate_limit_exceeded', reason: 'monthly_quota', message: 'Out', retryAfter: 10 }),
    ]);
    await expect(collect(client.bulk.stream({ ips: ['1.1.1.1'] }))).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws on a malformed line', async () => {
    const { client } = mockClient([ndjson(['{"type":"meta"}\n', 'not json\n'])]);
    await expect(collect(client.bulk.stream({ ips: ['1.1.1.1'] }))).rejects.toBeInstanceOf(IPScannerError);
  });

  it('stops reading when the consumer breaks early', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(lines[0]!));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { client } = mockClient([() => new Response(body)]);
    for await (const ev of client.bulk.stream({ ips: ['1.1.1.1'] })) {
      expect(ev.type).toBe('meta');
      break;
    }
    expect(cancelled).toBe(true);
  });
});
