#!/usr/bin/env node
/**
 * _cross-role-probe.mjs — cross-role/user endpoint probe + cache-rate measurement
 * against the ONLINE backend (http://api.datalab360.io).
 *
 * Per-role tokens are NOT available (test users 401 / MFA policy), so cross-role
 * truth is derived ADMIN-side:
 *   - GET /api/platform/access-simulator?username=HAHA&role=<ROLE>&module=<apiName>
 *   - GET /api/platform/users/{u}/effective-grants
 *   - GET /gouvernance/d360-roles/my-permissions (current user)
 *
 * Usage:  DATA360_E2E_PASSWORD=<pw> node e2e/_cross-role-probe.mjs
 * Output: e2e/.auth/cross_role_probe.json + printed summary tables.
 * NEVER prints the password or token (lengths only).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.DATA360_API_URL || 'http://api.datalab360.io';
const ACCOUNT = process.env.DATA360_E2E_ACCOUNT || 'uchsfvb-HAHA';
const USERNAME = process.env.DATA360_E2E_USER || 'HAHA';
const PASSWORD = process.env.DATA360_E2E_PASSWORD;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, '.auth', 'cross_role_probe.json');

if (!PASSWORD) {
  console.error('FATAL: DATA360_E2E_PASSWORD is not set in the environment.');
  process.exit(2);
}

/* ----------------------------------------------------------------- helpers */

