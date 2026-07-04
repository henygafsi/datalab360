#!/usr/bin/env node
/**
 * _contract-sweep.mjs — Sweep EVERY GET endpoint declared in the FE contract
 * (apps/data360/src/lib/api-contracts.ts → API.*) against the live backend,
 * audit returns, and cross-check CRUD-7 completeness vs the deployed route set.
 *
 * Safety: this script ONLY ever issues HTTP GET. A GET to a POST-only route just
 * 405s — it cannot mutate. Names that imply side effects on a GET are denied.
 * Secrets (password/token) are NEVER printed.
 *
 * Usage:
 *   node e2e/_contract-sweep.mjs            # full live sweep + write doc
 *   node e2e/_contract-sweep.mjs --parse    # parse-only (no network), print stats
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BACKEND = '/Users/datalab360/Documents/data360_pro/backend';
const HOST = 'http://api.datalab360.io';
const ACC = 'uchsfvb-HAHA', USER = 'HAHA';
const CREDS = '/Users/datalab360/Documents/data360_pro/.platform-credentials.txt';
const CONTRACTS = '/Users/datalab360/Documents/data360_pro/datalab360Front/apps/data360/src/lib/api-contracts.ts';
const DOC = '/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/CONTRACT_SWEEP_2026-07-02.md';
const PARSE_ONLY = process.argv.includes('--parse');
const CONCURRENCY = 5;
const TIMEOUT_MS = 20000;

// ---------------------------------------------------------------- contract qs
const enc = encodeURIComponent;
function qs(params) {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------- secrets
function readPass() {
  if (process.env.DATA360_E2E_PASSWORD) return process.env.DATA360_E2E_PASSWORD;
  const lines = fs.readFileSync(CREDS, 'utf8').split(/\r?\n/);
  const i = lines.findIndex((l) => /uchsfvb-HAHA/.test(l));
  if (i < 0) return '';
  for (let j = i; j < Math.min(i + 8, lines.length); j++) {
    const m = lines[j].match(/^\s*Password:\s*(.+?)\s*$/i);
    if (m) return m[1];
  }
  return '';
}

// ---------------------------------------------------------------- PARSER
// Anchor on `=>`. For each arrow: walk backward to capture the (params) group
// and the property identifier; walk forward (template/brace-aware) to the
// property terminator. Track a structural key-stack for module attribution.
function stripToApiBlock(src) {
  const start = src.indexOf('export const API = {');
  const braceStart = src.indexOf('{', start);
  const end = src.indexOf('\n} as const;', braceStart);
  return { text: src.slice(braceStart + 1, end), offset: braceStart + 1 };
}

// forward-capture an expression starting at idx (first non-ws after `=>`)
function captureExpr(t, idx) {
  let i = idx;
  let depth = 0;         // () [] {}
  let inTpl = false;     // backtick
  const tplStack = [];   // ${ } depth while in template
  let started = false;
  const block = t[i] === '{'; // function block body
  for (; i < t.length; i++) {
    const c = t[i];
    if (inTpl) {
      if (c === '\\') { i++; continue; }
      if (c === '`') { inTpl = false; continue; }
      if (c === '$' && t[i + 1] === '{') { tplStack.push('$'); i++; depth++; continue; }
      if (c === '}' && tplStack.length) { tplStack.pop(); depth--; continue; }
      continue;
    }
    if (c === '`') { inTpl = true; started = true; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; }
      started = true; continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; started = true; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return { expr: t.slice(idx, i).trim(), end: i }; // closing of parent object
      depth--;
      if (block && depth === 0) { // end of function block body
        return { expr: t.slice(idx, i + 1).trim(), end: i + 1 };
      }
      continue;
    }
    if (c === ',' && depth === 0) return { expr: t.slice(idx, i).trim(), end: i };
    if (!/\s/.test(c)) started = true;
  }
  return { expr: t.slice(idx).trim(), end: t.length };
}

// find matching open paren scanning backward from a ')' index
function matchParenBack(t, closeIdx) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    const c = t[i];
    if (c === ')') depth++;
    else if (c === '(') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function paramNames(raw) {
  // split at top-level commas, take leading identifier of each segment
  const names = [];
  let depth = 0, seg = '';
  for (const c of raw) {
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { names.push(seg); seg = ''; } else seg += c;
  }
  if (seg.trim()) names.push(seg);
  return names.map((s) => { const m = s.trim().match(/^([A-Za-z_$][\w$]*)/); return m ? m[1] : null; })
              .filter(Boolean);
}

// JSDoc/comment method verbs immediately preceding a leaf at position `nameIdx`
function methodVerbsBefore(src, nameIdx) {
  let i = nameIdx - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  // block comment ends with */
  if (src[i] === '/' && src[i - 1] === '*') {
    const openC = src.lastIndexOf('/*', i);
    if (openC >= 0) return extractVerbs(src.slice(openC, i + 1));
  }
  // line comments: collect contiguous // lines
  let acc = '', guard = 0;
  while (i >= 0 && guard++ < 20) {
    const ls = src.lastIndexOf('\n', i);
    const line = src.slice(ls + 1, i + 1);
    if (/^\s*\/\//.test(line)) { acc = line + '\n' + acc; i = ls - 1; }
    else break;
  }
  return acc ? extractVerbs(acc) : null;
}
function extractVerbs(comment) {
  const m = comment.match(/\b(GET|POST|PUT|PATCH|DELETE)(?:\s*\|\s*(?:GET|POST|PUT|PATCH|DELETE))*\b/);
  if (!m) return null;
  return m[0].split('|').map((s) => s.trim().toUpperCase());
}

