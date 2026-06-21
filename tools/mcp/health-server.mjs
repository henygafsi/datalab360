#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// data360-health — MCP (stdio) server: backend API + Redis-cache health probes
// and real-time-cache optimization helpers.
//
// CLIENT of the running backend (env API_BASE, default http://127.0.0.1:8000).
// Holds NO service-account env. ALL HTTP goes through lib/client.mjs (apiFetch /
// login) — the single auth path. Diagnostics go to STDERR only (stdout is the
// JSON-RPC transport). Tokens/passwords are NEVER logged or returned.
//
// TOOL CATALOG (implemented here):
//   read / probe
//     - ping              liveness, no backend call
//     - health_login      shared login() → { role, account, username } (token redacted)
//     - probe_endpoint    GENERIC GET|POST|… <path> — the escape hatch for the
//                         in-flux /admin/cache/* warm·invalidate + api-health
//                         persist routes (no hardcoded shapes)
//     - run_health_matrix curated READ-ONLY GET probe set → {total,ok,4xx,5xx,perEndpoint[]}
//     - cache_metrics     GET /command-center/cache-metrics (key counts + hit ratio)
//     - svc_health        GET /admin/cache/service-account/health
//     - svc_registry      GET /admin/cache/svc-registry
//     - server_metrics    GET /admin/cache/server-metrics
//     - endpoint_timings  GET /admin/cache/endpoint-usage (slowest / most-called)
//   mutation (DESTRUCTIVE — require confirm:true; bodies passed by caller, never hardcoded)
//     - cache_warm        POST /admin/cache/warm
//     - cache_invalidate  POST /admin/cache/invalidate-surface
//
// NOTE: the named /admin/cache/{service-account/health,svc-registry,server-metrics,
// endpoint-usage} paths are FORWARD CONTRACTS the cache-fix workflow is still
// finalizing — they may differ from src/lib/api-contracts.ts and may 404/501
// until deployed. probe_endpoint is the un-opinionated fallback for hitting them.
// Every convenience tool also returns the raw `body` so a shape/path mismatch
// degrades to "data present, extraction missed" rather than a fake-empty result.
//
// Backend is currently DOWN — only boot + tools/list + ping are verifiable now;
// functional probe calls are deferred to a backend-up smoke.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createServer, toolJson, login, apiFetch, getCachedSession,
  maskToken, API_BASE, APP_BASE,
} from './lib/client.mjs';

const s = createServer({ name: 'data360-health', version: '0.1.0' });

// ── Credential resolution (args → env → last-logged-in persona) ──────────────
// Creds NEVER hardcoded. A tool may pass {account,username,password}; otherwise
// fall back to API_ACCOUNT/API_USERNAME/API_PASSWORD; otherwise reuse the last
// persona that health_login authenticated (so "login once, then probe" works).
let _lastPersona = null; // { account, username }

function resolveCreds(args = {}) {
  return {
    account: args.account || process.env.API_ACCOUNT || _lastPersona?.account || null,
    username: args.username || process.env.API_USERNAME || _lastPersona?.username || null,
    password: args.password || process.env.API_PASSWORD || null,
  };
}

/**
 * Resolve a bearer token for a call: prefer a cached persona session; else, if
 * full creds are available, login() lazily; else return undefined (anonymous —
 * many admin routes will then honestly 401/403). Never returns/logs the token.
 */
async function resolveToken(args = {}) {
  const { account, username, password } = resolveCreds(args);
  if (account && username) {
    const cached = getCachedSession(account, username);
    if (cached?.token) return cached.token;
    if (password) {
      const sess = await login({ account, username, password });
      _lastPersona = { account: sess.account, username: sess.username };
      return sess.token;
    }
  }
  return undefined;
}

// Classify an HTTP status into the matrix buckets.
function classify(status) {
  if (status === 0) return 'net';
  if (status >= 200 && status < 300) return 'ok';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500) return '5xx';
  return 'other';
}

// ── ping — liveness, backend-independent (smoke-test depends on this) ─────────
s.tool({
  name: 'ping',
  description: 'Liveness check for the data360-health MCP server. Returns config (no secrets). Does not call the backend.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => toolJson({ server: 'data360-health', alive: true, api_base: API_BASE, app_base: APP_BASE }),
});