async function timedFetch(path, { headers = {}, method = 'GET', body, timeoutMs = 45000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, { method, headers, body, signal: ctl.signal });
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    return { status: res.status, ms, text, size: Buffer.byteLength(text) };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    return { status: 0, ms, text: '', size: 0, error: e.name === 'AbortError' ? `timeout>${timeoutMs}ms` : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function execMsOf(text) {
  const m = /"execution_time_ms"\s*:\s*([0-9.]+)/.exec(text || '');
  return m ? Math.round(Number(m[1])) : null;
}

function sampleOf(text) {
  return (text || '').replace(/\s+/g, ' ').slice(0, 120);
}

function json(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* ------------------------------------------------------------------- login */

console.log(`[probe] base=${BASE} account=${ACCOUNT} user=${USERNAME} (password len=${PASSWORD.length}, never printed)`);

const login = await timedFetch('/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account_name: ACCOUNT, username: USERNAME, password: PASSWORD }),
  timeoutMs: 30000,
});
const loginBody = json(login.text);
if (login.status !== 200 || !loginBody?.access_token) {
  console.error(`FATAL: signin failed status=${login.status} ${login.error || sampleOf(login.text)}`);
  process.exit(1);
}
const TOKEN = loginBody.access_token;
const AUTH = {
  Authorization: `Bearer ${TOKEN}`,
  'X-Account-Name': loginBody.account_name || ACCOUNT,
  'X-Username': loginBody.username || USERNAME,
};
console.log(`[probe] signin OK in ${login.ms}ms — role=${loginBody.role} token_len=${TOKEN.length}`);

const get = (path, timeoutMs) => timedFetch(path, { headers: AUTH, timeoutMs });

/* ------------------------------------------- server-side cache stats before */

const statsBefore = json((await get('/cache/stats', 20000)).text);

/* -------------------------------------------------------- (a) discover roles */

const FALLBACK_ROLES = ['ACCOUNTADMIN', 'DATA360', 'RETAIL_DATA_ANALYST', 'RETAIL_DATA_ENGINEER', 'RETAIL_GOVERNOR', 'RETAIL_AI_ENGINEER'];
let roles = [];
let roleDiscovery = 'fallback';

const eg = json((await get(`/api/platform/users/${USERNAME}/effective-grants`, 30000)).text);
if (Array.isArray(eg?.roles) && eg.roles.length) {
  roles = [...eg.roles];
  roleDiscovery = 'effective-grants(HAHA).roles';
}
const sfRoles = json((await get('/gouvernance/roles', 30000)).text);
const sfNames = (sfRoles?.data || []).map((r) => r.name).filter(Boolean);
for (const extra of ['DATA360', 'BI_ANALYST', 'DATA_MODELER']) {
  if (sfNames.includes(extra) && !roles.includes(extra)) roles.push(extra);
}
if (!roles.length) roles = FALLBACK_ROLES;
roles = roles.slice(0, 9);
console.log(`[probe] roles (${roleDiscovery} + gouvernance/roles extras): ${roles.join(', ')}`);

// d360 app-level roles (for the report; the simulator speaks warehouse roles)
const d360Roles = json((await get('/gouvernance/d360-roles', 30000)).text);
const d360RoleNames = [
  ...(d360Roles?.system_roles || []).map((r) => r.role_name),
  ...(d360Roles?.custom_roles || []).map((r) => r.role_name),
].filter(Boolean);

/* --------------------------------------------- (b) curated GET set, twice */

const ENDPOINTS = [
  { path: '/projects', tag: 'workflow' },
  { path: '/projects/unified', tag: 'dashboard' },
  { path: '/projects/last-used', tag: 'workflow' },
  { path: '/catalog/overview', tag: 'explore_design' },
  { path: '/catalog/kpis', tag: 'explore_design' },
  { path: '/command-center/overview-kpis', tag: 'account_overview' },
  { path: '/command-center/summary', tag: 'account_overview' },
  { path: '/command-center/activity-feed', tag: 'account_overview' },
  { path: '/data-quality/quality-summary', tag: 'data_quality' },
  { path: '/gouvernance/policies/MASKING', tag: 'gouvernance' },
  { path: '/gouvernance/compliance/score', tag: 'gouvernance' },
  { path: '/gouvernance/users', tag: 'gouvernance' },
  { path: '/gouvernance/d360-roles/my-permissions', tag: 'gouvernance' },
  { path: '/gouvernance/d360-roles/my-module-access', tag: 'gouvernance' },
  { path: '/observability/alerts?days=7', tag: 'observability' },
  { path: '/observability/trust-center/summary', tag: 'observability' },
  { path: '/connect/connectors/health', tag: 'connect_datalake' },
  { path: '/connect/connectors', tag: 'connect_datalake' },
  { path: '/common/databases', tag: 'connect_datalake' },
  { path: '/bi-dashboard/templates', tag: 'bi_reporting' },
  { path: '/cortex/kpis', tag: 'intelligent' },
  { path: '/cortex/models', tag: 'intelligent' },
  { path: '/cortex/semantic-models/list', tag: 'intelligent' },
  { path: '/api/recommendations/', tag: 'intelligent' },
  { path: '/deployments/track', tag: 'explore_design' },
  { path: '/explore-design/glossary', tag: 'explore_design' },
  { path: '/workflow/capabilities', tag: 'workflow' },
  { path: '/admin/server-metrics', tag: 'administration' },
  { path: '/cache/stats', tag: 'administration' },
  { path: '/notifications/unread-count', tag: 'administration' },
  { path: '/user/me/modules', tag: 'auth' },
  { path: '/api/platform/grants/roles', tag: 'gouvernance' },
];

console.log(`\n[probe] hitting ${ENDPOINTS.length} endpoints twice each (cold → warm)...`);
const endpointResults = [];
for (const ep of ENDPOINTS) {
  const c1 = await get(ep.path);
  const c2 = await get(ep.path);
  const ok = c1.status >= 200 && c1.status < 300;
  const cacheHit = ok && c2.status >= 200 && c2.status < 300 && c2.ms < Math.max(200, c1.ms * 0.35);
  const row = {
    path: ep.path,
    tag: ep.tag,
    status: c1.status,
    status2: c2.status,
    ms1: c1.ms,
    ms2: c2.ms,
    size: c1.size,
    cacheHit,
    execMs1: execMsOf(c1.text),
    execMs2: execMsOf(c2.text),
    dataSample: sampleOf(c1.text),
    error: c1.error || (ok ? undefined : sampleOf(c1.text)) || undefined,
  };
  endpointResults.push(row);
  console.log(`  ${pad(row.status, 4)} ${pad(row.ms1 + 'ms', 8)} ${pad(row.ms2 + 'ms', 8)} ${row.cacheHit ? 'HIT ' : '    '} ${ep.path}`);
}

const okRows = endpointResults.filter((r) => r.status >= 200 && r.status < 300);
const hitRows = okRows.filter((r) => r.cacheHit);
const clientHitRate = okRows.length ? Math.round((hitRows.length / okRows.length) * 1000) / 10 : 0;

/* ------------------------------- (c) role × module access-simulator matrix */

const SIM_MODULES = [
  'connect_datalake', 'explore_design', 'workflow', 'gouvernance', 'bi_reporting',
  'intelligent', 'data_quality', 'dashboard', 'account_overview', 'observability',
];

console.log(`\n[probe] access-simulator: ${roles.length} roles x ${SIM_MODULES.length} modules...`);
const simTasks = [];
for (const role of roles) for (const mod of SIM_MODULES) simTasks.push({ role, mod });
const simRaw = await mapLimit(simTasks, 4, async ({ role, mod }) => {
  const r = await get(`/api/platform/access-simulator?username=${encodeURIComponent(USERNAME)}&role=${encodeURIComponent(role)}&module=${encodeURIComponent(mod)}`, 30000);
  const b = json(r.text);
  return {
    role, module: mod, status: r.status,
    allowed: b?.checks?.module?.allowed ?? null,
    dataScope: b?.checks?.data_scope?.scope ?? null,
    ms: r.ms,
    error: r.error,
  };
});
const simMatrix = {};
for (const s of simRaw) {
  simMatrix[s.role] ??= {};
  simMatrix[s.role][s.module] = s.status === 200 ? (s.allowed === true ? 'ALLOW' : s.allowed === false ? 'DENY' : '—') : `ERR${s.status}`;
}
const dataScopes = {};
for (const s of simRaw) if (s.dataScope) dataScopes[s.role] = s.dataScope;

/* -------------------------------------- (d) per-user effective-grants */

const usersBody = json((await get('/gouvernance/users', 30000)).text);
const allUsers = (usersBody?.data || []).filter((u) => u.name);
// pick HAHA + up to 2 more real, enabled users with distinct default roles
const picked = [];
const seenRoles = new Set();
const hahaUser = allUsers.find((u) => u.name === USERNAME);
if (hahaUser) { picked.push(hahaUser); seenRoles.add(hahaUser.default_role || ''); }
for (const u of allUsers) {
  if (picked.length >= 3) break;
  if (u.name === USERNAME) continue;
  if (String(u.disabled) === 'true') continue;
  const dr = u.default_role || '';
  if (seenRoles.has(dr)) continue;
  seenRoles.add(dr);
  picked.push(u);
}
console.log(`\n[probe] effective-grants for: ${picked.map((u) => u.name).join(', ') || '(none found)'}`);
const userGrants = [];
for (const u of picked) {
  const r = await get(`/api/platform/users/${encodeURIComponent(u.name)}/effective-grants`, 30000);
  const b = json(r.text);
  userGrants.push({
    username: u.name,
    defaultRole: u.default_role || null,
    status: r.status,
    ms: r.ms,
    roles: b?.roles || [],
    isSuperAdmin: b?.is_super_admin ?? null,
    modulesCount: Array.isArray(b?.modules) ? b.modules.length : null,
    actionsCount: Array.isArray(b?.actions) ? b.actions.length : null,
    pagesCount: Array.isArray(b?.pages) ? b.pages.length : null,
    enforcement: b?.enforcement || null,
  });
}

// current-user d360 my-permissions snapshot (already probed in the set; keep a parsed copy)
const myPerms = json((await get('/gouvernance/d360-roles/my-permissions', 30000)).text);

/* ---------------------------------------------- server-side cache stats after */

const statsAfter = json((await get('/cache/stats', 20000)).text);
function kd(a, b, k) { return a?.redis_info?.[k] != null && b?.redis_info?.[k] != null ? b.redis_info[k] - a.redis_info[k] : null; }
const redisDelta = {
  keyspace_hits: kd(statsBefore, statsAfter, 'keyspace_hits'),
  keyspace_misses: kd(statsBefore, statsAfter, 'keyspace_misses'),
};
const redisRunHitRate = redisDelta.keyspace_hits != null && (redisDelta.keyspace_hits + redisDelta.keyspace_misses) > 0
  ? Math.round((redisDelta.keyspace_hits / (redisDelta.keyspace_hits + redisDelta.keyspace_misses)) * 1000) / 10
  : null;

/* ------------------------------------------------------------------ output */

const out = {
  meta: {
    base: BASE, account: ACCOUNT, username: USERNAME, ranAt: new Date().toISOString(),
    note: 'Per-role tokens unavailable (test users 401/MFA); cross-role verdicts come from the admin-side access-simulator, not real per-role sessions.',
  },
  roles: { list: roles, discovery: roleDiscovery, d360AppRoles: d360RoleNames },
  endpoints: endpointResults,
  cache: {
    clientObservedHitRate: clientHitRate,
    clientHits: hitRows.length,
    clientEligible: okRows.length,
    serverStatsBefore: statsBefore?.cache_stats || null,
    serverStatsAfter: statsAfter?.cache_stats || null,
    redisBefore: statsBefore?.redis_info || null,
    redisAfter: statsAfter?.redis_info || null,
    redisDeltaDuringRun: redisDelta,
    redisRunHitRate,
  },
  simulator: { matrix: simMatrix, dataScopes, raw: simRaw },
  users: userGrants,
  myPermissions: myPerms ? { keys: Object.keys(myPerms), sample: sampleOf(JSON.stringify(myPerms)) } : null,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(`\n[probe] JSON written → ${OUT_PATH}`);

/* --------------------------------------------------------- summary tables */

console.log('\n===== ENDPOINT LATENCY / CACHE =====');
console.log(pad('endpoint', 44) + pad('st', 5) + pad('cold', 8) + pad('warm', 8) + pad('hit', 5) + pad('exec2', 7) + 'sample');
for (const r of endpointResults) {
  console.log(
    pad(r.path, 44) + pad(r.status, 5) + pad(r.ms1 + 'ms', 8) + pad(r.ms2 + 'ms', 8) +
    pad(r.cacheHit ? 'YES' : 'no', 5) + pad(r.execMs2 ?? '—', 7) + (r.dataSample || r.error || '').slice(0, 60)
  );
}
console.log(`\nclient-observed cache hit-rate: ${clientHitRate}% (${hitRows.length}/${okRows.length} 2xx endpoints)`);
if (redisRunHitRate != null) console.log(`redis keyspace hit-rate during run: ${redisRunHitRate}% (Δhits=${redisDelta.keyspace_hits} Δmisses=${redisDelta.keyspace_misses})`);

console.log('\n===== ROLE x MODULE (access-simulator) =====');
console.log(pad('role', 24) + SIM_MODULES.map((m) => pad(m.replace('_', '-').slice(0, 12), 14)).join(''));
for (const role of roles) {
  console.log(pad(role, 24) + SIM_MODULES.map((m) => pad(simMatrix[role]?.[m] ?? '?', 14)).join(''));
}

console.log('\n===== USERS (effective-grants) =====');
for (const u of userGrants) {
  console.log(`${pad(u.username, 20)} default_role=${pad(u.defaultRole, 22)} roles=[${u.roles.join(', ')}] super_admin=${u.isSuperAdmin} enforcement=${u.enforcement?.status ?? '—'}`);
}

const failed = endpointResults.filter((r) => !(r.status >= 200 && r.status < 300));
if (failed.length) {
  console.log('\n===== FAILED (non-2xx) =====');
  for (const f of failed) console.log(`${pad(f.status, 5)} ${pad(f.path, 44)} ${(f.error || f.dataSample || '').slice(0, 100)}`);
} else {
  console.log('\nAll curated endpoints returned 2xx.');
}
