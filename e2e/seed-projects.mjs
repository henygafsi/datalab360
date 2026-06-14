// Seed REAL projects into the Data360 sandbox (HAHA account, CP_DATA360.EVENT_STORE)
// via the authenticated API, to serve as a base for UI/UX tests.
//
// - Auth: Playwright chromium headless + storageState e2e/.auth/state.json,
//   token pulled from localStorage (access_token) with /api/auth/session fallback.
// - Idempotent: every name is prefixed SEED_ and creation is skipped if a
//   project with the same name already exists. On re-run, step payloads of the
//   SEED_ workflows are repaired (PUT) to the canonical executable format.
// - Step payload format (required for real execution, mode "cte"):
//   every step needs nodeId + cte_alias + inputs[] (upstream nodeIds); source &
//   destination need database_name/schema_name/table_name. Verified live:
//   missing `inputs` => run fails with KeyError 'input' in legacy mode;
//   missing destination db/schema/table => 422 VALIDATION_ERROR.
// - Never deletes / drops anything.
//
// Run: node e2e/seed-projects.mjs
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const PROXY = `${BASE}/api-proxy`;
const DIRECT = 'http://api.datalab360.io';
const DB = 'CP_DATA360';
const SCHEMA = 'EVENT_STORE';

const problems = []; // API issues encountered (for the audit)
const created = []; // {name, type, project_id, steps, run}

