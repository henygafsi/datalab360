// Generates a COMPACT functional API catalog from the backend OpenAPI snapshot
// + the route manifest. Output powers the admin "Functional API View".
// Each entry: method, path, group, action (summary), desc, tags, params,
// + derived: aiRole, finops, cache (stored-response hint), dataUserClarity, rbac.
//
// Run: node apps/data360/scripts/gen-api-catalog.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SNAP = path.join(ROOT, 'src/app/(dashboard)/admin/api-health/openapi-snapshot.json');
const MANIFEST = path.join(ROOT, 'backend-route-manifest.json');
const OUT_DIR = path.join(ROOT, 'src/app/(dashboard)/admin/api-health/data');
mkdirSync(OUT_DIR, { recursive: true });

const oapi = JSON.parse(readFileSync(SNAP, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// FE-wired detection: paths referenced as string literals in api-contracts.ts.
// An endpoint NOT referenced is "unwired" = a missing-from-FE reintegration target.
const CONTRACTS = path.join(ROOT, 'src/lib/api-contracts.ts');
const wiredRefs = new Set();
try {
  const c = readFileSync(CONTRACTS, 'utf8');
  for (const m of c.matchAll(/['"`](\/[a-zA-Z0-9_\-{}\/.:]+)['"`]/g)) {
    wiredRefs.add(m[1].replace(/\{[^}]+\}/g, '{}').replace(/\/$/, ''));
  }
} catch { /* contracts optional */ }
const isWired = (p) => wiredRefs.has(p.replace(/\{[^}]+\}/g, '{}').replace(/\/$/, ''));

const lc = (s) => (s || '').toLowerCase();
const seg = (p) => p.split('/').filter(Boolean)[0] || '(root)';

// --- derivation heuristics ---------------------------------------------------
const AI_RE = /cortex|semantic|embedding|vector|llm|\bml\b|machine.?learning|complete|sentiment|translat|summari|classif|forecast|anomaly|agent|chat|ai[-_/]/i;
const FINOPS_RE = /cost|credit|billing|spend|budget|finops|metering|warehouse.?usage|consumption|usage\/|\/usage|savings|optimi|resource.?monitor|storage.?cost/i;
const REALTIME_RE = /stream|sse|live|ws|notification|unread|activity-feed|status|health|ready|progress/i;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function aiRole(method, p, summary, desc, tags) {
  const hay = lc(`${p} ${summary} ${desc} ${tags.join(' ')}`);
  if (!AI_RE.test(hay)) return 'none';
  if (/generat|complete|draft|compose|chat|agent|translat|summari/.test(hay)) return 'ai-generation';
  if (/classif|sentiment|anomaly|forecast|predict|score|analyz|detect/.test(hay)) return 'ai-analysis';
  if (/embedding|vector|search|semantic/.test(hay)) return 'ai-retrieval';
  return 'ai-assisted';
}
function finopsType(method, p, summary, desc, tags) {
  const hay = lc(`${p} ${summary} ${desc} ${tags.join(' ')}`);
  if (!FINOPS_RE.test(hay)) return 'none';
  if (/optimi|savings|recommend|reduce/.test(hay)) return 'finops-optimize';
  if (/budget|monitor|alert|threshold/.test(hay)) return 'finops-control';
  return 'finops-observe';
}
function cacheHint(method, p, summary, desc, tags) {
  if (WRITE_METHODS.has(method)) return 'no-cache (mutation)';
  const hay = lc(`${p} ${summary} ${desc} ${tags.join(' ')}`);
  if (REALTIME_RE.test(hay)) return 'live (no-store)';
  return 'cacheable (store first response)';
}
// data_user role clarity: flag endpoints a data_user would hit that lack a desc
function dataUserClarity(p, summary, desc, tags) {
  const adminOnly = /admin|gouvernance|grants|rbac|platform|svc|service-account|deployment|infra/i.test(`${p} ${tags.join(' ')}`);
  const audience = adminOnly ? 'admin' : 'data-user';
  const clear = !!desc && desc.length > 25;
  return { audience, clear, needsDoc: audience === 'data-user' && !clear };
}
// Synthesized FR clarity hint for endpoints lacking a usable description — so a
// data_user gets a plain-language idea of the action even when the backend
// summary is terse. (Heuristic; replaced by real online-doc text when added.)
const VERB = { GET: 'Consulter', POST: 'Créer / lancer', PUT: 'Modifier', PATCH: 'Modifier', DELETE: 'Supprimer' };
function synthHint(method, p) {
  const segs = p.split('/').filter(Boolean).filter((s) => !/^\{.*\}$/.test(s));
  const module = segs[0] || 'root';
  const resource = segs.slice(1).join(' / ') || module;
  return `${VERB[method] || method} : ${resource} (module ${module})`;
}
function rbacKey(method, p) {
  const m = p.split('/').filter(Boolean);
  const module = m[0] || 'root';
  const action = WRITE_METHODS.has(method)
    ? (method === 'DELETE' ? 'delete' : /create|add|register/.test(lc(p)) ? 'create' : 'edit')
    : 'view';
  return `${module}:${action}`;
}

// --- build catalog -----------------------------------------------------------
const entries = [];
for (const [p, ops] of Object.entries(oapi.paths || {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!/^(get|post|put|patch|delete)$/i.test(method)) continue;
    const M = method.toUpperCase();
    const tags = op.tags || [];
    const summary = op.summary || '';
    const desc = op.description || '';
    const params = (op.parameters || []).map((x) => ({ n: x.name, in: x.in, req: !!x.required }));
    const hasBody = !!op.requestBody;
    entries.push({
      method: M,
      path: p,
      group: seg(p),
      action: summary || `${M} ${p}`,
      desc: desc.slice(0, 240),
      hint: desc && desc.length > 25 ? '' : synthHint(M, p),
      tags,
      params,
      hasBody,
      aiRole: aiRole(M, p, summary, desc, tags),
      finops: finopsType(M, p, summary, desc, tags),
      cache: cacheHint(M, p, summary, desc, tags),
      ...dataUserClarity(p, summary, desc, tags),
      rbac: rbacKey(M, p),
      wired: isWired(p),
    });
  }
}

// reconcile vs manifest (routes the FE/backend knows but openapi may normalize)
const oapiKeys = new Set(entries.map((e) => `${e.method} ${e.path}`));
const manifestExtra = (manifest.routes || []).filter(
  (r) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(r.method) && !oapiKeys.has(`${r.method} ${r.path.replace(/\{[^}]+\}/g, (m) => m)}`)
).length;

const groups = {};
for (const e of entries) groups[e.group] = (groups[e.group] || 0) + 1;
const meta = {
  generatedFrom: `openapi ${oapi.info?.title} v${oapi.info?.version}`,
  totalOps: entries.length,
  totalPaths: Object.keys(oapi.paths || {}).length,
  manifestRoutes: manifest.count,
  manifestNotInOpenapi: manifestExtra,
  groups: Object.entries(groups).sort((a, b) => b[1] - a[1]),
  aiOps: entries.filter((e) => e.aiRole !== 'none').length,
  finopsOps: entries.filter((e) => e.finops !== 'none').length,
  needsDoc: entries.filter((e) => e.needsDoc).length,
  cacheable: entries.filter((e) => e.cache.startsWith('cacheable')).length,
  wired: entries.filter((e) => e.wired).length,
  unwired: entries.filter((e) => !e.wired).length,
};

writeFileSync(path.join(OUT_DIR, 'api-catalog.json'), JSON.stringify(entries));
writeFileSync(path.join(OUT_DIR, 'api-catalog.meta.json'), JSON.stringify(meta, null, 2));
console.log('catalog:', entries.length, 'ops ->', path.join(OUT_DIR, 'api-catalog.json'));
console.log(JSON.stringify(meta, null, 2));
