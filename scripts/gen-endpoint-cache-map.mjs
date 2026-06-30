/**
 * gen-endpoint-cache-map — enrich the endpoint catalog with REAL cache metadata
 * (cached?/type/TTL/strategy/invalidation) parsed from backend cache decorators,
 * plus live response-time from a probe. Powers the Administrator endpoint KPIs:
 * response time · cached-or-not · invalidation pattern.
 *
 * Usage:  node scripts/gen-endpoint-cache-map.mjs
 *   OPENAPI=http://localhost:8000/openapi.json  BACKEND_DIR=../backend
 * Output: apps/data360/src/app/(dashboard)/admin/api-health/data/endpoint-cache-map.json
 */
import fs from 'fs';
import path from 'path';

const FRONT = path.resolve(import.meta.dirname, '..');
const BACKEND = process.env.BACKEND_DIR || path.resolve(FRONT, '../backend');
const OUT = path.join(FRONT, 'apps/data360/src/app/(dashboard)/admin/api-health/data/endpoint-cache-map.json');
const OPENAPI = process.env.OPENAPI || 'http://localhost:8000/openapi.json';
const TOKEN_FILE = path.join(process.env.HOME, '.claude/jobs/ce1f3fe1/tmp/tok.txt');

// ── 1. Scan backend python for cache decorators wrapping a def ──
// Capture: funcName -> { cacheType, ttl, strategy, invalidation }
function scanBackend() {
  const byFunc = {};
  const DEC = /@(shared_cache|session_cache|account_role_cache)\(([^)]*)\)/;
  function walk(dir) {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (!/__pycache__|\.venv|tests?$/.test(e)) walk(p); }
      else if (e.endsWith('.py')) scanFile(p);
    }
  }
  function scanFile(file) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(DEC);
      if (!m) continue;
      const cacheType = m[1];
      const args = m[2];
      const ttl = (args.match(/ttl\s*=\s*(\d+)/) || [])[1] || null;
      const strategy = (args.match(/strategy\s*=\s*CacheStrategy\.(\w+)/) || [])[1]
        || (cacheType === 'session_cache' ? 'session' : null);
      // invalidation hint: a trailing comment on the decorator line often names CacheKey.X / "invalidated via …"
      const comment = (lines[i].split('#')[1] || '');
      const inval = (comment.match(/CacheKey\.[A-Z_]+/g) || []).join(',')
        || (/invalidat/i.test(comment) ? comment.trim().slice(0, 80) : null);
      // find the def within the next ~8 lines (skip other decorators)
      for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
        const d = lines[j].match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
        if (d) {
          byFunc[d[1]] = {
            cacheType, ttl: ttl ? Number(ttl) : null, strategy,
            invalidation: inval, file: file.replace(BACKEND + '/', 'backend/'),
          };
          break;
        }
      }
    }
  }
  walk(path.join(BACKEND, 'app'));
  return byFunc;
}

async function main() {
  const spec = await fetch(OPENAPI).then((r) => r.json());
  const byFunc = scanBackend();
  const funcNames = Object.keys(byFunc).sort((a, b) => b.length - a.length); // longest first

  // optional live probe for response time (parameterless GETs only)
  let token = null;
  try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* no token → skip timing */ }
  const base = OPENAPI.replace('/openapi.json', '');

  const endpoints = [];
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const [verb, op] of Object.entries(methods)) {
      if (typeof op !== 'object' || !['get', 'post', 'put', 'patch', 'delete'].includes(verb)) continue;
      const opId = op.operationId || '';
      // match the longest funcName that is a prefix of the operationId
      const fn = funcNames.find((f) => opId === f || opId.startsWith(f + '_'));
      const cache = fn ? byFunc[fn] : null;
      endpoints.push({
        path: p, method: verb.toUpperCase(),
        module: p.replace(/^\//, '').split('/')[0],
        cached: !!cache,
        cacheType: cache?.cacheType || null,
        ttl: cache?.ttl ?? null,
        strategy: cache?.strategy || null,
        invalidation: cache?.invalidation || null,
        responseMs: null,
      });
    }
  }

  // probe parameterless GETs for response time (pooled, capped)
  if (token) {
    const H = { Authorization: `Bearer ${token}` };
    const probable = endpoints.filter((e) => e.method === 'GET' && !e.path.includes('{'));
    const pool = 8;
    for (let i = 0; i < probable.length; i += pool) {
      await Promise.all(probable.slice(i, i + pool).map(async (e) => {
        const t0 = Date.now();
        try { await fetch(base + e.path, { headers: H }); } catch { /* ignore */ }
        e.responseMs = Date.now() - t0;
      }));
    }
  }

  const cachedCount = endpoints.filter((e) => e.cached).length;
  const payload = {
    generatedFrom: OPENAPI,
    totalEndpoints: endpoints.length,
    cachedEndpoints: cachedCount,
    realtimeEndpoints: endpoints.length - cachedCount,
    byCacheType: endpoints.reduce((a, e) => { if (e.cacheType) a[e.cacheType] = (a[e.cacheType] || 0) + 1; return a; }, {}),
    endpoints: endpoints.sort((a, b) => a.module.localeCompare(b.module) || a.path.localeCompare(b.path)),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`wrote ${OUT}`);
  console.log(`endpoints ${endpoints.length} · cached ${cachedCount} · by type ${JSON.stringify(payload.byCacheType)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
