// Admin/governance REAL-DATA detection sweep.
// Loads every administrator page against the live local app with saved auth and
// classifies each GREEN / AMBER / RED so the detect→fix loop has a target list.
//   GREEN = renders, no console errors, no 5xx, has real data (low "—" ratio)
//   AMBER = renders but data-thin (many "—"/empty) or has non-fatal 4xx
//   RED   = blank / error boundary / 5xx / redirected to /signin (auth or crash)
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const SHOTS = 'docs/product-readiness-audit/screens/admin-realdata';
mkdirSync(SHOTS, { recursive: true });
// Prefer the freshest saved auth (minted is regenerated more recently than the
// interactive login state). The minted session passes NextAuth so pages RENDER;
// whether backend data calls return rows depends on a live warehouse session.
const AUTH = existsSync('e2e/.auth/state-minted.json') ? 'e2e/.auth/state-minted.json' : 'e2e/.auth/state.json';
console.log('using auth:', AUTH);

// The full administrator surface.
const PAGES = [
  ['governance-home', '/governance'],
  ['governance-users', '/governance/users'],
  ['governance-roles', '/governance/roles'],
  ['governance-grants', '/governance/grants'],
  ['governance-policies', '/governance/policies'],
  ['governance-security-matrix', '/governance/security-matrix'],
  ['governance-oauth', '/governance/oauth'],
  ['governance-projects', '/governance/projects'],
  ['administration-health', '/administration?tab=health'],
  ['administration-performance', '/administration?tab=performance'],
  ['administration-access', '/administration?tab=access'],
  ['administration-projects', '/administration?tab=projects'],
  ['administration-config', '/administration?tab=config'],
  ['admin-api-health', '/admin/api-health'],
  ['admin-performance', '/admin/performance'],
  ['admin-data360-config', '/admin/data360-config'],
  ['admin-platform-settings', '/admin/platform-settings'],
  ['account-overview', '/account-overview'],
];

// Console-error noise we ignore (not page-data failures).
const IGNORE_CONSOLE = /favicon|ResizeObserver|hydrat|Download the React DevTools|\[Fast Refresh\]|webpack-hmr|source ?map/i;
// 4xx that are benign at the page level (auth session probes, optional features).
const BENIGN_NET = /\/api\/auth\/session|\/track|unread-count|hot-update/i;
const ERROR_BOUNDARY = /Something went wrong|Une erreur|Application error|Unhandled|Failed to fetch|Cannot read propert|undefined is not/i;

// ── Warm-up: trigger Next.js dev route compilation BEFORE measuring, so the
// measured pass never catches a route mid-compile (the cold-compile transient
// that produced false 500s + chunk-404s). Even a 307 compiles the route.
async function warm() {
  for (const [, path] of PAGES) {
    try { await fetch(`${BASE}${path}`, { redirect: 'manual' }); } catch { /* compile-trigger only */ }
  }
}
console.log('warming routes (compile)…');
await warm();
await new Promise(r => setTimeout(r, 4000));
await warm(); // second pass: anything still compiling on the first is ready now

const b = await chromium.launch();
const ctx = await b.newContext({
  storageState: AUTH,
  viewport: { width: 1600, height: 1000 },
});

async function probe(name, path, shot) {
  const p = await ctx.newPage();
  const errs = [], net5 = [], net4 = [];
  p.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!IGNORE_CONSOLE.test(t)) errs.push(t.slice(0, 160)); } });
  p.on('response', r => {
    const s = r.status(); const u = r.url().replace(BASE, '').split('?')[0];
    if (BENIGN_NET.test(u)) return;
    if (s >= 500) net5.push(s + ' ' + u);
    else if (s >= 400) net4.push(s + ' ' + u);
  });
  let navErr = null;
  await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 70000 }).catch(e => { navErr = e.message.slice(0, 120); });
  await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(5000); // let lazy data settle
  const body = (await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const finalUrl = p.url().replace(BASE, '');
  const dashes = (body.match(/—/g) || []).length;
  const boundary = ERROR_BOUNDARY.test(body);
  const redirected = /\/signin|\/login/.test(finalUrl);
  const tabs = await p.getByRole('tab').count().catch(() => 0);
  const tables = await p.locator('table, [role="grid"], [role="table"]').count().catch(() => 0);
  const buttons = await p.getByRole('button').count().catch(() => 0);
  const rows = await p.locator('tbody tr, [role="row"]').count().catch(() => 0);

  // Classify. AUTH_STALE is held separate from RED so a real page defect is
  // never confused with an expired session (which only the user can refresh).
  let verdict = 'GREEN';
  const reasons = [];
  if (redirected) { verdict = 'AUTH_STALE'; reasons.push('redirected→/signin (session expired)'); }
  else if (navErr) { verdict = 'RED'; reasons.push('nav:' + navErr); }
  else if (boundary) { verdict = 'RED'; reasons.push('error-boundary text'); }
  else if (net5.length) { verdict = 'RED'; reasons.push(net5.join(',')); }
  else if (body.length < 300) { verdict = 'RED'; reasons.push('blank/thin body (' + body.length + ' chars)'); }
  else {
    if (errs.length) { verdict = 'AMBER'; reasons.push(errs.length + ' console errors'); }
    if (net4.length) { verdict = 'AMBER'; reasons.push(net4.length + 'x 4xx'); }
    if (dashes >= 12 && rows === 0) { verdict = 'AMBER'; reasons.push(dashes + ' empty "—" cells, 0 data rows'); }
  }
  if (shot) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
  await p.close();
  return { name, path, finalUrl, verdict, reasons, bodyLen: body.length, dashes, tabs, tables, buttons, rows, net5, net4: net4.slice(0, 8), errs: errs.slice(0, 6) };
}

// Transient causes worth one re-probe (cold compile / first-hit data timeouts).
const TRANSIENT = /nav:|5xx|blank|thin body/i;
const results = [];
for (const [name, path] of PAGES) {
  let row = await probe(name, path, true);
  if (row.verdict === 'RED' && TRANSIENT.test(row.reasons.join(' '))) {
    await new Promise(r => setTimeout(r, 3000));
    const retry = await probe(name, path, true);
    retry.reprobed = true;
    row = retry;
  }
  results.push(row);
  console.log(`${row.verdict.padEnd(10)} ${name.padEnd(28)} body=${String(row.bodyLen).padStart(5)} rows=${String(row.rows).padStart(3)} —=${String(row.dashes).padStart(3)} 5xx=${row.net5.length} 4xx=${row.net4.length} err=${row.errs.length} ${row.reasons.join('; ')}`);
}

const green = results.filter(r => r.verdict === 'GREEN').length;
const amber = results.filter(r => r.verdict === 'AMBER').length;
const red = results.filter(r => r.verdict === 'RED').length;
const authStale = results.filter(r => r.verdict === 'AUTH_STALE').length;
const reachable = results.length - authStale;
const pct = reachable ? Math.round((green / reachable) * 100) : 0;
console.log(`\n=== ADMIN REAL-DATA SWEEP: ${green} GREEN / ${amber} AMBER / ${red} RED / ${authStale} AUTH_STALE  (${pct}% green of ${reachable} reachable; ${authStale} need a fresh session) ===`);
writeFileSync('e2e/_admin-realdata-results.json', JSON.stringify({ ts: new Date().toISOString(), auth: AUTH, green, amber, red, authStale, pct, results }, null, 2));
console.log('wrote e2e/_admin-realdata-results.json + screenshots in', SHOTS);
await b.close();