// ── health_login — authenticate via the shared lib; never return the token ────
s.tool({
  name: 'health_login',
  description:
    'Authenticate against the backend (POST /user/login/) and cache the token in-memory for subsequent probes. ' +
    'Creds via args or env API_ACCOUNT/API_USERNAME/API_PASSWORD — never hardcoded, never returned/logged. ' +
    'Returns { role, account, username, items } only (token is redacted to a masked hint).',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string', description: 'Snowflake account_name (or env API_ACCOUNT)' },
      username: { type: 'string', description: 'username (or env API_USERNAME)' },
      password: { type: 'string', description: 'password (or env API_PASSWORD) — never logged' },
    },
  },
  handler: async (args) => {
    const { account, username, password } = resolveCreds(args);
    if (!account || !username || !password) {
      return toolJson({ ok: false, error: 'missing creds: pass {account,username,password} or set API_ACCOUNT/API_USERNAME/API_PASSWORD' });
    }
    const sess = await login({ account, username, password });
    _lastPersona = { account: sess.account, username: sess.username };
    return toolJson({
      ok: true,
      account: sess.account,
      username: sess.username,
      role: sess.role,
      items: sess.items,
      token_hint: maskToken(sess.token), // never the real token
    });
  },
});

// ── probe_endpoint — GENERIC single call (the un-opinionated escape hatch) ────
s.tool({
  name: 'probe_endpoint',
  description:
    'Generic single-endpoint probe via the shared apiFetch. Returns { status, ms, ok, body, error }. ' +
    'This is how to hit the in-flux /admin/cache/* warm·invalidate and /admin/api-health/* persist routes ' +
    'WITHOUT hardcoding their request/response shapes. Authenticated with the cached/last-login session ' +
    '(or pass creds). NOTE: a non-GET call here can MUTATE — for the known cache mutations prefer the ' +
    'confirm-gated cache_warm / cache_invalidate tools.',
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', description: 'HTTP method (GET/POST/PUT/PATCH/DELETE). Default GET.' },
      path: { type: 'string', description: 'Backend path, e.g. /admin/cache/svc-registry (leading slash optional).' },
      body: { type: 'object', description: 'Optional JSON request body (caller-supplied shape; never hardcoded).' },
      params: { type: 'object', description: 'Optional query params, e.g. { days: 30 }.' },
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
      confirm: { type: 'boolean', description: 'REQUIRED for any non-GET (POST/PUT/PATCH/DELETE) — those MUTATE. Ignored for GET/HEAD/OPTIONS.' },
    },
    required: ['path'],
  },
  handler: async (args) => {
    const method = (args.method || 'GET').toUpperCase();
    // Confirm-gate parity with cache_warm/cache_invalidate: a generic probe must
    // NOT be a back-door for unconfirmed mutations (e.g. POST /admin/cache/invalidate-surface).
    const READONLY = new Set(['GET', 'HEAD', 'OPTIONS']);
    if (!READONLY.has(method) && args.confirm !== true) {
      return toolJson({
        refused: true, method, path: args.path,
        error: `Refused: ${method} via probe_endpoint MUTATES — pass confirm:true to proceed (or use the dedicated confirm-gated cache_warm / cache_invalidate tools).`,
      });
    }
    const token = await resolveToken(args);
    const r = await apiFetch(method, args.path, { token, body: args.body, params: args.params });
    return toolJson({ method, path: args.path, status: r.status, ms: r.ms, ok: r.ok, error: r.error, body: r.body });
  },
});

// ── run_health_matrix — curated READ-ONLY GET probe set ──────────────────────
// NOTE: this is a curated, SAFE (GET-only) subset spanning the major modules —
// NOT the full browser-side FE api-health sweep (that runs service functions
// through apiClient and is not callable offline from Node). Each entry hits an
// endpoint confirmed in src/lib/api-contracts.ts.
const MATRIX = [
  { module: 'Command Center', name: 'summary',            path: '/command-center/summary' },
  { module: 'Command Center', name: 'module-health',      path: '/command-center/module-health' },
  { module: 'Command Center', name: 'cache-metrics',      path: '/command-center/cache-metrics' },
  { module: 'Command Center', name: 'infrastructure',     path: '/command-center/infrastructure' },
  { module: 'Org Accounts',   name: 'dashboard-overview', path: '/org-accounts/dashboard/overview' },
  { module: 'Org Accounts',   name: 'dashboard-usage',    path: '/org-accounts/dashboard/usage' },
  { module: 'Org Accounts',   name: 'org-summary',        path: '/org-accounts/org-summary' },
  { module: 'Gouvernance',    name: 'my-permissions',     path: '/gouvernance/d360-roles/my-permissions' },
  { module: 'Gouvernance',    name: 'd360-roles',         path: '/gouvernance/d360-roles' },
  { module: 'Admin/Cache',    name: 'coverage',           path: '/admin/cache/coverage' },
  { module: 'Admin/Cache',    name: 'svc-health',         path: '/admin/cache/svc-health' },
  { module: 'Admin/Cache',    name: 'warm-status',        path: '/admin/cache/warm-status' },
  { module: 'Admin/Cache',    name: 'activity-stats',     path: '/admin/activity-stats' },
  { module: 'Data Quality',   name: 'quality-summary',    path: '/data-quality/quality-summary', params: { database: process.env.NEXT_PUBLIC_PRIMARY_DB || 'CP_DATA360' } },
  { module: 'Observability',  name: 'kpis',               path: '/observability/kpis' },
  { module: 'Observability',  name: 'health',             path: '/observability/health' },
  { module: 'BI Dashboard',   name: 'list',               path: '/bi-dashboard' },
  { module: 'Data Products',  name: 'list',               path: '/data-products' },
  { module: 'Mapping',        name: 'databases',          path: '/common/databases' },
  { module: 'User',           name: 'my-modules',         path: '/user/me/modules' },
];

