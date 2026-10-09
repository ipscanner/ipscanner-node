export interface RequestOptions {
  /** Abort the request early. */
  signal?: AbortSignal;
  /** Per-call timeout in milliseconds. */
  timeout?: number;
}

export type NetworkClass =
  | 'residential_clean'
  | 'mobile'
  | 'hosting'
  | 'datacenter'
  | 'vpn'
  | 'residential_proxy'
  | 'tor'
  | 'relay'
  | 'unknown';

/** Set when the caller's plan sent premium fields as null. */
export interface PremiumMarkers {
  /** Dotted paths of the fields sent as null, e.g. "provider" or "geo.latitude". */
  locked?: string[];
  /** The plan that includes them. */
  planRequired?: string;
}

export interface VpnResponse extends PremiumMarkers {
  ip: string;
  isVpn: boolean;
  isTor: boolean;
  networkClass: NetworkClass;
  anonymized: boolean;
  /** The network owner. */
  provider: string | null;
  /** The VPN brand, when known. */
  vpnProvider: string | null;
  riskScore: number;
  evidence?: string[];
}

export interface ProxyResponse extends PremiumMarkers {
  ip: string;
  isProxy: boolean;
  isTor: boolean;
  networkClass: NetworkClass;
  anonymized: boolean;
  /** The network owner. */
  provider: string | null;
  /** The VPN brand, when known. */
  vpnProvider: string | null;
  riskScore: number;
  evidence?: string[];
}

export interface GeolocationResponse extends PremiumMarkers {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  region: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  accuracyRadius: number | null;
}

export interface AsnResponse {
  ip: string;
  asn: string;
  name: string;
  type: 'hosting' | 'isp' | 'vpn' | 'education' | 'government' | 'mobile' | 'unknown';
  country: string;
}

export interface WhoisResponse {
  domain: string;
  registrar: string;
  registeredOn: string;
  expiresOn: string;
  lastUpdated: string;
  nameservers: string[];
  status: string[];
  privacyProtection: boolean;
}

export type WhoisStatus = 'ok' | 'not_found' | 'timeout' | 'unavailable' | 'unparsed';

export interface WhoisResult extends WhoisResponse {
  /** Anything but "ok" means the registry gave no usable answer and the fields are empty. */
  whoisStatus: WhoisStatus;
}

export interface Deduction {
  factor: string;
  points: number;
  detail: string;
}

export type Grade = 'S+' | 'S' | 'A' | 'B' | 'C';
export type PurityVerdict = 'clean' | 'suspect' | 'dirty';

export interface LookupTarget {
  raw: string;
  kind: 'ipv4' | 'ipv6' | 'cidr' | 'hostname';
  ip: string;
  hostname?: string;
  network?: string;
  addresses?: number;
}

export interface ReservedRange {
  reserved: boolean;
  label?: string;
  detail?: string;
}

export interface Verdict {
  classification: string;
  anonymized: boolean;
  confidence: number;
  method: string;
  evidence?: string[];
}

export interface Purity {
  score: number;
  grade: Grade;
  verdict: PurityVerdict;
  deductions: Deduction[];
}

export interface LookupResult extends PremiumMarkers {
  target: LookupTarget;
  reserved: ReservedRange;
  verdict: Verdict;
  purity: Purity | null;
  networkClass: NetworkClass;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  provider?: string | null;
  vpnProvider: string | null;
  riskScore: number;
  networkType?: string;
  geo?: GeolocationResponse;
  asn?: AsnResponse;
  /** Present only when whoisStatus is "ok". */
  whois?: WhoisResponse;
  /** Set for hostname targets. */
  whoisStatus?: WhoisStatus;
  degraded?: string[];
  at: string;
}

export interface HistoryParams {
  limit?: number;
  before?: number;
  verdict?: string;
}

export interface HistoryEvent {
  id: number;
  at: string;
  target: string;
  ip: string;
  verdict: string;
  confidence: number;
  asn: string;
  asnName: string;
  country: string;
  anonymized: boolean;
  source: string;
}

export interface HistoryResponse {
  events: HistoryEvent[];
  /** Cursor for the next page; 0 means there are no more events. */
  nextBefore: number;
  asOf: string;
}

export interface MyIpResponse {
  ipv4?: string;
  ipv6?: string;
  country: string;
  countryCode: string;
  city: string;
  region: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  accuracyRadius: number;
  asn: string;
  asnName: string;
  asnType: string;
  asnCountry: string;
}

export interface BulkParams {
  ips?: string[];
  /** A pasted blob of addresses; the server splits it. */
  input?: string;
}

export interface BulkResult {
  input: string;
  ip: string;
  port?: number;
  score: number | null;
  grade: Grade | null;
  verdict: PurityVerdict | null;
  classification: string;
  confidence: number;
  anonymized: boolean;
  vpnProvider: string | null;
  isTorExit: boolean;
  inVpnRange: boolean;
  inDatacenterRange: boolean;
  asn?: string;
  asnName?: string;
  asnType?: string;
  country?: string;
  deductions: Deduction[] | null;
  locked?: string[];
}

