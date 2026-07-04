#!/usr/bin/env node
/**
 * PREVENTIVE endpoint-health gate for CI/CD.
 * Reads the OpenAPI contract from the RUNNING target, probes every GET (read-only, safe),
 * and FAILS the pipeline on regressions: any 5xx, or any contract route that 404s (dropped route).
 * This is a real reachability gate, NOT a fake-id functional probe.
 *
 *   BASE=http://localhost:8000 TOKEN=<jwt> node endpoint-health.mjs
 *   BASE=https://api.datalab360.io TOKEN=$SVC_JWT FAIL_ON=5xx,404 node endpoint-health.mjs
 *
 * Exit 0 = healthy, 1 = regressions found, 2 = could not reach target / no contract.
 * Env: BASE (required), TOKEN (bearer; without it 401s are treated as "auth-gated OK"),
 *      BASELINE (path to a previous report.json to diff dropped routes), MAX=<n> cap probes,
 *      CONCURRENCY (default 12), TIMEOUT_MS (default 15000), FAIL_ON (default "5xx,404").
 */
import fs from 'node:fs';

const BASE = (process.env.BASE || 'http://localhost:8000').replace(/\/$/, '');
const TOKEN = process.env.TOKEN || '';
const MAX = process.env.MAX ? +process.env.MAX : Infinity;
const CONCURRENCY = +(process.env.CONCURRENCY || 12);
const TIMEOUT_MS = +(process.env.TIMEOUT_MS || 15000);
const FAIL_ON = (process.env.FAIL_ON || '5xx,404').split(',').map(s => s.trim());
const OUT = process.env.OUT || 'endpoint-health-report.json';

const hdr = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

async function fetchJson(path) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try { const r = await fetch(`${BASE}${path}`, { headers: { ...hdr, accept: 'application/json' }, signal: c.signal }); return r; }
  finally { clearTimeout(t); }
}

async function loadContract() {
  for (const p of ['/openapi.json', '/api/openapi.json', '/docs/openapi.json']) {
    try { const r = await fetchJson(p); if (r.ok) return await r.json(); } catch {}
  }
  return null;
}

// fill required path params with a safe sentinel; such a call reaching the handler
// returns 404/422 (reachable) rather than 5xx — that's the signal we want.
const SENTINEL = { default: '__healthcheck__', id: '1', account: process.env.ACCOUNT || 'HAHA', username: 'haha', project_id: '1' };
function fill(path) {
  return path.replace(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(SENTINEL[name] || SENTINEL.default));
}

function classify(status) {
  if (status === 0) return 'unreachable';
  if (status >= 500) return '5xx';
  if (status === 404) return '404';
  if (status === 401 || status === 403) return 'auth';
  if (status === 422 || status === 400) return 'param';   // reached handler, bad sentinel — OK for reachability
  if (status >= 200 && status < 400) return '2xx';
  return 'other';
}

async function pool(items, worker, n) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx], idx); }
  }));
  return out;
}

(async () => {
  const spec = await loadContract();
  if (!spec || !spec.paths) { console.error(`✗ no OpenAPI contract at ${BASE} — target down?`); process.exit(2); }

  // GET only (read-only, safe to probe in a pipeline). Mutations are never auto-probed.
  let gets = [];
  for (const [p, ops] of Object.entries(spec.paths)) if (ops.get) gets.push(p);
  gets = gets.filter(p => !/\b(export|download|stream|logout|shutdown)\b/i.test(p)).slice(0, MAX);
  console.log(`probing ${gets.length} GET endpoints @ ${BASE} ${TOKEN ? '(authed)' : '(no token → 401=OK)'}`);

  const results = await pool(gets, async (p) => {
    const t0 = Date.now();
    try { const r = await fetchJson(fill(p)); return { path: p, status: r.status, ms: Date.now() - t0, klass: classify(r.status) }; }
    catch (e) { return { path: p, status: 0, ms: Date.now() - t0, klass: 'unreachable', err: String(e.name || e).slice(0, 40) }; }
  }, CONCURRENCY);

  const by = {}; for (const r of results) by[r.klass] = (by[r.klass] || 0) + 1;
  const broken = results.filter(r =>
    (FAIL_ON.includes('5xx') && r.klass === '5xx') ||
    (FAIL_ON.includes('404') && r.klass === '404') ||
    (FAIL_ON.includes('unreachable') && r.klass === 'unreachable'));

  // regression diff vs baseline (routes that were healthy before, broken now)
  let regressions = broken;
  if (process.env.BASELINE && fs.existsSync(process.env.BASELINE)) {
    const base = JSON.parse(fs.readFileSync(process.env.BASELINE, 'utf8'));
    const wasOk = new Set((base.results || []).filter(r => ['2xx', 'auth', 'param'].includes(r.klass)).map(r => r.path));
    regressions = broken.filter(r => wasOk.has(r.path));
  }

  const slow = results.filter(r => r.ms > (+process.env.SLOW_MS || 3000)).sort((a, b) => b.ms - a.ms).slice(0, 10);
  const report = { generated: new Date().toISOString(), base: BASE, total: results.length, breakdown: by, broken, slow, results };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

  console.log('\nbreakdown:', JSON.stringify(by));
  if (slow.length) console.log('slowest:', slow.slice(0, 5).map(r => `${r.ms}ms ${r.path}`).join(' · '));
  if (regressions.length) {
    console.error(`\n✗ ${regressions.length} broken/regressed endpoints:`);
    regressions.slice(0, 30).forEach(r => console.error(`  ${r.status || 'ERR'}  ${r.path}`));
    console.error(`\nreport → ${OUT}`);
    process.exit(1);
  }
  console.log(`\n✓ no ${FAIL_ON.join('/')} regressions across ${results.length} endpoints. report → ${OUT}`);
})();