s.tool({
  name: 'run_health_matrix',
  description:
    'Run a curated READ-ONLY GET probe set across the major modules and summarize ' +
    '{ total, ok, "4xx", "5xx", net_errors, ms:{avg,max}, perEndpoint[] }. ' +
    'Optional { modules } filters by module name (case-insensitive). This is a SAFE ' +
    'subset, not the full FE api-health sweep. Use probe_endpoint for anything else.',
  inputSchema: {
    type: 'object',
    properties: {
      modules: { type: 'array', items: { type: 'string' }, description: 'Optional module-name filter, e.g. ["Command Center","Data Quality"].' },
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
    },
  },
  handler: async (args) => {
    const wanted = Array.isArray(args.modules) && args.modules.length
      ? new Set(args.modules.map((m) => String(m).toLowerCase()))
      : null;
    const list = wanted ? MATRIX.filter((e) => wanted.has(e.module.toLowerCase())) : MATRIX;
    const token = await resolveToken(args);

    const perEndpoint = [];
    for (const e of list) {
      const r = await apiFetch('GET', e.path, { token, params: e.params });
      perEndpoint.push({
        module: e.module, name: e.name, method: 'GET', path: e.path,
        status: r.status, ms: r.ms, ok: r.ok, class: classify(r.status),
        error: r.ok ? undefined : r.error,
      });
    }

    const count = (c) => perEndpoint.filter((p) => p.class === c).length;
    const msVals = perEndpoint.map((p) => p.ms).filter((n) => Number.isFinite(n));
    const summary = {
      total: perEndpoint.length,
      ok: count('ok'),
      '4xx': count('4xx'),
      '5xx': count('5xx'),
      net_errors: count('net'),
      other: count('other'),
      ms: {
        avg: msVals.length ? Math.round(msVals.reduce((a, b) => a + b, 0) / msVals.length) : null,
        max: msVals.length ? Math.max(...msVals) : null,
      },
      authenticated: Boolean(token),
      perEndpoint,
    };
    if (wanted && !list.length) summary.note = 'no probes matched the requested modules; valid: ' + [...new Set(MATRIX.map((m) => m.module))].join(', ');
    return toolJson(summary);
  },
});

