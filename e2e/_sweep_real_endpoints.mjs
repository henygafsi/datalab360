/**
 * Real-endpoint green sweep — multi source-based project.
 *
 * Complements admin/api-health (which probes with FAKE inputs, so its 4xx is
 * benign-by-design). This sweep uses REAL projects + REAL params and reports
 * TRUE green %, separating genuine 5xx/4xx defects from expected product gates.
 *
 * Run:  node e2e/_sweep_real_endpoints.mjs [maxProjects]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.BACKEND || 'http://localhost:8000';
const MAX = parseInt(process.argv[2] || '5', 10);

function readToken() {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth', 'state.json'), 'utf8'));
  const tok = (JSON.stringify(s).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [])
    .sort((a, b) => b.length - a.length)[0];
  if (!tok) throw new Error('no JWT in e2e/.auth/state.json');
  const c = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString());
  if (c.exp && c.exp * 1000 < Date.now()) throw new Error('token expired — re-run login');
  return { tok, account: c.account_name || c.account, user: c.sub || c.username, role: c.role };
}
const { tok, account, user, role } = readToken();
const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

async function call(method, p, body) {
  try {
    const r = await fetch(BACKEND + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    let j; try { j = await r.json(); } catch { j = null; }
    return { status: r.status, body: j };
  } catch (e) { return { status: 0, body: { error: e.message } }; }
}

// Classify: green = 2xx; gate = a 4xx that is a correct product rule (auth/empty/needs-version);
// defect = 5xx OR an unexpected 4xx.
function classify(status, body) {
  if (status >= 200 && status < 300) return 'green';
  if (status >= 500 || status === 0) return 'defect';
  const txt = JSON.stringify(body || '').toLowerCase();
  if (/version|no current|requires|not found|empty|permission|forbidden|required/.test(txt)) return 'gate';
  return 'defect';
}

console.log(`\n=== Real-endpoint sweep · ${user}/${role} · acct=${account} ===\n`);

// 1. enumerate real projects (skip throwaway DELETEME)
const proj = await call('GET', '/projects');
const all = (proj.body?.projects || proj.body?.items || proj.body || []).filter(
  p => p && (p.project_id || p.id) && !/DELETEME|_TMP/i.test(p.name || p.project_name || ''),
);
const projects = all.slice(0, MAX);
console.log(`projects: ${all.length} real (sweeping ${projects.length})\n`);

const tally = { green: 0, gate: 0, defect: 0 };
const defects = [];

// Per-project read-side endpoints (safe, no mutation)
for (const p of projects) {
  const id = p.project_id || p.id;
  const name = (p.name || p.project_name || id).slice(0, 28);
  const legs = [
    ['versions', 'GET', `/explore-design/${id}/versions?limit=3`],
    ['ddl-actions', 'GET', `/explore-design/${id}/ddl-actions`],
    ['deployments', 'GET', `/explore-design/${id}/deployments`],
  ];
  const marks = [];
  for (const [label, m, url] of legs) {
    const r = await call(m, url);
    const cls = classify(r.status, r.body);
    tally[cls]++;
    marks.push(`${label}:${cls === 'green' ? '✅' : cls === 'gate' ? '🔒' : '❌' + r.status}`);
    if (cls === 'defect') defects.push(`${name} ${label} -> ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }
  console.log(`  ${name.padEnd(28)} ${marks.join('  ')}`);
}

// 2. account-wide governance / admin endpoints (once)
console.log('\n  -- governance / admin (account-wide) --');
const adminLegs = [
  ['cache/coverage', 'GET', '/admin/cache/coverage'],
  ['cache/svc-health', 'GET', '/admin/cache/svc-health'],
  ['cache/warm-status', 'GET', '/admin/cache/warm-status'],
  ['invalidate-surface', 'POST', '/admin/cache/invalidate-surface', { account, page: 'explore-design', module: 'explore_design', dry_run: true }],
  ['my-permissions', 'GET', '/gouvernance/d360-roles/my-permissions'],
];
for (const [label, m, url, body] of adminLegs) {
  const r = await call(m, url, body);
  const cls = classify(r.status, r.body);
  tally[cls]++;
  console.log(`  ${label.padEnd(28)} ${cls === 'green' ? '✅' : cls === 'gate' ? '🔒' : '❌ ' + r.status}`);
  if (cls === 'defect') defects.push(`${label} -> ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

const total = tally.green + tally.gate + tally.defect;
const reachable = tally.green + tally.gate;
console.log(`\n=== ${tally.green} green · ${tally.gate} gated(correct) · ${tally.defect} defect / ${total} ===`);
console.log(`reachable (green+gate): ${((reachable / total) * 100).toFixed(1)}%  ·  true-green: ${((tally.green / total) * 100).toFixed(1)}%`);
if (defects.length) {
  console.log('\nDEFECTS:');
  defects.forEach(d => console.log('  ❌ ' + d));
}
process.exit(tally.defect > 0 ? 1 : 0);
