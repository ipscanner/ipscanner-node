# IPScanner Node.js SDK

Official TypeScript client for the [IPScanner](https://ipscanner.io) API. Runs on Node.js 18+, Bun, Deno and Cloudflare Workers with no runtime dependencies.

API reference: https://ipscanner.io/api-documentation

## Install

```sh
npm install @ipscanner.io/sdk
```

## Quick start

```ts
import IPScanner from '@ipscanner.io/sdk';

const client = new IPScanner({ apiKey: 'pk_live_...' });

const result = await client.ip.lookup('1.1.1.1');
console.log(result.networkClass, result.vpnProvider, result.purity?.grade);
```

CommonJS works too:

```js
const { IPScanner } = require('@ipscanner.io/sdk');
```

## Usage

Every method returns a promise and accepts an optional last argument `{ signal, timeout }`.

### IP

```ts
await client.ip.lookup('example.com');      // IPv4, IPv6, CIDR or hostname
await client.ip.vpn('2001:db8::1');
await client.ip.proxy('1.1.1.1');
await client.ip.geo('1.1.1.1');
await client.ip.asn('1.1.1.1');
await client.ip.whois('example.com');
await client.ip.history({ limit: 50, verdict: 'dirty' });
await client.ip.demo('8.8.8.8');            // keyless
await client.ip.myip();                     // keyless
```

`vpnProvider` is the VPN brand (for example `Mullvad`) when known, else `null`; `provider` is the network owner. On the Free plan, premium fields (`purity`, `provider`, `vpnProvider`, precise geo) are `null` and listed in `locked`, with `planRequired` naming the plan that includes them.

### Bulk

```ts
const report = await client.bulk.check({ ips: ['1.1.1.1', '8.8.8.8'] });

for await (const event of client.bulk.stream({ input: pastedList })) {
  if (event.type === 'result') console.log(event.ip, event.grade);
  if (event.type === 'done' && !event.complete) console.log('stopped early:', event.reason);
}
```

The stream yields one `meta` event, then `result` and `error` events, then one `done` event. Fields the server leaves out are filled with `0`, `false` or `""`. On the `done` event, `complete` is true only when every address was processed or failed.

### Agentscan

```ts
await client.agentscan.check({ ip: '203.0.113.7', userAgent: 'Mozilla/5.0 ...', headers: { accept: '*/*' } });
await client.agentscan.batch([{ line: 1, ip: '203.0.113.7', userAgent: 'GPTBot/1.2' }]);
await client.agentscan.verify({ ip: '66.249.66.1', bot: 'googlebot' });
await client.agentscan.allowlist();
await client.agentscan.selfCheck();
```

### Edge

```ts
const visit = await client.edge.check({ ip: '203.0.113.7', site: 'site_...', userAgent: 'Mozilla/5.0 ...' });
console.log(visit.class, visit.site?.mode);
```

### Sites

```ts
await client.sites.policy('site_...');
```

### Gate

Server side, with the site secret. No API key is sent.

```ts
const gate = await client.gate.verify({ secret: 'gs_...', token, remoteIp: visitorIp });
if (gate.action === 'block') reject();
```

### Provenance

```ts
await client.provenance.check({ ip: '203.0.113.7', claimedJurisdiction: 'EU' });
await client.provenance.verify();
await client.provenance.verifyAnchored();
await client.provenance.chain({ limit: 100 });
await client.provenance.jurisdictions();
const csv = await client.provenance.export({ from: '2026-01-01', to: '2026-01-31' });
```

### Account

```ts
await client.account.limits();
await client.account.usage();
```

### ASN directory (keyless)

```ts
await client.asnDirectory.top({ top: 20, by: 'prefixes' });
await client.asnDirectory.search('cloudflare', { limit: 5 });
await client.asnDirectory.get('AS15169');
```

### Crawlers (keyless)

```ts
await client.crawlers.list();
```

## Errors

Failed requests throw a subclass of `IPScannerError`:

| Class | When |
| --- | --- |
| `APIError` | Any non-2xx response. Has `status`, `code`, `message`, `details`, `body`. |
| `AuthenticationError` | 401 or 403 |
| `NotFoundError` | 404 |
| `RateLimitError` | 429. Adds `reason`, `retryAfter` (seconds), `resetAt`, `limit`, `usage`, `remaining`, `needed`, `plan`, `upgradeUrl` and `rateLimit` (parsed `X-RateLimit-*` headers). |
| `ConnectionError` | The request never got a response. |
| `TimeoutError` | The request ran past its timeout. |

```ts
import { RateLimitError } from '@ipscanner.io/sdk';

try {
  await client.ip.lookup('1.1.1.1');
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Retry in ${err.retryAfter}s`, err.upgradeUrl);
  } else {
    throw err;
  }
}
```

GET requests are retried up to twice on network errors and 502, 503 or 504, with a short backoff. POST requests and 429 responses are never retried.

## Configuration

```ts
new IPScanner({
  apiKey: 'pk_live_...',           // default: IPSCANNER_API_KEY
  baseUrl: 'https://ipscanner.io', // default: IPSCANNER_API_URL, then https://ipscanner.io
  timeout: 30_000,                 // milliseconds; bulk.stream uses at least 5 minutes
  maxRetries: 2,
  fetch: customFetch,              // default: global fetch
});
```

Keyless endpoints work without an API key. When no key is set, no `Authorization` header is sent.

## Licence

MIT
