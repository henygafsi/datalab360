/**
 * gen-endpoint-file-map — build the authoritative endpoint→file catalog.
 *
 * For every backend path in the live OpenAPI (the 912-path source of truth),
 * find which frontend file(s) actually call it. The result powers the
 * Administrator → "API Catalog" tab: all endpoints, their backing files, and
 * whether they are wired into the app.
 *
 * Usage:  node scripts/gen-endpoint-file-map.mjs
 *   OPENAPI=http://localhost:8000/openapi.json (default)
 * Output: apps/data360/src/app/(dashboard)/admin/api-health/data/endpoint-file-map.json
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'apps/data360/src');
const OUT = path.join(SRC, 'app/(dashboard)/admin/api-health/data/endpoint-file-map.json');
const OPENAPI = process.env.OPENAPI || 'http://localhost:8000/openapi.json';

// Normalize a path to a comparable pattern: each {param} or ${expr} segment → ':'
function normalize(p) {
  return p
    .replace(/\$\{[^}]*\}/g, ':')     // FE template `${id}`  → :
    .replace(/\{[^}]*\}/g, ':')        // openapi `{id}`       → :
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase();
}

// Module bucket from the first path segment (best-effort grouping for the UI).
function moduleOf(p) {
  const seg = p.replace(/^\//, '').split('/')[0] || 'root';
  return seg.replace(/[^a-z0-9_-]/gi, '');
}

async function main() {
  // 1. Authoritative endpoint list from the live backend.
  const spec = await fetch(OPENAPI).then((r) => r.json());
  const endpoints = [];
  for (const [p, methods] of Object.entries(spec.paths)) {
    const verbs = Object.keys(methods).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m));
    endpoints.push({ path: p, methods: verbs.map((v) => v.toUpperCase()), module: moduleOf(p), norm: normalize(p) });
  }

  // 2. Harvest every path-like string literal referenced in the FE, with file+line.
  //    Pure-Node FS walk over api-contracts.ts + app/services (+ component dirs).
  const SCAN_ROOTS = [
    path.join(SRC, 'lib/api-contracts.ts'),
    path.join(SRC, 'app/services'),
  ];
  const LITERAL = /['"`](\/[a-zA-Z0-9_\-{}$()/.:]+)['"`]/g;
  const refs = [];
  function scanFile(file) {
    if (!/\.(ts|tsx)$/.test(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    const rel = file.replace(ROOT + '/', '');
    text.split('\n').forEach((line, i) => {
      let m;
      LITERAL.lastIndex = 0;
      while ((m = LITERAL.exec(line))) {
        const lit = m[1];
        if (lit.length < 4) continue;             // skip '/', '/x'
        if (/\.(png|jpg|svg|css|js|json|woff)/.test(lit)) continue; // asset paths
        refs.push({ file: rel, line: i + 1, norm: normalize(lit) });
      }
    });
  }
  function walk(p) {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    } else {
      scanFile(p);
    }
  }
  for (const r of SCAN_ROOTS) if (fs.existsSync(r)) walk(r);

  // 3. Match each endpoint to FE files. Honest tiers:
  //    - exact: a FE literal normalizes to exactly this endpoint  → wired
  //    - parent: a FE literal is a strict ancestor segment of it  → partial
  //      (the FE references a parent route but not this exact path)
  const result = endpoints.map((ep) => {
    const exact = refs.filter((r) => r.norm === ep.norm);
    const parent = exact.length
      ? []
      : refs.filter((r) => r.norm.length > 4 && ep.norm.startsWith(r.norm + '/'));
    const hits = exact.length ? exact : parent;
    const files = [...new Set(hits.map((h) => h.file))].sort();
    return {
      path: ep.path,
      methods: ep.methods,
      module: ep.module,
      coverage: exact.length ? 'exact' : parent.length ? 'parent' : 'none',
      wired: exact.length > 0,
      files: files.slice(0, 6),
    };
  });

  const byModule = {};
  for (const e of result) (byModule[e.module] ||= []).push(e);
  const exact = result.filter((e) => e.coverage === 'exact').length;
  const parent = result.filter((e) => e.coverage === 'parent').length;
  const none = result.filter((e) => e.coverage === 'none').length;

  const payload = {
    generatedFrom: OPENAPI,
    totalEndpoints: result.length,
    wiredEndpoints: exact,
    partialEndpoints: parent,
    unwiredEndpoints: none,
    moduleCount: Object.keys(byModule).length,
    endpoints: result.sort((a, b) => a.module.localeCompare(b.module) || a.path.localeCompare(b.path)),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`wrote ${OUT}`);
  console.log(`endpoints: ${result.length} · exact-wired: ${exact} · parent: ${parent} · unwired: ${none} · modules: ${Object.keys(byModule).length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