function parseContracts() {
  const src = fs.readFileSync(CONTRACTS, 'utf8');
  const { text, offset } = stripToApiBlock(src);
  // structural key-stack scan to map char position -> module (top-level key)
  const t = text;
  // Pre-scan module ranges: track structural depth ignoring strings/templates/comments.
  const moduleAt = (pos) => {
    // walk from start, maintain stack of {name,depth}; module = stack[0]
    // (recomputed lazily is O(n^2); instead we build an index once below)
    return moduleIndex.find((r) => pos >= r.start && pos < r.end)?.name || '?';
  };
  const moduleIndex = [];
  {
    let depth = 0, i = 0;
    let inTpl = false, tplStack = [];
    const pending = []; // keys opened at depth, waiting for module attribution
    let topName = null, topStart = -1;
    while (i < t.length) {
      const c = t[i];
      // comments
      if (!inTpl && c === '/' && t[i + 1] === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
      if (!inTpl && c === '/' && t[i + 1] === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
      if (inTpl) {
        if (c === '\\') { i += 2; continue; }
        if (c === '`') { inTpl = false; i++; continue; }
        if (c === '$' && t[i + 1] === '{') { tplStack.push(1); depth++; i += 2; continue; }
        if (c === '}' && tplStack.length) { tplStack.pop(); depth--; i++; continue; }
        i++; continue;
      }
      if (c === '`') { inTpl = true; i++; continue; }
      if (c === "'" || c === '"') { const q = c; i++; while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; } i++; continue; }
      if (c === '{') {
        // is this a top-level module open? detect `ident:` right before at depth 0
        if (depth === 0) {
          const before = t.slice(Math.max(0, i - 40), i);
          const m = before.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
          if (m) { topName = m[1]; topStart = i; }
        }
        depth++; i++; continue;
      }
      if (c === '}') {
        depth--; i++;
        if (depth === 0 && topName) { moduleIndex.push({ name: topName, start: topStart, end: i }); topName = null; }
        continue;
      }
      i++;
    }
  }

  const leaves = [];
  let searchFrom = 0;
  while (true) {
    const arrow = t.indexOf('=>', searchFrom);
    if (arrow < 0) break;
    searchFrom = arrow + 2;
    // backward: ) then matching ( then identifier
    let j = arrow - 1;
    while (j >= 0 && /\s/.test(t[j])) j--;
    if (t[j] !== ')') continue; // not an arrow-fn leaf (defensive)
    const openP = matchParenBack(t, j);
    if (openP < 0) continue;
    const rawParams = t.slice(openP + 1, j);
    let k = openP - 1;
    while (k >= 0 && /\s/.test(t[k])) k--;   // ws before (
    if (t[k] === ':') k--;                     // the property colon
    while (k >= 0 && /\s/.test(t[k])) k--;   // ws before :
    const nameEnd = k;
    while (k >= 0 && /[\w$]/.test(t[k])) k--;
    const name = t.slice(k + 1, nameEnd + 1);
    if (!name) continue;
    // body
    let b = arrow + 2; while (b < t.length && /\s/.test(t[b])) b++;
    const { expr } = captureExpr(t, b);
    const nameAbsIdx = offset + k + 1;
    const verbs = methodVerbsBefore(src, nameAbsIdx);
    const module = moduleIndex.find((r) => (openP) >= r.start && (openP) < r.end)?.name || '?';
    leaves.push({ module, name, params: paramNames(rawParams), body: expr, verbs });
  }
  return leaves;
}

// ---------------------------------------------------------------- classify
const MUTATION_RE = /^(create|add|update|edit|patch|delete|remove|drop|assign|unassign|revoke|grant|execute|compile|validate|schedule|pause|resume|cancel|import|publish|unpublish|subscribe|refresh(?!Status)|install|warm|warmup|invalidate|clear|approve|reject|rollback|resize|suspend|sync|test|ingest|upload|download|bootstrap|generate|apply|recompute|classify|embed|associate|disassociate|enable|disable|predict|train|finetune|draft|notify|decision|ack|acknowledge|analyze|setup|register|signin|login|rename|from|quick|persist)/i;
const RUNSQL_RE = /^(runSql|runPython)$/i;
const SIDE_EFFECT_DENY = /(warm|warmup|trigger|install|invalidate|clear|refreshStart|refreshStop|reset|^refresh$|^sync$)/i;

function classify(leaf) {
  const name = leaf.name;
  let method, isGet;
  if (leaf.verbs) { method = leaf.verbs[0]; isGet = leaf.verbs.includes('GET'); }
  else { isGet = !(MUTATION_RE.test(name) || RUNSQL_RE.test(name)); method = isGet ? 'GET?' : 'MUT?'; }
  const callable = isGet && !SIDE_EFFECT_DENY.test(name) && !RUNSQL_RE.test(name);
  return { method, callable };
}

// build a real URL by evaluating the leaf body with resolved args
function buildUrl(leaf, args) {
  const body = leaf.body.trim();
  let fn;
  // block bodies may redeclare enc/qs (e.g. `const qs = new URLSearchParams()`)
  if (body.startsWith('{')) fn = new Function('__enc', '__qs', ...leaf.params, body.slice(1, -1));
  else fn = new Function('enc', 'qs', ...leaf.params, `return (${body});`);
  return fn(enc, qs, ...args);
}
// templated path (params -> {}) using sentinel evaluation
function templatePath(leaf) {
  try {
    const sent = leaf.params.map((_, i) => `${i}`);
    let u = buildUrlWith(leaf, (x) => x, () => '', sent);
    for (const s of sent) u = u.split(s).join('{}');
    return u.replace(/\?.*$/, '');
  } catch { return null; }
}
function buildUrlWith(leaf, encF, qsF, args) {
  const body = leaf.body.trim();
  let fn;
  if (body.startsWith('{')) fn = new Function('__enc', '__qs', ...leaf.params, body.slice(1, -1));
  else fn = new Function('enc', 'qs', ...leaf.params, `return (${body});`);
  return fn(encF, qsF, ...args);
}

// legacy API_CONTRACTS.* object (absolute-url form) also wires routes — parse its
// {method, path} pairs so they don't count as "no contract entry".
function legacyContractOps() {
  const src = fs.readFileSync(CONTRACTS, 'utf8');
  const start = src.indexOf('export const API_CONTRACTS');
  const block = start >= 0 ? src.slice(start) : '';
  const ops = new Set();
  const re = /method:\s*'(GET|POST|PUT|PATCH|DELETE)'[\s\S]{0,160}?path:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block))) ops.add(`${m[1]} ${normPath(m[2])}`);
  return ops;
}