export interface BulkCheckResponse {
  submitted: number;
  unique: number;
  duplicates: number;
  invalid: string[];
  summary: Record<string, number>;
  results: BulkResult[];
  planRequired?: string;
}

export type BulkEventType = 'meta' | 'result' | 'error' | 'done';

export interface BulkEvent {
  type: BulkEventType;
  index: number;
  total: number;
  input: string;
  reason: string;
  message: string;
  error: string;
  ip: string;
  verdict: string;
  classification: string;
  confidence: number;
  anonymized: boolean;
  vpnProvider: string;
  score: number;
  grade: string;
  isTorExit: boolean;
  asn: string;
  asnName: string;
  asnType: string;
  country: string;
  processed: number;
  failed: number;
  metered: number;
  /** Set on the meta event when result events have premium fields locked. */
  planRequired: string;
  /** Fields sent as null on this result event. */
  locked: string[];
  /** True on a done event when every address was processed or failed. */
  complete: boolean;
}

export type AgentClass = 'human' | 'known_bot' | 'ai_agent' | 'malicious_automation';
export type AgentAction = 'allow' | 'flag' | 'block';

export interface AgentscanCheckParams {
  ip: string;
  userAgent?: string;
  ja4?: string;
  headers?: Record<string, string>;
  headlessFlags?: Record<string, boolean>;
  requestId?: string;
}

export interface AgentscanCheckResponse {
  class: AgentClass;
  confidence: number;
  action: AgentAction;
  signals: Record<string, unknown>;
}

export interface AgentscanBatchLine {
  line: number;
  ip: string;
  userAgent?: string;
  ja4?: string;
  headers?: Record<string, string>;
}

export interface AgentscanBatchResult {
  line: number;
  ip: string;
  userAgent?: string;
  class?: AgentClass;
  confidence?: number;
  action?: AgentAction;
  signals?: Record<string, unknown>;
  error?: string;
}

export interface AgentscanBatchResponse {
  submitted: number;
  processed: number;
  failed: number;
  truncated: boolean;
  reason: '' | 'quota_exceeded';
  byClass: Record<string, number>;
  results: AgentscanBatchResult[];
  asOf: string;
}

export interface AgentscanVerifyParams {
  ip: string;
  bot?: string;
  userAgent?: string;
}

export interface VerifyCheck {
  name: 'reverse_dns' | 'published_range' | 'asn' | 'network_origin';
  status: 'pass' | 'fail' | 'unavailable' | 'not_published' | 'info';
  detail: string;
}

export interface AgentscanVerifyResponse {
  ip: string;
  slug: string;
  crawler: string;
  userAgent?: string;
  outcome: 'verified' | 'spoofed' | 'unverifiable';
  method: 'robots-token' | 'ip-list+reverse-dns' | 'ip-list' | 'reverse-dns' | 'asn' | 'none';
  summary: string;
  checks: VerifyCheck[];
  networkOrigin: string;
  anonymized: boolean;
  asn?: string;
  asnName?: string;
  country?: string;
  hostname?: string;
  docs?: string;
  checkedAt: string;
}

export interface AllowlistAgent {
  id: number;
  ident: string;
  type: 'search' | 'ai_crawler' | 'partner';
  verificationMethod: string;
  customerId: number | null;
  createdAt: string;
}

export interface AllowlistResponse {
  agents: AllowlistAgent[];
}

export interface AgentscanSelfParams {
  ip?: string;
  userAgent?: string;
  headers?: Record<string, string>;
  ja4?: string;
}

export interface AgentscanSelfResponse extends PremiumMarkers {
  ip: string;
  userAgent: string;
  ja4: string;
  ja4Source: 'edge' | 'client' | 'unavailable';
  class: AgentClass;
  confidence: number;
  action: AgentAction;
  signals: Record<string, unknown>;
  metered: false;
  asOf: string;
  asn?: AsnResponse;
  geo?: GeolocationResponse;
}

export type TrafficClass =
  | 'verified_bot'
  | 'malicious_automation'
  | 'ai_agent'
  | 'tor'
  | 'vpn'
  | 'proxy'
  | 'relay'
  | 'hosting'
  | 'human';

export type SiteMode = 'monitor' | 'enforce';

export interface EdgeCheckParams {
  ip: string;
  /** Site id, for attribution and the site's mode. */
  site?: string;
  userAgent?: string;
  ja4?: string;
  headers?: Record<string, string>;
  headlessFlags?: Record<string, boolean>;
  requestId?: string;
}

export interface EdgeNetwork {
  networkClass: NetworkClass;
  anonymized: boolean;
  riskScore: number;
  provider?: string | null;
  vpnProvider: string | null;
  evidence?: string[];
  country?: string;
  asn?: number;
  asnName?: string;
}

export interface EdgeSite {
  id: string;
  mode: SiteMode;
  policyVersion: number;
}

export interface EdgeCheckResponse extends PremiumMarkers {
  class: TrafficClass;
  /** Null when the Agentscan half did not answer in time. */
  agent: AgentscanCheckResponse | null;
  /** Null when the network half did not answer in time. */
  network: EdgeNetwork | null;
  /** Null when no site was given, or it is unknown or not on this account. */
  site: EdgeSite | null;
  degraded?: ('agent' | 'network')[];
}

