// Perf audit of ALL pages as HAHA (data admin), local FE -> ONLINE backend.
// 2 passes per page: pass1 = cold, pass2 = warm. An endpoint slow (>800ms) on the
// WARM pass is NON-CACHED (or realtime) backend-side -> candidate for SVC cache.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const ACC = 'uchsfvb-HAHA', USER = 'HAHA', PASS = process.env.DATA360_E2E_PASSWORD || '';
const PAGES = [
  '/account-overview', '/data-source-connection', '/sources', '/explore-design',
  '/workflow', '/governance', '/bi-dashboard', '/intelligent', '/data-quality',
  '/observability', '/administration', '/project',
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
const p = await ctx.newPage();

// ---- login (robust, saves state) ----
let ok = false;
for (let a = 1; a <= 4 && !ok; a++) {
  try {
    await p.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await p.waitForSelector('input[name="account_name"]', { timeout: 60000 });
    await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(2500);
    for (const [n, v] of [['account_name', ACC], ['username', USER], ['password', PASS]]) {
      const el = p.locator(`input[name="${n}"]`); await el.click(); await el.fill(''); await el.pressSequentially(v, { delay: 30 });
    }
    await p.click('button[type="submit"]');
    for (let t = 0; t < 12 && p.url().includes('/signin'); t++) {
      await p.waitForTimeout(2000);
      if (t === 4) await p.click('button[type="submit"]').catch(() => {});
    }
    ok = !p.url().includes('/signin');
    console.log(`login attempt ${a}: ok=${ok}`);
  } catch (e) { console.log(`login attempt ${a} err ${String(e).slice(0, 110)}`); }
}
if (!ok) { console.log('LOGIN_FAILED'); await b.close(); process.exit(1); }
await ctx.storageState({ path: 'e2e/.auth/local-haha.json' });

// ---- per-request timing collection ----
let bucket = null; // {page, pass, entries:[]}
const t0map = new Map();
p.on('request', req => { if (req.url().includes('/api-proxy/')) t0map.set(req, Date.now()); });
async function record(req, status) {
  const t0 = t0map.get(req); if (!t0 || !bucket) return;
  const ms = Date.now() - t0; t0map.delete(req);
  const path = req.url().replace(/^https?:\/\/[^/]+\/api-proxy/, '').split('?')[0];
  bucket.entries.push({ path, method: req.method(), status, ms });
}
p.on('requestfinished', async req => {
  if (!req.url().includes('/api-proxy/')) return;
  const resp = await req.response().catch(() => null);
  await record(req, resp ? resp.status() : 0);
});
p.on('requestfailed', req => { if (req.url().includes('/api-proxy/')) record(req, -1); });

const runs = [];
async function visit(path, pass) {
  bucket = { page: path, pass, entries: [] };
  const nav0 = Date.now();
  try { await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) { bucket.navError = String(e).slice(0, 90); }
  // settle: heavy pages fetch in waves
  await p.waitForTimeout(path === '/explore-design' || path === '/workflow' ? 16000 : 11000);
  bucket.navMs = Date.now() - nav0;
  const body = (await p.locator('body').innerText().catch(() => '')) || '';
  bucket.textLen = body.length;
  bucket.spinner = /loading|chargement|verifying session/i.test(body.slice(0, 2000));
  runs.push(bucket);
  const slow = bucket.entries.filter(e => e.ms > 800).length;
  console.log(`[pass${pass}] ${path.padEnd(24)} nav=${String(bucket.navMs).padStart(6)}ms api=${String(bucket.entries.length).padStart(3)} slow>800ms=${slow}`);
  bucket = null;
}

console.log('=== PASS 1 (cold-ish) ===');
for (const pg of PAGES) await visit(pg, 1);
console.log('=== PASS 2 (warm) ===');
for (const pg of PAGES) await visit(pg, 2);
await b.close();

// ---- aggregate ----
const byEp = {};
for (const r of runs) for (const e of r.entries) {
  const k = `${e.method} ${e.path}`;
  (byEp[k] ||= { p1: [], p2: [], pages: new Set(), statuses: new Set() });
  byEp[k][r.pass === 1 ? 'p1' : 'p2'].push(e.ms);
  byEp[k].pages.add(r.page); byEp[k].statuses.add(e.status);
}
const max = a => a.length ? Math.max(...a) : null;
const rows = Object.entries(byEp).map(([k, v]) => ({
  ep: k, p1max: max(v.p1), p2max: max(v.p2),
  pages: [...v.pages].join(','), statuses: [...v.statuses].join(','),
  nonCached: (max(v.p2) ?? 0) > 800,
})).sort((a, b) => (b.p2max ?? 0) - (a.p2max ?? 0));

fs.writeFileSync('e2e/.auth/perf_audit.json', JSON.stringify({ runs, rows }, null, 1));
console.log('\n=== NON-CACHED (warm > 800ms) — cache these via SVC ===');
for (const r of rows.filter(r => r.nonCached).slice(0, 30))
  console.log(` ${String(r.p2max).padStart(6)}ms warm | ${String(r.p1max).padStart(6)}ms cold | ${r.statuses.padEnd(7)} | ${r.ep}  [${r.pages}]`);
console.log('\n=== COLD-ONLY SLOW (warm fast = cache works, needs pre-warm) ===');
for (const r of rows.filter(r => !r.nonCached && (r.p1max ?? 0) > 1500).slice(0, 20))
  console.log(` ${String(r.p1max).padStart(6)}ms cold -> ${String(r.p2max).padStart(6)}ms warm | ${r.ep}`);
console.log('\n=== PAGE NAV TIMES ===');
for (const pg of PAGES) {
  const a = runs.find(r => r.page === pg && r.pass === 1), bb = runs.find(r => r.page === pg && r.pass === 2);
  console.log(` ${pg.padEnd(24)} cold=${a?.navMs}ms warm=${bb?.navMs}ms api1=${a?.entries.length} api2=${bb?.entries.length} ${a?.navError ? 'ERR ' + a.navError : ''}`);
}
console.log('\nPERF_AUDIT_DONE -> e2e/.auth/perf_audit.json');