// ── Read-only convenience wrappers (full body + best-effort extraction) ──────
// Each returns the raw body alongside any extracted field, so a shape/path
// mismatch (these are forward contracts) degrades to "data present, extraction
// missed" — never a fabricated empty.
const credProps = { account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' } };

s.tool({
  name: 'cache_metrics',
  description: 'GET /command-center/cache-metrics — runtime cache telemetry. Extracts key_counts_by_prefix (d360/shared/session) + hit ratio; always returns the full body too.',
  inputSchema: { type: 'object', properties: { ...credProps } },
  handler: async (args) => {
    const token = await resolveToken(args);
    const r = await apiFetch('GET', '/command-center/cache-metrics', { token });
    const b = r.body || {};
    // Best-effort extraction across plausible nestings (forward contract — shape unverified).
    const key_counts = b?.cache?.key_counts_by_prefix ?? b?.key_counts_by_prefix ?? b?.cache?.keys_by_prefix ?? null;
    const hit_ratio = b?.cache?.hit_ratio ?? b?.hit_ratio ?? b?.cache?.hit_rate ?? b?.hit_rate ?? null;
    return toolJson({ status: r.status, ms: r.ms, ok: r.ok, error: r.error, extracted: { key_counts_by_prefix: key_counts, hit_ratio }, body: r.body });
  },
});

s.tool({
  name: 'svc_health',
  description: 'GET /admin/cache/service-account/health — service-account health per account (alive · auth_type · fallback_enabled). Forward contract; returns full body. May 404/501 until deployed.',
  inputSchema: { type: 'object', properties: { ...credProps } },
  handler: async (args) => {
    const token = await resolveToken(args);
    const r = await apiFetch('GET', '/admin/cache/service-account/health', { token });
    return toolJson({ status: r.status, ms: r.ms, ok: r.ok, error: r.error, body: r.body });
  },
});

s.tool({
  name: 'svc_registry',
  description: 'GET /admin/cache/svc-registry — registered service accounts / warmer registry. Forward contract; returns full body. May 404/501 until deployed.',
  inputSchema: { type: 'object', properties: { ...credProps } },
  handler: async (args) => {
    const token = await resolveToken(args);
    const r = await apiFetch('GET', '/admin/cache/svc-registry', { token });
    return toolJson({ status: r.status, ms: r.ms, ok: r.ok, error: r.error, body: r.body });
  },
});

s.tool({
  name: 'server_metrics',
  description: 'GET /admin/cache/server-metrics — always-available fallback server KPIs. Forward contract; returns full body. May 404/501 until deployed.',
  inputSchema: { type: 'object', properties: { ...credProps } },
  handler: async (args) => {
    const token = await resolveToken(args);
    const r = await apiFetch('GET', '/admin/cache/server-metrics', { token });
    return toolJson({ status: r.status, ms: r.ms, ok: r.ok, error: r.error, body: r.body });
  },
});

s.tool({
  name: 'endpoint_timings',
  description: 'GET /admin/cache/endpoint-usage — per-endpoint usage (slowest / most-called). Pass top_n (default 20) as a query hint. Forward contract; returns full body. May 404/501 until deployed.',
  inputSchema: { type: 'object', properties: { top_n: { type: 'number', description: 'How many top endpoints to request (default 20).' }, ...credProps } },
  handler: async (args) => {
    const token = await resolveToken(args);
    const top_n = Number.isFinite(args.top_n) ? args.top_n : 20;
    const r = await apiFetch('GET', '/admin/cache/endpoint-usage', { token, params: { top_n } });
    return toolJson({ status: r.status, ms: r.ms, ok: r.ok, error: r.error, top_n, body: r.body });
  },
});

// ── Mutation wrappers (DESTRUCTIVE — confirm:true enforced by the factory) ────
// Bodies are CALLER-SUPPLIED (never hardcoded). `path` defaults to the
// api-contracts route but is overridable for the in-flux variants.
s.tool({
  name: 'cache_warm',
  description:
    'POST a manual cache-warm trigger (default /admin/cache/warm). DESTRUCTIVE — requires confirm:true. ' +
    'Supply the request `body` yourself (shape not hardcoded), e.g. { account, page?, module?, per_role? }. ' +
    'Returns { status, ms, ok, body }. Equivalent to probe_endpoint POST without the confirm gate.',
  destructive: true,
  inputSchema: {
    type: 'object',
    properties: {
      body: { type: 'object', description: 'Caller-supplied warm request body, e.g. { account, page?, module?, per_role? }.' },
      path: { type: 'string', description: 'Override route (default /admin/cache/warm).' },
      ...credProps,
    },
  },
  handler: async (args) => {
    const token = await resolveToken(args);
    const path = args.path || '/admin/cache/warm';
    const r = await apiFetch('POST', path, { token, body: args.body || {} });
    return toolJson({ action: 'cache_warm', path, status: r.status, ms: r.ms, ok: r.ok, error: r.error, body: r.body });
  },
});

s.tool({
  name: 'cache_invalidate',
  description:
    'POST a precise account-scoped cache eviction (default /admin/cache/invalidate-surface). DESTRUCTIVE — requires confirm:true. ' +
    'Supply the request `body` yourself (shape not hardcoded), e.g. { account, page?, module?, shared_fns?, dry_run? }. ' +
    'Tip: set body.dry_run=true to preview. Returns { status, ms, ok, body }.',
  destructive: true,
  inputSchema: {
    type: 'object',
    properties: {
      body: { type: 'object', description: 'Caller-supplied eviction body, e.g. { account, page?, module?, shared_fns?, dry_run? }.' },
      path: { type: 'string', description: 'Override route (default /admin/cache/invalidate-surface).' },
      ...credProps,
    },
  },
  handler: async (args) => {
    const token = await resolveToken(args);
    const path = args.path || '/admin/cache/invalidate-surface';
    const r = await apiFetch('POST', path, { token, body: args.body || {} });
    return toolJson({ action: 'cache_invalidate', path, status: r.status, ms: r.ms, ok: r.ok, error: r.error, body: r.body });
  },
});

await s.start();