// ---------------------------------------------------------------- helpers
function note(p) { problems.push(p); console.log('  [API-ISSUE]', p); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
const page = await ctx.newPage();

// 1) AUTH — land on an authed page, pull the session token from the browser.
await page.goto(`${BASE}/account-overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
let token = await page.evaluate(async () => {
  // a) localStorage keys containing token/auth
  for (const k of Object.keys(localStorage)) {
    if (/access_token|auth_token|^token$/i.test(k)) {
      const v = localStorage.getItem(k);
      if (v && v.split('.').length >= 3) return v; // looks like a JWT
    }
  }
  for (const k of Object.keys(localStorage)) {
    if (/token|auth/i.test(k)) {
      const v = localStorage.getItem(k);
      if (v && v.length > 40 && !v.startsWith('{')) return v;
    }
  }
  // b) next-auth session fallback
  try {
    const s = await fetch('/api/auth/session').then((r) => r.json());
    return s?.access_token || s?.accessToken || s?.user?.access_token || null;
  } catch { return null; }
});
if (!token) { console.error('FATAL: no token found — run `node e2e/login-fix.mjs` first.'); process.exit(1); }
console.log('token acquired, len=', token.length);

// API helper: /api-proxy first, direct backend fallback.
let apiBase = PROXY;
async function api(method, path, body, { quiet } = {}) {
  const opts = { headers: { Authorization: `Bearer ${token}` }, timeout: 180000 };
  if (body !== undefined) opts.data = body;
  let res = await page.request.fetch(`${apiBase}${path}`, { method, ...opts });
  if (res.status() === 404 && apiBase === PROXY) {
    const retry = await page.request.fetch(`${DIRECT}${path}`, { method, ...opts });
    if (retry.status() !== 404) res = retry;
  }
  const status = res.status();
  let json = null;
  try { json = await res.json(); } catch { json = { raw: (await res.text()).slice(0, 300) }; }
  if (status >= 400 && !quiet) note(`${status} ${method} ${path} → ${JSON.stringify(json).slice(0, 220)}`);
  return { status, json };
}

// sanity check — auth must pass
{
  const { status } = await api('GET', '/projects?project_type=workflow');
  console.log('auth check GET /projects?project_type=workflow →', status, '(via', apiBase + ')');
  if (status === 401 || status === 403) {
    console.error('FATAL: auth rejected — regenerate state with `node e2e/login-fix.mjs`.');
    process.exit(1);
  }
}

// existing project names (idempotency) — NB: the API caps limit at 100.
const existing = new Map(); // name -> project_id
for (const t of ['workflow', 'explore_design']) {
  const { status, json } = await api('GET', `/projects?project_type=${t}&limit=100`);
  if (status === 200) for (const p of json.projects || []) existing.set(p.project_name, p.project_id);
}
// BI dashboards are not in the projects enum — try the unified listing.
{
  const { status, json } = await api('GET', '/projects/unified', undefined, { quiet: true });
  if (status === 200) {
    const list = json.projects || json.data?.projects || json.data || [];
    if (Array.isArray(list)) for (const p of list) if (p.project_name) existing.set(p.project_name, p.project_id);
  } else note(`${status} GET /projects/unified (BI dedup fallback unavailable)`);
}
console.log('existing projects known:', existing.size);

const fq = (t) => `${DB}.${SCHEMA}.${t}`;
// ---- step payload builders (canonical executable format, see header) -------
// nodeId/cte_alias/inputs are assigned by chain() below.
const src = (t, columns = '*') => ({
  action_type: 'source', step_name: `src_${t.toLowerCase()}`,
  payload: { table: fq(t), table_name: t, database_name: DB, schema_name: SCHEMA, columns, columns_str: columns },
});
const flt = (condition, n = 'filter') => ({
  action_type: 'filter', step_name: n, payload: { condition, filter_condition: condition },
});
const agg = (group_by, metrics, n = 'aggregate') => ({
  action_type: 'aggregate', step_name: n,
  payload: {
    group_by, metrics,
    agg_expressions: metrics.join(', '), group_by_columns: group_by.join(', '),
    agg_type: 'COUNT', column: '*', new_kpi_name: 'N',
  },
});
const jn = (right, key, n = 'join') => ({
  action_type: 'join', step_name: n,
  payload: { right: fq(right), right_input: fq(right), on: key, join_type: 'INNER', left_key: key, right_key: key },
});
const dst = (t, n = 'destination') => ({
  action_type: 'destination', step_name: n,
  payload: {
    table: fq(t), table_name: t, database_name: DB, schema_name: SCHEMA,
    write_mode: 'overwrite', destination_columns_str: '*',
  },
});
// Linear chain: assign nodeId n1..nk, cte_alias from step_name, inputs=[prev].
function chain(steps) {
  return steps.map((s, i) => ({
    ...s,
    payload: {
      ...s.payload,
      nodeId: `n${i + 1}`,
      cte_alias: s.step_name.toLowerCase().replace(/\s+/g, '_'),
      inputs: i === 0 ? [] : [`n${i}`],
      ...(i > 0 ? { input: steps[i - 1].step_name.toLowerCase().replace(/\s+/g, '_') } : {}),
      position: { x: 80 + i * 320, y: 140 },
    },
  }));
}

// ---------------------------------------------------------------- 2a. workflows
// 10 workflows over DIFFERENT real EVENT_STORE tables (columns verified live).
const WORKFLOWS = [
  ['SEED_WF_EVENTS_DAILY', 'Daily project-event volumes by module', chain([
    src('PROJECT_EVENTS'), flt('STATUS IS NOT NULL'),
    agg(['MODULE_NAME'], ['COUNT(*) AS EVENTS', 'AVG(DURATION_MS) AS AVG_MS']),
    dst('SEED_OUT_EVENTS_DAILY')])],
  ['SEED_WF_RUNS_MONITOR', 'Run health by status', chain([
    src('PROJECT_RUNS'), flt('STATUS IS NOT NULL'),
    agg(['STATUS'], ['COUNT(*) AS RUNS', 'AVG(DURATION_SECONDS) AS AVG_SEC']),
    dst('SEED_OUT_RUNS_MONITOR')])],
  ['SEED_WF_QUERY_COST', 'Query cost by warehouse', chain([
    src('QUERY_ANALYTICS'), flt('EXECUTION_TIME_MS > 0'),
    agg(['WAREHOUSE_NAME'], ['SUM(EXECUTION_TIME_MS) AS TOTAL_MS', 'COUNT(*) AS QUERIES']),
    dst('SEED_OUT_QUERY_COST')])],
  ['SEED_WF_PROJECT_KPIS', 'Projects joined to their runs', chain([
    src('PROJECTS'), jn('PROJECT_RUNS', 'PROJECT_ID'),
    dst('SEED_OUT_PROJECT_KPIS')])],
  ['SEED_WF_RLS_AUDIT', 'RLS demo clone audit extract', chain([
    src('DATA360RLSDEMO_PROJECTS'), flt("STATUS = 'active'"),
    dst('SEED_OUT_RLS_AUDIT')])],
  ['SEED_WF_PLATFORM_HEALTH', 'Platform events by severity', chain([
    src('PLATFORM_EVENTS'), flt('SEVERITY IS NOT NULL'),
    agg(['SEVERITY'], ['COUNT(*) AS EVENTS']),
    dst('SEED_OUT_PLATFORM_HEALTH')])],
  ['SEED_WF_KPI_REFRESH', 'Validated KPI catalog snapshot', chain([
    src('KPI_CATALOG'), flt('VALIDATION_STATUS IS NOT NULL'),
    dst('SEED_OUT_KPI_REFRESH')])],
  ['SEED_WF_EVENT_FUNNEL', 'Event funnel by type and status', chain([
    src('PROJECT_EVENTS'), flt('EVENT_TYPE IS NOT NULL'),
    agg(['EVENT_TYPE', 'STATUS'], ['COUNT(*) AS N']),
    dst('SEED_OUT_EVENT_FUNNEL')])],
  ['SEED_WF_STORAGE_TREND', 'Rows produced per database', chain([
    src('QUERY_ANALYTICS'),
    agg(['DATABASE_NAME'], ['COUNT(*) AS QUERIES', 'SUM(ROWS_PRODUCED) AS ROWS_OUT']),
    dst('SEED_OUT_STORAGE_TREND')])],
  ['SEED_WF_GOV_SCORE', 'Governance: project counts by type', chain([
    src('PROJECTS'),
    agg(['PROJECT_TYPE'], ['COUNT(*) AS PROJECTS']),
    dst('SEED_OUT_GOV_SCORE')])],
];

// Repair pass: align an existing SEED_ workflow's steps with the desired list.
// Match desired→existing by action_type sequence; PUT payloads, POST missing.
async function syncSteps(pid, desired) {
  const { status, json } = await api('GET', `/workflow/${pid}/steps`);
  if (status >= 400) return 'steps_list_failed';
  const have = (json.steps || json || []).slice().sort((a, b) => (a.step_order || 0) - (b.step_order || 0));
  const used = new Set();
  let ok = 0;
  for (const [i, want] of desired.entries()) {
    const match = have.find((h) => !used.has(h.step_id) && h.action_type === want.action_type);
    if (match) {
      used.add(match.step_id);
      const r = await api('PUT', `/workflow/${pid}/steps/${match.step_id}`, { step_name: want.step_name, payload: want.payload });
      if (r.status < 400) ok++;
    } else {
      const r = await api('POST', `/workflow/${pid}/steps`, { ...want, position: i + 1 });
      if (r.status < 400) ok++;
    }
  }
  return `${ok}/${desired.length}`;
}

for (const [name, description, steps] of WORKFLOWS) {
  let pid = existing.get(name);
  if (pid) {
    const synced = await syncSteps(pid, steps);
    console.log(`exists ${name} → ${pid} (steps synced ${synced})`);
    created.push({ name, type: 'workflow', project_id: pid, steps: synced, run: null });
    continue;
  }
  const { status, json } = await api('POST', '/workflow', { project_name: name, description, steps: [] });
  pid = json?.project_id || json?.data?.project_id || json?.workflow?.project_id;
  if (status >= 400 || !pid) { created.push({ name, type: 'workflow', project_id: null, steps: 0, run: `create failed ${status}` }); continue; }
  let ok = 0;
  for (const [i, st] of steps.entries()) {
    const r = await api('POST', `/workflow/${pid}/steps`, { ...st, position: i + 1 });
    if (r.status < 400) ok++;
  }
  console.log(`created ${name} → ${pid} (${ok}/${steps.length} steps)`);
  created.push({ name, type: 'workflow', project_id: pid, steps: `${ok}/${steps.length}`, run: null });
}

// ---------------------------------------------------------------- 2b. explore_design
const EXPLORES = [
  ['SEED_EXP_EVENT_MODEL', 'Modeling sandbox over PROJECT_EVENTS', [{ database: DB, schema: SCHEMA, table: 'PROJECT_EVENTS' }]],
  ['SEED_EXP_RLS_MODEL', 'Modeling sandbox over the RLS demo clone', [{ database: DB, schema: SCHEMA, table: 'DATA360RLSDEMO_PROJECTS' }]],
];
for (const [name, description, source_tables] of EXPLORES) {
  if (existing.has(name)) {
    console.log(`skip (exists): ${name} → ${existing.get(name)}`);
    created.push({ name, type: 'explore_design', project_id: existing.get(name), steps: 'pre-existing', run: null });
    continue;
  }
  const { status, json } = await api('POST', '/explore-design', { project_name: name, description, source_tables });
  const pid = json?.project_id || json?.data?.project_id;
  console.log(`explore ${name} → ${status} ${pid || ''}`);
  created.push({ name, type: 'explore_design', project_id: pid || null, steps: source_tables.length + ' source table(s)', run: status >= 400 ? `create failed ${status}` : null });
}

// ---------------------------------------------------------------- 2c. BI dashboards
for (const [name, description] of [
  ['SEED_DASH_OVERVIEW', 'Sandbox overview dashboard'],
  ['SEED_DASH_COSTS', 'Query cost dashboard'],
]) {
  if (existing.has(name)) {
    console.log(`skip (exists): ${name} → ${existing.get(name)}`);
    created.push({ name, type: 'bi_dashboard', project_id: existing.get(name), steps: 'pre-existing', run: null });
    continue;
  }
  const { status, json } = await api('POST', '/bi-dashboard', { project_name: name, description, default_database: DB, default_schema: SCHEMA });
  const pid = json?.project_id || json?.data?.project_id || json?.dashboard?.project_id;
  console.log(`dashboard ${name} → ${status} ${pid || ''}`);
  created.push({ name, type: 'bi_dashboard', project_id: pid || null, steps: '-', run: status >= 400 ? `create failed ${status}` : null });
}
// 3rd dashboard via auto-create on a real table
if (![...existing.keys()].some((n) => n.startsWith('SEED_DASH_AUTO'))) {
  const { status, json } = await api('POST', '/bi-dashboard/auto-create', { mode: 'table', table_fqn: fq('PROJECT_EVENTS'), name: 'SEED_DASH_AUTO_EVENTS' });
  const pid = json?.project_id || json?.data?.project_id || json?.dashboard_id || json?.data?.dashboard_id;
  console.log(`auto-create dashboard → ${status} ${pid || ''}`);
  created.push({ name: 'SEED_DASH_AUTO_EVENTS', type: 'bi_dashboard(auto)', project_id: pid || null, steps: 'auto from PROJECT_EVENTS', run: status >= 400 ? `auto-create failed ${status}` : null });
} else console.log('skip (exists): SEED_DASH_AUTO_EVENTS');

// ---------------------------------------------------------------- 2d. real runs
const TO_RUN = ['SEED_WF_GOV_SCORE', 'SEED_WF_RLS_AUDIT', 'SEED_WF_KPI_REFRESH'];
for (const name of TO_RUN) {
  const rec = created.find((c) => c.name === name && c.project_id);
  if (!rec) continue;
  const { status, json } = await api('POST', `/workflow/${rec.project_id}/execute`, { trigger_type: 'manual' });
  const taskId = json?.task_id || json?.run_id || json?.data?.task_id || json?.data?.run_id;
  rec.run = `execute=${status} status=${json?.status || '?'}${taskId ? ' run=' + taskId : ''}`;
  console.log(`execute ${name} → ${status}`, JSON.stringify(json).slice(0, 260));
}
// let runs land, then read run history
await page.waitForTimeout(8000);
for (const name of TO_RUN) {
  const rec = created.find((c) => c.name === name && c.project_id);
  if (!rec) continue;
  const { status, json } = await api('GET', `/workflow/${rec.project_id}/runs`);
  const runs = json?.runs || json?.data?.runs || json?.data || [];
  const last = Array.isArray(runs) ? runs[0] : null;
  if (last) rec.run += ` | last_run=${last.status || '?'} (${last.run_id || ''})`;
  else rec.run += ` | runs_list=${status}`;
}

// ---------------------------------------------------------------- 3. verification
console.log('\n=== VERIFICATION (GET /projects) ===');
for (const t of ['workflow', 'explore_design']) {
  const { json } = await api('GET', `/projects?project_type=${t}&limit=100`);
  const seeds = (json.projects || []).filter((p) => p.project_name.startsWith('SEED_'));
  console.log(`${t}: ${seeds.map((p) => `${p.project_name}=${p.project_id}`).join(', ') || '(none)'}`);
}

// ---------------------------------------------------------------- 4. report
console.log('\n=== SEED REPORT ===');
console.log(JSON.stringify({ created, problems }, null, 2));
await browser.close();