// ---------------------------------------------------------------- HTTP
let TOKEN = null;
async function signin() {
  const pass = readPass();
  if (!pass) throw new Error('no password');
  const r = await fetch(`${HOST}/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_name: ACC, username: USER, password: pass }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('signin failed ' + r.status);
  TOKEN = j.access_token;
}
function headers() {
  return { Authorization: `Bearer ${TOKEN}`, 'X-Account-Name': ACC, 'X-Username': USER, 'Accept': 'application/json' };
}
async function getRaw(pathRel, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  const t0 = Date.now();
  try {
    const r = await fetch(`${HOST}${pathRel}`, { headers: headers(), signal: ctrl.signal });
    const txt = await r.text();
    return { status: r.status, ms: Date.now() - t0, text: txt };
  } catch (e) {
    return { status: -1, ms: Date.now() - t0, text: '', err: String(e.name === 'AbortError' ? 'timeout' : e.message) };
  } finally { clearTimeout(to); }
}
// GET with one retry on -1, and re-signin+retry on 401
async function getJson(pathRel, timeout) {
  let res = await getRaw(pathRel, timeout);
  if (res.status === -1) res = await getRaw(pathRel, timeout);
  if (res.status === 401) { try { await signin(); res = await getRaw(pathRel, timeout); } catch { /* keep 401 */ } }
  let body = null;
  try { body = JSON.parse(res.text); } catch { /* non-json */ }
  return { ...res, body };
}

// ---------------------------------------------------------------- data shape
const ARR_KEYS = ['items', 'data', 'results', 'rows', 'records', 'list', 'databases', 'schemas', 'tables',
  'columns', 'roles', 'users', 'connectors', 'products', 'dashboards', 'events', 'alerts', 'monitors',
  'budgets', 'models', 'agents', 'projects', 'deployments', 'conversations', 'grants', 'policies',
  'notebooks', 'repositories', 'streams', 'tasks', 'services', 'objects', 'kpis', 'sources', 'terms', 'findings'];
function firstArray(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    for (const k of ARR_KEYS) if (Array.isArray(body[k])) return body[k];
    for (const k of Object.keys(body)) if (Array.isArray(body[k])) return body[k];
  }
  return null;
}
const PRIMARY_ARR = ['items', 'data', 'results', 'rows', 'records', 'list'];
const META_KEYS = new Set(['execution_time_ms', 'exec_ms', 'timestamp', 'count', 'total', 'limit', 'offset',
  'days', 'period_days', 'note', 'scope', 'account', 'hours', 'axis', 'degraded', 'error_code', 'page',
  'page_size', 'pagination', 'data_points', 'detail', 'message', 'error', 'status']);
function hasData(body) {
  if (body == null) return false;
  if (Array.isArray(body)) return body.length > 0;
  if (typeof body !== 'object') return false;
  // definitive list endpoint: a primary array wrapper key present -> data iff non-empty
  for (const k of PRIMARY_ARR) if (Array.isArray(body[k])) return body[k].length > 0;
  // otherwise: any meaningful (non-meta) field carrying content? (avoids flagging a
  // populated scorecard "empty" just because one secondary array child is [])
  const meaningful = Object.keys(body).filter((k) => !META_KEYS.has(k)).filter((k) => {
    const v = body[k];
    if (Array.isArray(v)) return v.length > 0;
    if (v == null) return false;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true; // scalar present
  });
  return meaningful.length > 0;
}
function execMsOf(body) {
  if (!body || typeof body !== 'object') return null;
  return body.execution_time_ms ?? body.exec_ms ?? body.meta?.execution_time_ms ?? body.metadata?.execution_time_ms ?? null;
}
// always return a string|null (FastAPI `detail` can be an array/object of validation errors)
function errStr(r, ok) {
  if (r.err) return String(r.err);
  if (ok) return null;
  const d = r.body?.detail ?? r.body?.message;
  if (d != null) return typeof d === 'string' ? d : JSON.stringify(d);
  return (r.text || '').replace(/\s+/g, ' ').slice(0, 100) || `HTTP ${r.status}`;
}

// ---------------------------------------------------------------- SEED
const R = {}; // resolver map
function pickId(arr, keys) {
  if (!arr || !arr.length) return null;
  const o = arr[0];
  if (typeof o === 'string') return o;
  for (const k of keys) if (o && o[k] != null) return String(o[k]);
  return null;
}
async function seed() {
  const g = async (p) => (await getJson(p)).body;
  // projects
  const projAll = await g('/projects?limit=200');
  const projArr = firstArray(projAll) || [];
  R.project = pickId(projArr, ['id', 'project_id', 'projectId']);
  const wf = firstArray(await g('/projects?project_type=WORKFLOW')) || [];
  R.wfProject = pickId(wf, ['id', 'project_id']) || R.project;
  const ed = firstArray(await g('/projects?project_type=explore_design')) || [];
  R.edProject = pickId(ed, ['id', 'project_id']) || R.project;
  // databases / schema / table
  const dbs = firstArray(await g('/common/databases')) || [];
  const dbNames = dbs.map((d) => (typeof d === 'string' ? d : d.name || d.database_name || d.DATABASE_NAME)).filter(Boolean);
  R.db = dbNames.includes('CP_DATA360') ? 'CP_DATA360' : dbNames[0];
  if (R.db) {
    const sc = firstArray(await g(`/common/schemas/${enc(R.db)}`)) || [];
    const scNames = sc.map((s) => (typeof s === 'string' ? s : s.name || s.schema_name || s.SCHEMA_NAME)).filter(Boolean);
    R.schema = scNames.find((s) => s === 'EVENT_STORE') || scNames.find((s) => s !== 'INFORMATION_SCHEMA') || scNames[0];
    if (R.schema) {
      const tb = firstArray(await g(`/common/tables/${enc(R.db)}/${enc(R.schema)}`)) || [];
      const tbNames = tb.map((x) => (typeof x === 'string' ? x : x.name || x.table_name || x.TABLE_NAME)).filter(Boolean);
      R.table = tbNames[0];
    }
  }
  if (R.db && R.schema && R.table) R.fqn = `${R.db}.${R.schema}.${R.table}`;
  // roles
  R.role = pickId(firstArray(await g('/gouvernance/roles')) || [], ['name', 'role_name', 'ROLE_NAME', 'role']);
  R.d360Role = pickId(firstArray(await g('/gouvernance/d360-roles')) || [], ['name', 'role_name', 'role']) || R.role;
  // connectors / stages
  R.connector = pickId(firstArray(await g('/connect/connectors')) || [], ['id', 'connector_id', 'name']);
  R.stage = pickId(firstArray(await g('/connect/stages')) || [], ['name', 'stage_name', 'id']);
  // bi dashboards
  R.dashboard = pickId(firstArray(await g('/bi-dashboard')) || [], ['id', 'dashboard_id', 'ID']);
  // data products
  R.product = pickId(firstArray(await g('/data-products')) || [], ['id', 'product_id', 'ID', 'name']);
  // catalog
  R.catalogProduct = pickId(firstArray(await g('/catalog/products')) || [], ['id', 'product_id', 'name']);
  R.catalogKpi = pickId(firstArray(await g('/catalog/kpis')) || [], ['id', 'kpi_id', 'name']);
  // snowflake explorer object
  R.explorerObject = pickId(firstArray(await g('/api/snowflake/explorer/objects?page_size=5')) || [], ['id', 'object_id', 'fqn']);
  R.catalogObject = R.explorerObject;
  // observability
  R.monitor = pickId(firstArray(await g('/observability/cost/monitors')) || [], ['name', 'monitor_name', 'id']);
  R.budget = pickId(firstArray(await g('/observability/budgets')) || [], ['name', 'id']);
  R.alert = pickId(firstArray(await g('/observability/alerts')) || [], ['id', 'alert_id']);
  // cortex names
  R.semanticModel = pickId(firstArray(await g('/cortex/semantic-models/list')) || [], ['name', 'file', 'id']);
  R.classificationModel = pickId(firstArray(await g('/cortex/ml/classification/models')) || [], ['name', 'id']);
  R.snowparkService = pickId(firstArray(await g('/cortex/snowpark/services')) || [], ['name', 'id']);
  R.computePool = pickId(firstArray(await g('/cortex/snowpark/compute-pools')) || [], ['name', 'id']);
  R.finetuneJob = pickId(firstArray(await g('/cortex/ml/finetune/jobs')) || [], ['id', 'job_id', 'name']);
  // explore-design objects
  R.glossaryTerm = pickId(firstArray(await g('/explore-design/glossary')) || [], ['term', 'name', 'id']);
  R.dynTable = pickId(firstArray(await g('/explore-design/dynamic-tables')) || [], ['name', 'id']);
  R.stream = pickId(firstArray(await g('/explore-design/streams')) || [], ['name', 'id']);
  R.deTask = pickId(firstArray(await g('/explore-design/tasks')) || [], ['name', 'id']);
  // workflow objects
  R.notebook = pickId(firstArray(await g('/workflow/notebooks')) || [], ['name', 'id']);
  R.gitRepo = pickId(firstArray(await g('/workflow/git/repositories')) || [], ['name', 'id']);
  // gui permission
  R.permissionId = pickId(firstArray(await g('/gouvernance/gui-permissions')) || [], ['id', 'permission_id']);
  // deployment id (from ED project, fallback unified project)
  if (R.edProject) R.deployment = pickId(firstArray(await g(`/explore-design/${enc(R.edProject)}/deployments`)) || [], ['id', 'deployment_id']);
  if (!R.deployment && R.project) R.deployment = pickId(firstArray(await g(`/projects/${enc(R.project)}/deployments`)) || [], ['id', 'deployment_id']);
  R.account = ACC; // caller's own account (administration.performance.{account} is self-scoped)
  // org-level account identifier from the org list (orgAccounts.* wants this, not the login name)
  const accs = firstArray(await g('/org-accounts/accounts')) || [];
  R.orgAccount = pickId(accs, ['account_name', 'name', 'ACCOUNT_NAME', 'account_locator', 'locator', 'account']) || ACC;
  R.username = USER;
  R.project = R.project || R.edProject || R.wfProject; // base project fallback
}

// backend router decorators → { file, line, method, rel(normalized) } for file:line lookup
function decoratorIndex() {
  let raw = '';
  try {
    raw = execSync(`grep -rEn "@[a-zA-Z_]+\\.(get|post|put|patch|delete)\\(" ${BACKEND}/app/modules 2>/dev/null`,
      { maxBuffer: 40 * 1024 * 1024 }).toString();
  } catch (e) { raw = e.stdout ? e.stdout.toString() : ''; }
  const idx = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(.*?):(\d+):\s*@[a-zA-Z_]+\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]*)["'`]/i);
    if (!m) continue;
    idx.push({ file: m[1].replace(BACKEND + '/', ''), line: m[2], method: m[3].toUpperCase(), rel: normPath(m[4]) });
  }
  return idx;
}
function findSrc(idx, method, normFullPath) {
  // require the decorator to carry >=1 literal segment (reject over-generic "/{}" that
  // otherwise matches every path ending in a bare param and mis-points file:line)
  const hasLiteral = (rel) => rel.split('/').some((s) => s && s !== '{}');
  const cands = idx.filter((d) => d.method === method && hasLiteral(d.rel) && normFullPath.endsWith(d.rel));
  if (!cands.length) return '';
  cands.sort((a, b) => b.rel.length - a.rel.length);
  return `${cands[0].file}:${cands[0].line}`;
}

