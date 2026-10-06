import { IPScanner, type ClientOptions } from '../src/index';

export interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

type Responder = Response | ((call: Recorded, init: RequestInit) => Response | Promise<Response>);

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function mockClient(responders: Responder[], options: ClientOptions = {}) {
  const calls: Recorded[] = [];
  const queue = [...responders];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const call: Recorded = {
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error('no response queued');
    return typeof next === 'function' ? next(call, init) : next.clone();
  };
  const client = new IPScanner({ apiKey: 'pk_test_123', baseUrl: 'https://api.test', fetch, ...options });
  return { client, calls };
}