export interface SitePolicyResponse {
  site: string;
  mode: SiteMode;
  policy: Record<TrafficClass, AgentAction>;
  version: number;
  updatedAt: string;
}

export interface GateVerifyParams {
  /** The site secret (gs_...). */
  secret: string;
  token: string;
  /** The visitor's address as your server saw it; sets ip_match. */
  remoteIp?: string;
}

export interface GateNetwork {
  classification: NetworkClass;
  anonymized: boolean;
  provider: string | null;
  vpn_provider: string | null;
}

export interface GateVerifyResponse extends PremiumMarkers {
  success: true;
  class: TrafficClass;
  action: AgentAction;
  mode: SiteMode;
  confidence: number;
  network: GateNetwork;
  signals: string[];
  hostname: string;
  issued_at: string;
  ip_match: boolean;
}

export type PolicyAction = 'allow' | 'step_up' | 'block';

export interface ProvenanceCheckParams {
  ip: string;
  claimedJurisdiction?: string;
  requestContext?: Record<string, unknown>;
}

export interface ProvenanceCheckResponse {
  network_origin: string;
  anonymized: boolean;
  method: string;
  confidence: number;
  policy_action: PolicyAction;
  attestation_id: number;
}

export interface ProvenanceVerifyResponse {
  ok: boolean;
  count: number;
  brokenAt: number;
}

export interface Anchor {
  day: string;
  rootHash: string;
  lastId: number;
}

export interface ProvenanceVerifyAnchoredResponse extends ProvenanceVerifyResponse {
  yours: number;
  anchor: Anchor | null;
  at: string;
}

export interface ChainParams {
  limit?: number;
  before?: number;
}

export interface ChainLink {
  id: number;
  ts: string;
  ip: string;
  claimedJurisdiction: string;
  networkOrigin: string;
  anonymized: boolean;
  method: string;
  confidence: number;
  policyAction: PolicyAction;
  entryHash: string;
  prevHash: string;
  prevId: number;
  entryOk: boolean;
  linkOk: boolean;
}

export interface Jurisdiction {
  code: string;
  label: string;
  law?: string;
  strict: boolean;
  cleanAction: PolicyAction;
  maskedAction: PolicyAction;
  rule: string;
}

export interface ChainResponse {
  links: ChainLink[];
  nextBefore: number;
  total: number;
  summary: Record<PolicyAction, number>;
  anchor: Anchor | null;
  jurisdictions: Jurisdiction[];
  asOf: string;
}

export interface JurisdictionsResponse {
  jurisdictions: Jurisdiction[];
}

export interface ExportParams {
  /** RFC3339 timestamp, YYYY-MM-DD date, or a Date. */
  from?: string | Date;
  to?: string | Date;
}

export interface UsageWindow {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export type AccountType =
  | 'Free'
  | 'Starter'
  | 'Pro'
  | 'Business'
  | 'Enterprise'
  | 'Founder'
  | 'Admin'
  | 'Sponsored'
  | (string & {});

export interface LimitsResponse {
  accountType: AccountType;
  limit: number;
  usage: number;
  remaining: number;
  resetDate: string;
  daily: UsageWindow | null;
  hourly: UsageWindow | null;
}

export interface UsageResponse {
  plan: AccountType;
  used: number;
  limit: number;
  unlimited: boolean;
  remaining: number;
  percent: number;
  softBlocked: boolean;
  blockedBy: '' | 'monthly' | 'daily' | 'hourly';
  upgradeHint: boolean;
  bulkCap: number;
  daily: UsageWindow | null;
  hourly: UsageWindow | null;
  periodStart: string;
  resetDate: string;
  asOf: string;
}

export interface AsnSummary {
  asn: number;
  label: string;
  org: string;
  networkType: string;
  ipv4Prefixes: number;
  ipv6Prefixes: number;
  prefixes: number;
  addresses: number;
}

export interface AsnSamplePrefix {
  prefix: string;
  version: 4 | 6;
  addresses?: number;
}

export interface AsnDetail extends AsnSummary {
  samplePrefixes: AsnSamplePrefix[];
  vpnRangePrefixes: number;
  datacenterRangePrefixes: number;
  rangesLoaded: boolean;
}

export interface AsnTopParams {
  top?: number;
  by?: 'addresses' | 'prefixes';
}

export interface AsnTopResponse {
  total: number;
  by: 'addresses' | 'prefixes';
  count: number;
  results: AsnSummary[];
}

export interface AsnSearchParams {
  limit?: number;
}

export interface AsnSearchResponse {
  total: number;
  query: string;
  count: number;
  results: AsnSummary[];
}

export interface Crawler {
  slug: string;
  name: string;
  tokens: string[];
  method: string;
  verifiable: boolean;
  reverseDns?: string[];
  prefixFiles?: string[];
  asns?: number[];
  docs?: string;
  note?: string;
}

export interface CrawlersResponse {
  crawlers: Crawler[];
  count: number;
  note: string;
}