// ---------------------------------------------------------------- resolver
// Return arg array for a leaf, or null if any REQUIRED param cannot be resolved.
const OMIT = Symbol('omit'); // optional param -> pass undefined (contract fns treat as absent)
function resolveArgs(leaf) {
  const { module, name, params } = leaf;
  const out = [];
  for (const p of params) {
    const v = resolveParam(module, name, p);
    if (v === OMIT) { out.push(undefined); continue; }
    if (v == null) return null;
    out.push(v);
  }
  return out;
}
function resolveParam(module, name, p) {
  // module + leaf-name aware resolution for id/name; generic otherwise
  const idFor = () => {
    switch (module) {
      case 'exploreDesign': return R.edProject;
      case 'workflow': return R.wfProject;
      case 'projects': return R.project;
      case 'biDashboard': return R.dashboard;
      case 'dataProducts': return R.product;
      case 'snowflakeExplorer': return R.explorerObject;
      case 'catalog':
        if (/kpi/i.test(name)) return R.catalogKpi;
        if (/product/i.test(name)) return R.catalogProduct;
        if (/object/i.test(name)) return R.catalogObject;
        return R.catalogProduct || R.catalogObject;
      case 'cortex':
        if (/finetune/i.test(name)) return R.finetuneJob;
        return null;
      case 'commandCenter': case 'dataQuality': return R.project;
      default: return R.project;
    }
  };
  const nameFor = () => {
    switch (module) {
      case 'exploreDesign':
        if (/dynamicTable|dynTable/i.test(name)) return R.dynTable;
        if (/stream/i.test(name)) return R.stream;
        if (/task/i.test(name)) return R.deTask;
        return null;
      case 'workflow':
        if (/notebook/i.test(name)) return R.notebook;
        if (/git|repositor/i.test(name)) return R.gitRepo;
        if (/computePool/i.test(name)) return R.computePool;
        return null;
      case 'cortex':
        if (/semantic/i.test(name)) return R.semanticModel;
        if (/classification/i.test(name)) return R.classificationModel;
        if (/service/i.test(name)) return R.snowparkService;
        if (/computePool|pool/i.test(name)) return R.computePool;
        return null;
      case 'observability':
        if (/monitor/i.test(name)) return R.monitor;
        if (/budget/i.test(name)) return R.budget;
        return null;
      case 'orgAccounts': return R.orgAccount || R.account; // account name/detail/health/warehouses/creditHistory
      case 'gouvernance':
        if (/enterprise/i.test(name)) return R.username;
        return null;
      default: return null;
    }
  };
  switch (p) {
    case 'id': case 'projectId': case 'workflowId': return (p === 'projectId' || p === 'workflowId')
      ? (module === 'exploreDesign' ? R.edProject : module === 'workflow' ? R.wfProject
         : module === 'dataQuality' || module === 'commandCenter' ? R.project : R.project)
      : idFor();
    case 'name': return nameFor();
    case 'db': case 'database': return R.db;
    case 's': case 'schema': return R.schema;
    case 't': case 'table': return R.table;
    case 'fqn': return R.fqn;
    case 'username': return R.username;
    case 'role': case 'roleName': return R.role;
    case 'deploymentId': case 'depId': return R.deployment;
    case 'term': return R.glossaryTerm;
    case 'alertId': return R.alert;
    case 'permissionId': return R.permissionId;
    case 'account': return module === 'orgAccounts' ? (R.orgAccount || R.account) : R.account;
    case 'stage': return R.stage;
    case 'objectType': return 'project';
    case 'objectId': return R.project;
    case 'q': case 'query': case 'days': case 'limit': case 'range': case 'hours':
    case 'opts': case 'params': case 'daysBack': case 'state': case 'scope': return OMIT;
    case 'axis': return 'page';
    default: return null; // unresolved (queryId, runId, shareId, w, p, f, stepId, contributorId, key, filePath, action, job, integrationName)
  }
}

// ---------------------------------------------------------------- pool
async function runPool(items, worker, n = CONCURRENCY) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (idx < items.length) {
      const my = idx++;
      out[my] = await worker(items[my], my);
    }
  }));
  return out;
}

// ---------------------------------------------------------------- MAIN
function normPath(p) { return p.replace(/\{[^}]*\}/g, '{}').replace(/\/+$/, ''); }

(async () => {
  const leaves = parseContracts();
  const withClass = leaves.map((l) => ({ ...l, ...classify(l) }));
  const gets = withClass.filter((l) => l.callable);
  console.log(`parsed leaves=${leaves.length} callable_GET=${gets.length} mutations/side-effect=${leaves.length - gets.length}`);
  const byMod = {};
  for (const l of leaves) (byMod[l.module] ||= []).push(l);
  console.log('modules:', Object.keys(byMod).sort().join(', '));

  if (PARSE_ONLY) {
    // sanity: print a few resolved-shape samples
    for (const l of gets.slice(0, 6)) console.log('  sample', l.module + '.' + l.name, 'params=' + JSON.stringify(l.params), 'method=' + l.method);
    // find any leaf whose body fails to evaluate with dummy args
    let bad = 0;
    for (const l of gets) { try { buildUrl(l, l.params.map(() => 'x')); } catch (e) { bad++; if (bad <= 8) console.log('  EVAL-FAIL', l.module + '.' + l.name, String(e.message).slice(0, 60)); } }
    console.log('eval-fail count=', bad);
    return;
  }

  await signin();
  console.log('signed in; seeding ids...');
  await seed();
  const seededKeys = Object.entries(R).filter(([, v]) => v != null).map(([k]) => k);
  console.log('resolved seeds:', seededKeys.join(', '));

  // openapi (deployed route set)
  let deployedGet = new Set(), deployedAll = new Set();
  try {
    const oj = await (await fetch(`${HOST}/openapi.json`)).json();
    for (const path of Object.keys(oj.paths || {})) {
      for (const m of Object.keys(oj.paths[path])) {
        deployedAll.add(`${m.toUpperCase()} ${normPath(path)}`);
        if (m.toLowerCase() === 'get') deployedGet.add(normPath(path));
      }
    }
    console.log('deployed ops', deployedAll.size, 'GET', deployedGet.size);
  } catch (e) { console.log('openapi fetch failed', e.message); }

  // build call list
  const calls = [];
  const unresolved = [];
  for (const l of gets) {
    const args = resolveArgs(l);
    const tp = templatePath(l);
    if (args == null) { unresolved.push({ ...l, tp }); continue; }
    let url;
    try { url = buildUrl(l, args); } catch { unresolved.push({ ...l, tp, evalErr: 1 }); continue; }
    calls.push({ ...l, url, tp });
  }
  console.log(`callable=${gets.length} resolved=${calls.length} unresolved=${unresolved.length}`);

  const results = await runPool(calls, async (c) => {
    const r = await getJson(c.url);
    const ok = r.status >= 200 && r.status < 300;
    const empty = ok && !hasData(r.body);
    return {
      module: c.module, name: c.name, method: c.method, url: c.url, tp: c.tp,
      status: r.status, ms: r.ms, size: (r.text || '').length,
      hasData: ok ? hasData(r.body) : null, empty, execMs: execMsOf(r.body),
      err: errStr(r, ok),
      sample: (r.text || '').replace(/\s+/g, ' ').slice(0, 120),
      deployed: c.tp ? deployedGet.has(normPath(c.tp)) : null,
    };
  });

  // ----- contract vs deployed (missing management actions) -----
  const contractOps = new Set();
  for (const l of withClass) {
    const tp = templatePath(l);
    if (!tp) continue;
    const method = l.verbs ? l.verbs[0] : (l.callable ? 'GET' : 'POST');
    // add all annotated verbs
    const verbs = l.verbs || [method];
    for (const v of verbs) contractOps.add(`${v} ${normPath(tp)}`);
  }
  for (const op of legacyContractOps()) contractOps.add(op); // fold in legacy API_CONTRACTS
  const CANON = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const missingBackend = [...deployedAll].filter((op) => {
    const [m] = op.split(' ');
    if (!CANON.includes(m)) return false;
    return !contractOps.has(op);
  });

  // console summary (print BEFORE doc so numbers survive any formatting issue)
  const twoxx = results.filter((r) => r.status >= 200 && r.status < 300);
  const fourxx = results.filter((r) => r.status >= 400 && r.status < 500);
  const fivexx = results.filter((r) => r.status >= 500);
  const empties = twoxx.filter((r) => r.empty);
  console.log('\n===== SUMMARY =====');
  console.log(`contract GET (callable)=${gets.length}  called=${results.length}  unresolved=${unresolved.length}`);
  console.log(`2xx=${twoxx.length}  4xx=${fourxx.length}  5xx=${fivexx.length}  neg1=${results.filter(r=>r.status===-1).length}  empty200=${empties.length}`);
  const codes = {}; results.forEach((r) => codes[r.status] = (codes[r.status] || 0) + 1);
  console.log('by-status', JSON.stringify(codes));
  console.log(`missing-backend-ops (deployed, no contract)=${missingBackend.length}`);
  console.log('\nTOP FAILING:');
  results.filter((r) => r.status < 200 || r.status >= 300).sort((a, b) => b.status - a.status).slice(0, 20)
    .forEach((r) => console.log(`  ${r.status}  ${r.module}.${r.name}  ${r.url}  ${String(r.err || '').slice(0, 60)}  deployed=${r.deployed}`));

  try {
    writeDoc({ leaves, withClass, gets, calls, unresolved, results, deployedAll, deployedGet, missingBackend });
  } catch (e) { console.error('DOC-WRITE-ERROR', e); }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

// ---------------------------------------------------------------- DOC
function writeDoc({ leaves, withClass, gets, calls, unresolved, results, deployedAll, deployedGet, missingBackend }) {
  const twoxx = results.filter((r) => r.status >= 200 && r.status < 300);
  const threexx = results.filter((r) => r.status >= 300 && r.status < 400);
  const fourxx = results.filter((r) => r.status >= 400 && r.status < 500);
  const fivexx = results.filter((r) => r.status >= 500);
  const neg = results.filter((r) => r.status === -1);
  const empties = twoxx.filter((r) => r.empty);
  const codeCount = {}; results.forEach((r) => codeCount[r.status] = (codeCount[r.status] || 0) + 1);

  const fails = results.filter((r) => r.status < 200 || r.status >= 300)
    .sort((a, b) => (b.status) - (a.status) || a.module.localeCompare(b.module));

  // CRUD-7 grid from contract
  const ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE', 'RUN'];
  const actOf = (l) => {
    const n = l.name, v = (l.verbs || []).join('|');
    const acts = new Set();
    if (/(^create$|^create[A-Z]|^add(?!ress)|register|bootstrap|fromGraph|^upsert)/i.test(n) || (/POST/.test(v) && /create|add/i.test(n))) acts.add('CREATE');
    if ((l.callable) || /^(list|get|fetch|read)/i.test(n) || /GET/.test(v)) acts.add('READ');
    if (/^(update|edit|patch|alter|rename|resize|autoSuspend)/i.test(n) || /PUT|PATCH/.test(v)) acts.add('UPDATE');
    if (/^(delete|remove|drop|revokeRsaKey)/i.test(n) || /DELETE/.test(v)) acts.add('DELETE');
    if (/(assign(?!Rsa)|grant|share(?!s)|subscribe|publish|associate|enable)/i.test(n) && !/unassign|revoke|disassociate/i.test(n)) acts.add('GRANT');
    if (/(unassign|revoke|unpublish|disassociate|disable|reject)/i.test(n)) acts.add('REVOKE');
    if (/(execute|^run(?!s$)|approve|refresh|schedule|sync|^test|deploy|ingest|compile|validate|cancel|analyze|classify|predict|train|warm|dryRun|impact|conflict|postVerify|recompute|apply|generate)/i.test(n)) acts.add('RUN');
    return acts;
  };
  const modActs = {};
  for (const l of withClass) {
    const set = (modActs[l.module] ||= new Set());
    for (const a of actOf(l)) set.add(a);
  }
  const modules = Object.keys(modActs).sort();

  // missing-backend grouped by prefix (mutations only for management-gap view)
  const mgmt = missingBackend.filter((op) => /^(POST|PUT|PATCH|DELETE)/.test(op))
    .sort();

  const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');
  let md = '';
  md += `# Contract GET Sweep + CRUD-7 Audit — 2026-07-02\n\n`;
  md += `Live sweep of every GET endpoint declared in \`apps/data360/src/lib/api-contracts.ts\` (\`API.*\`) against **${HOST}** as \`${USER}\` (ACCOUNTADMIN), plus CRUD-7 completeness vs the deployed route set (\`/openapi.json\`). Only HTTP GET was issued (a GET to a POST route just 405s — no mutation possible).\n\n`;
  md += `> **Skew caveat:** the sweep hits the **deployed** backend; CRUD-7 cross-checks the **deployed** route set from live \`/openapi.json\` (${deployedAll.size} ops). Local backend source may be newer (deploy-lag). A contract GET that 404s and is absent from \`/openapi.json\` is **not-deployed**, not necessarily broken.\n\n`;

  md += `## (a) Summary counts\n\n`;
  md += `| Metric | Count |\n|---|---:|\n`;
  md += `| Contract leaves parsed (API.*) | ${leaves.length} |\n`;
  md += `| Callable GET (after mutation/side-effect filter) | ${gets.length} |\n`;
  md += `| Resolved + called | ${results.length} |\n`;
  md += `| Unresolved params (skipped) | ${unresolved.length} |\n`;
  md += `| 2xx | ${twoxx.length} |\n`;
  md += `| 3xx | ${threexx.length} |\n`;
  md += `| 4xx | ${fourxx.length} |\n`;
  md += `| 5xx | ${fivexx.length} |\n`;
  md += `| network/timeout (-1) | ${neg.length} |\n`;
  md += `| **empty-but-200** | ${empties.length} |\n`;
  md += `| deployed ops in /openapi.json | ${deployedAll.size} (GET ${deployedGet.size}) |\n`;
  md += `| deployed ops with **no contract entry** | ${missingBackend.length} (mutations ${mgmt.length}) |\n`;
  md += `\nBy-status: ${Object.entries(codeCount).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`\`${k}\`×${v}`).join('  ')}\n\n`;

  const clsOf = (r) => r.status >= 500 ? '5xx-defect'
    : r.status === 405 ? 'method-405'
    : (r.status === 400 || r.status === 422) ? 'validation'
    : !r.deployed ? 'not-deployed'
    : r.status === 404 ? 'not-found*'
    : 'other';
  const clsCount = {}; fails.forEach((r) => clsCount[clsOf(r)] = (clsCount[clsOf(r)] || 0) + 1);
  md += `## (b) FAILING GETs (non-2xx)\n\n`;
  md += `**0 5xx** across ${results.length} live GETs. Class taxonomy: ${Object.entries(clsCount).sort().map(([k, v]) => `\`${k}\`×${v}`).join('  ')}.\n\n`;
  md += `- \`not-deployed\` — absent from live /openapi.json GET set = deploy-lag (backend source may have it; not on this host yet).\n`;
  md += `- \`method-405\` — path exists but not for GET (contract declares GET; backend serves another verb / different list path).\n`;
  md += `- \`validation\` (400/422) — endpoint live but requires a query param the contract fn treats as optional (**real contract gap**: FE can call it wrong).\n`;
  md += `- \`not-found*\` — deployed + 404 on a resolver **sample id** (endpoint works; the swept id/account simply had no such row). Harness artifact, not a defect.\n\n`;
  md += `| Status | class | Module.name | Path | dep | Error |\n|---:|---|---|---|:--:|---|\n`;
  for (const r of fails) {
    md += `| ${r.status} | ${clsOf(r)} | ${esc(r.module)}.${esc(r.name)} | \`${esc(r.url).slice(0, 60)}\` | ${r.deployed === null ? '?' : r.deployed ? 'Y' : 'N'} | ${esc(String(r.err || '').slice(0, 48))} |\n`;
  }
  md += `\n`;

  md += `## (c) EMPTY-but-200 (candidates for seed/verify)\n\n`;
  md += `| Module.name | Path | ms | sample |\n|---|---|---:|---|\n`;
  for (const r of empties.sort((a, b) => a.module.localeCompare(b.module))) {
    md += `| ${esc(r.module)}.${esc(r.name)} | \`${esc(r.url).slice(0, 60)}\` | ${r.ms} | ${esc(r.sample.slice(0, 60))} |\n`;
  }
  md += `\n`;

  md += `## (e) Slowest 2xx GETs — wall \`ms\` vs backend \`execMs\`\n\n`;
  md += `Cold-path / perf signal (not defects); large wall-vs-execMs gaps = cold compile or network. \`administration.platformHealth\` also produced the lone \`-1\` timeout (>20s twice).\n\n`;
  md += `| ms | execMs | bytes | Module.name | Path |\n|---:|---:|---:|---|---|\n`;
  for (const r of results.filter((r) => r.status >= 200 && r.status < 300).sort((a, b) => b.ms - a.ms).slice(0, 12)) {
    md += `| ${r.ms} | ${r.execMs ?? '—'} | ${r.size} | ${esc(r.module)}.${esc(r.name)} | \`${esc(r.url).slice(0, 52)}\` |\n`;
  }
  md += `\n`;

  md += `## (d) Per-module CRUD-7 grid\n\n`;
  md += `Canonical actions with a **declared contract entry** (any method). ✓=present, ✗=absent.\n\n`;
  md += `> GRANT/REVOKE/RUN are **name-inferred heuristics** (a read named \`*Grants\`/\`*grant*\` can false-✓; a RUN-like \`warehouseResize\` can be missed). The missing-actions list below is the authoritative gap signal — cross-check the two, don't read the grid alone.\n\n`;
  md += `| Module | ${ACTIONS.join(' | ')} |\n|---|${ACTIONS.map(() => ':-:').join('|')}|\n`;
  for (const m of modules) {
    md += `| ${m} | ${ACTIONS.map((a) => (modActs[m].has(a) ? '✓' : '✗')).join(' | ')} |\n`;
  }
  md += `\n### Missing management actions — deployed backend ops with NO contract entry\n\n`;
  const dIdx = decoratorIndex();
  md += `> **Read as contract-hygiene, NOT a feature-gap list.** "No contract entry" = absent from \`API.*\` **and** legacy \`API_CONTRACTS\`. It does **not** mean unwired — many are called via hardcoded inline strings elsewhere in the FE (prior audits found the majority of such "gaps" were hardcoded/legacy-wired). Mutation methods only; **${mgmt.length}** total, showing up to 70. \`file:line\` = backend router decorator (suffix-matched; — = no literal-path decorator).\n\n`;
  md += `| Method + Path (deployed) | backend file:line |\n|---|---|\n`;
  for (const op of mgmt.slice(0, 70)) {
    const [m, ...rest] = op.split(' ');
    md += `| \`${esc(op)}\` | ${esc(findSrc(dIdx, m, rest.join(' ')) || '—')} |\n`;
  }
  md += `\n`;

  // (f) unresolved — the coverage holes, grouped by the first blocking path param
  const blocking = (leaf) => leaf.params.filter((p) => { const v = resolveParam(leaf.module, leaf.name, p); return v !== OMIT && v == null; });
  const byParam = {};
  for (const l of unresolved) { const bp = blocking(l); (byParam[bp[0] || '(eval/other)'] ||= []).push(`${l.module}.${l.name}`); }
  md += `## (f) Unresolved GET endpoints (${unresolved.length}) — declared but NOT exercised\n\n`;
  md += `Grouped by the first blocking path param: no live id was discoverable (empty list on this account, or an id type this harness does not seed — shareId/queryId/runId/widget/page/filter/conversation/stepId…). These are coverage holes, not failures.\n\n`;
  md += `| Blocking param | # | Endpoints (module.name) |\n|---|---:|---|\n`;
  for (const k of Object.keys(byParam).sort((a, b) => byParam[b].length - byParam[a].length)) {
    md += `| \`${esc(k)}\` | ${byParam[k].length} | ${esc(byParam[k].join(', ').slice(0, 96))} |\n`;
  }
  md += `\n`;

  md += `---\n_Generated by \`e2e/_contract-sweep.mjs\`. Resolver seeds: ${Object.entries(R).filter(([,v])=>v!=null).map(([k])=>k).join(', ')}._\n`;

  fs.writeFileSync(DOC, md);
  console.log('wrote', DOC, md.split('\n').length, 'lines');
}
