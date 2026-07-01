/**
 * TRUE endpoint-green sweep — many real projects + ALL account-wide
 * admin/governance/cost/cache/finops GET endpoints.
 *
 * Classification is OPENAPI-AWARE (not body-regex), per reviewer guidance:
 *   - 2xx                                   -> green
 *   - 5xx / 501                             -> defect (backend-only)
 *   - 422 / 400 validation                  -> defect (FRONTEND-fixable: wrong shape/enum)
 *   - 405                                   -> defect (FRONTEND-fixable: wrong method)
 *   - 404 + path NOT in openapi             -> defect (backend-only: route unshipped)
 *   - 404 + path IN openapi + "version/empty/no current" body -> gate (product rule)
 *   - 403/401 as ACCOUNTADMIN               -> defect (unexpected — admin shouldn't be forbidden)
 *   - status 0                              -> defect (network)
 *
 * Read-only: GET + dry_run POST only. Run:  node e2e/_sweep_true_green.mjs [maxProjects]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.BACKEND || 'http://localhost:8000';
const MAXP = parseInt(process.argv[2] || '14', 10);

function readToken() {
  const s = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth', 'state.json'), 'utf8'));
  const tok = (JSON.stringify(s).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [])
    .sort((a, b) => b.length - a.length)[0];
  if (!tok) throw new Error('no JWT in e2e/.auth/state.json');
  const c = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString());
  if (c.exp && c.exp * 1000 < Date.now()) throw new Error('token expired');
  return { tok, account: c.account_name, user: c.username, role: c.role };
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

// ---- openapi templated-path set + matcher --------------------------------
const oapi = await (await fetch(BACKEND + '/openapi.json')).json();
const tmpl = Object.keys(oapi.paths);
const tmplRe = tmpl.map(t => ({
  raw: t,
  re: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^/]+?\\\}/g, '[^/]+') + '$'),
}));
function pathInOpenapi(concrete) {
  const clean = concrete.split('?')[0];
  return tmplRe.some(x => x.re.test(clean));
}

// ---- classifier -----------------------------------------------------------
// returns { cls: 'green'|'gate'|'defect', kind, frontendFixable, detail }
function classify(method, p, status, body) {
  const txt = JSON.stringify(body || '').toLowerCase();
  if (status >= 200 && status < 300) return { cls: 'green' };
  if (status === 0) return { cls: 'defect', kind: 'network', frontendFixable: false, detail: txt.slice(0, 120) };
  if (status >= 500) {
    const fe = status === 501; // 501 = not implemented (backend), never FE
    return { cls: 'defect', kind: '5xx', frontendFixable: false, detail: `${status} ${txt.slice(0, 120)}` };
  }
  // 4xx
  if (status === 422 || status === 400) {
    // validation — FE controls request shape/enum
    return { cls: 'defect', kind: 'unexpected-4xx', frontendFixable: true, detail: `${status} validation: ${txt.slice(0, 140)}` };
  }
  if (status === 405) {
    return { cls: 'defect', kind: 'unexpected-4xx', frontendFixable: true, detail: `405 method-not-allowed (FE wrong verb)` };
  }
  if (status === 401 || status === 403) {
    // ACCOUNTADMIN should not be forbidden — unexpected
    return { cls: 'defect', kind: 'unexpected-4xx', frontendFixable: false, detail: `${status} forbidden-as-admin: ${txt.slice(0, 120)}` };
  }
  if (status === 404) {
    const inApi = pathInOpenapi(p);
    if (!inApi) return { cls: 'defect', kind: 'unexpected-4xx', frontendFixable: false, detail: `404 route NOT in openapi (unshipped): ${p.split('?')[0]}` };
    // path exists in openapi -> 404 is a product rule (no current version / empty / not found resource)
    if (/version|no current|empty|not found|no data|does not exist|aucun/.test(txt))
      return { cls: 'gate', detail: `404 product-rule: ${txt.slice(0, 100)}` };
    // 404 on a real route with opaque body — treat as defect (backend)
    return { cls: 'defect', kind: 'unexpected-4xx', frontendFixable: false, detail: `404 on real route, opaque: ${txt.slice(0, 100)}` };
  }
  // any other 4xx (409/429/...) — unexpected
  return { cls: 'defect', kind: 'unexpected-4xx', frontendFixable: false, detail: `${status} ${txt.slice(0, 120)}` };
}

const tally = { green: 0, gate: 0, defect: 0 };
const defectList = [];
let totalProbed = 0;
function record(label, method, p, status, body) {
  const c = classify(method, p, status, body);
  tally[c.cls]++;
  totalProbed++;
  if (c.cls === 'defect') {
    defectList.push({ endpoint: `${method} ${p}`, status, kind: c.kind, detail: `${label}: ${c.detail}`, frontendFixable: c.frontendFixable });
  }
  return c.cls;
}

console.log(`\n=== TRUE-green sweep · ${user}/${role} · acct=${account} ===\n`);

// ---- discovery for param'd account-wide endpoints ------------------------
const accResp = await call('GET', '/org-accounts/accounts');
const accList = (accResp.body?.accounts || accResp.body?.items || accResp.body || []).filter(a => a && a.account_name && !a.deleted_on);
// prefer our own account (locator/org match HAHA), else first live account
const ourAcct = accList.find(a => /HAHA/i.test(a.account_name)) || accList[0];
const acctName = ourAcct?.account_name;

const monResp = await call('GET', '/observability/cost/monitors');
const monName = (monResp.body?.monitors || monResp.body?.items || monResp.body || [])[0]?.name;

const rolesResp = await call('GET', '/gouvernance/roles');
const rolesArr = rolesResp.body?.roles || rolesResp.body?.items || rolesResp.body || [];
const aRole = (Array.isArray(rolesArr) ? rolesArr : []).map(r => (typeof r === 'string' ? r : r.name || r.role_name)).filter(Boolean)[0];

console.log(`discovery: acctName=${acctName} monitor=${monName} role=${aRole}\n`);

// ---- 1. per-project read endpoints (prefer projects with a version) ------
const projResp = await call('GET', '/projects');
const allProj = (projResp.body?.projects || projResp.body?.items || projResp.body || [])
  .filter(p => p && p.project_id && !/DELETEME|_TMP/i.test(p.project_name || ''));
// sort: deployed/versioned first so version-gated legs can show real green
allProj.sort((a, b) => (b.current_version_num || 0) - (a.current_version_num || 0));
const projects = allProj.slice(0, MAXP);
const versioned = projects.filter(p => (p.current_version_num || 0) > 0).length;
console.log(`projects: ${allProj.length} real · sweeping ${projects.length} (${versioned} with version>0)\n`);

for (const p of projects) {
  const id = p.project_id;
  const name = (p.project_name || id).slice(0, 26);
  const legs = [
    ['ed/get', 'GET', `/explore-design/${id}`],
    ['ed/state', 'GET', `/explore-design/${id}/state`],
    ['ed/versions', 'GET', `/explore-design/${id}/versions?limit=3`],
    ['ed/ddl-actions', 'GET', `/explore-design/${id}/ddl-actions`],
    ['ed/deployments', 'GET', `/explore-design/${id}/deployments`],
    ['ed/deploy-readiness', 'GET', `/explore-design/${id}/deployment-readiness`],
    ['ed/schedules', 'GET', `/explore-design/${id}/schedules`],
    ['ed/events', 'GET', `/explore-design/${id}/events`],
    ['cc/projectScores', 'GET', `/command-center/projects/${id}/scores?days=30`],
    ['cc/projectRollup', 'GET', `/command-center/projects/${id}/rollup?days=30`],
  ];
  const marks = [];
  for (const [label, m, url] of legs) {
    const r = await call(m, url);
    const cls = record(label, m, url, r.status, r.body);
    marks.push(cls === 'green' ? '+' : cls === 'gate' ? 'g' : 'X' + r.status);
  }
  console.log(`  ${name.padEnd(26)} v${(p.current_version_num||0)}  ${marks.join(' ')}`);
}

// ---- 2. account-wide admin/gov/cost/cache/finops GETs --------------------
const wide = [
  // admin
  ['admin.activityStats', 'GET', '/admin/activity-stats'],
  ['admin.apiHealth.listRuns', 'GET', '/admin/api-health/runs?limit=5'],
  ['admin.cache.coverage', 'GET', '/admin/cache/coverage'],
  ['admin.cache.svcHealth', 'GET', '/admin/cache/svc-health'],
  ['admin.cache.warmStatus', 'GET', '/admin/cache/warm-status'],
  ['admin.cache.invalidate(dry)', 'POST', '/admin/cache/invalidate-surface', { account, page: 'explore-design', module: 'explore_design', dry_run: true }],
  // governance
  ['gov.clientDashboard', 'GET', '/gouvernance/client/dashboard'],
  ['gov.users', 'GET', '/gouvernance/users'],
  ['gov.usersWithRoles', 'GET', '/gouvernance/users-with-roles'],
  ['gov.roles', 'GET', '/gouvernance/roles'],
  ['gov.grants', 'GET', '/gouvernance/grants'],
  ['gov.securityMatrix', 'GET', '/gouvernance/security-matrix'],
  ['gov.policies', 'GET', '/gouvernance/policies'],
  ['gov.policiesMyScope', 'GET', '/gouvernance/policies/my-scope'],
  ['gov.policiesHealth', 'GET', '/gouvernance/policies/health'],
  ['gov.policyTagsList', 'GET', '/gouvernance/policies/tags/list'],
  ['gov.d360Roles', 'GET', '/gouvernance/d360-roles'],
  ['gov.d360MyPermissions', 'GET', '/gouvernance/d360-roles/my-permissions'],
  ['gov.policyDmfList', 'GET', '/gouvernance/policies/dmf/list'],
  ['gov.complianceScore', 'GET', '/gouvernance/compliance/score'],
  ['gov.accessReviewSummary', 'GET', '/gouvernance/access-review/summary'],
  ['gov.oauthIntegrations', 'GET', '/gouvernance/oauth/integrations'],
  ['gov.oauthNetworkPolicies', 'GET', '/gouvernance/oauth/network-policies'],
  ['gov.oauthApiKeys', 'GET', '/gouvernance/oauth/api-keys'],
  ['gov.guiPermissions', 'GET', '/gouvernance/gui-permissions'],
  ['gov.guiMyAccess', 'GET', '/gouvernance/gui-permissions/my-access'],
  ['gov.enterpriseUsers', 'GET', '/gouvernance/enterprise-users'],
  // observability cost
  ['obs.cost.dailyCredits', 'GET', '/observability/cost/daily-credits?days=30'],
  ['obs.cost.warehouseUsage', 'GET', '/observability/cost/warehouse-usage?days=30'],
  ['obs.cost.storage', 'GET', '/observability/cost/storage'],
  ['obs.cost.monitors', 'GET', '/observability/cost/monitors'],
  ['obs.budgets', 'GET', '/observability/budgets'],
  // command-center
  ['cc.overviewKpis', 'GET', '/command-center/overview-kpis?range=30d'],
  ['cc.summary', 'GET', '/command-center/summary?days=30'],
  ['cc.costBreakdown', 'GET', '/command-center/cost-breakdown?days=30'],
  ['cc.infrastructure', 'GET', '/command-center/infrastructure?days=30'],
  ['cc.securityAudit', 'GET', '/command-center/security-audit?days=30'],
  ['cc.moduleHealth', 'GET', '/command-center/module-health?days=30'],
  ['cc.cacheMetrics', 'GET', '/command-center/cache-metrics'],
  ['cc.activityFeed', 'GET', '/command-center/activity-feed'],
  ['cc.crossModule', 'GET', '/command-center/cross-module'],
  ['cc.warehousePerformance', 'GET', '/command-center/warehouse-performance'],
  ['cc.queryIntelligence', 'GET', '/command-center/query-intelligence'],
  ['cc.pipelines', 'GET', '/command-center/pipelines'],
  ['cc.filterOptions', 'GET', '/command-center/filter-options?days=30'],
  ['cc.timeContext', 'GET', '/command-center/time-context'],
  // org-accounts finops
  ['org.dashboardOverview', 'GET', '/org-accounts/dashboard/overview'],
  ['org.dashboardUsage', 'GET', '/org-accounts/dashboard/usage'],
  ['org.dashboardTrends', 'GET', '/org-accounts/dashboard/trends?days=30'],
  ['org.accounts', 'GET', '/org-accounts/accounts'],
  ['org.accountHealthScore', 'GET', '/org-accounts/account-health-score'],
  ['org.credits', 'GET', '/org-accounts/credits?days=30'],
  ['org.creditsTrend', 'GET', '/org-accounts/credits/trend?days=30'],
  ['org.creditsTop', 'GET', '/org-accounts/credits/top?days=30&limit=5'],
  ['org.creditForecast', 'GET', '/org-accounts/credit-forecast?days_back=30'],
  ['org.orgWarehouseCredits', 'GET', '/org-accounts/organization/warehouse-credits?days=30'],
  ['org.orgCosts', 'GET', '/org-accounts/organization/costs?days=30'],
  ['org.orgStorage', 'GET', '/org-accounts/organization/storage'],
  ['org.orgRemainingBalance', 'GET', '/org-accounts/organization/remaining-balance'],
  ['org.orgSummary', 'GET', '/org-accounts/org-summary'],
  ['org.events', 'GET', '/org-accounts/events?days=30'],
  ['org.resourceMonitors', 'GET', '/org-accounts/resource-monitors'],
];
console.log('\n  -- account-wide admin/gov/cost/cache/finops --');
for (const [label, m, url, body] of wide) {
  const r = await call(m, url, body);
  const cls = record(label, m, url, r.status, r.body);
  console.log(`  ${(cls === 'green' ? '+' : cls === 'gate' ? 'g' : 'X' + r.status).padEnd(5)} ${label}`);
}

// ---- 3. param'd account-wide (discovered values; skip if no real value) --
console.log('\n  -- param\'d account-wide (discovered real values) --');
const param = [];
if (acctName) {
  param.push(['org.accountDetail', 'GET', `/org-accounts/accounts/${encodeURIComponent(acctName)}`]);
  param.push(['org.accountHealth', 'GET', `/org-accounts/health/${encodeURIComponent(acctName)}`]);
  param.push(['org.accountWarehouses', 'GET', `/org-accounts/warehouses/${encodeURIComponent(acctName)}?days=30`]);
  param.push(['org.creditHistory', 'GET', `/org-accounts/credits/history/${encodeURIComponent(acctName)}?days=30`]);
}
if (monName) param.push(['obs.costMonitor', 'GET', `/observability/cost/monitors/${encodeURIComponent(monName)}`]);
if (aRole) {
  param.push(['gov.grantsForRole', 'GET', `/gouvernance/grants-for-role/${encodeURIComponent(aRole)}`]);
  param.push(['gov.roleLeastPrivilege', 'GET', `/gouvernance/roles/${encodeURIComponent(aRole)}/least-privilege`]);
}
const skipped = [];
if (!acctName) skipped.push('account-param endpoints (no live account)');
if (!monName) skipped.push('cost-monitor detail (no monitor)');
if (!aRole) skipped.push('role-param endpoints (no role)');
for (const [label, m, url] of param) {
  const r = await call(m, url);
  const cls = record(label, m, url, r.status, r.body);
  console.log(`  ${(cls === 'green' ? '+' : cls === 'gate' ? 'g' : 'X' + r.status).padEnd(5)} ${label}`);
}

// ---- summary --------------------------------------------------------------
const trueGreenPct = +((tally.green / totalProbed) * 100).toFixed(1);
console.log(`\n=== ${tally.green} green · ${tally.gate} gated · ${tally.defect} defect / ${totalProbed} probed ===`);
console.log(`true-green: ${trueGreenPct}%  (green / totalProbed)`);
if (skipped.length) console.log(`skipped (excluded from totals): ${skipped.join('; ')}`);
if (defectList.length) {
  console.log('\nDEFECTS:');
  defectList.forEach(d => console.log(`  X ${d.status} [${d.kind}] FE-fixable=${d.frontendFixable}  ${d.endpoint}\n      ${d.detail}`));
}
fs.writeFileSync(path.join(__dirname, '_sweep_true_green_results.json'),
  JSON.stringify({ totalProbed, ...tally, trueGreenPct, defectList, skipped }, null, 2));
console.log('\nwrote e2e/_sweep_true_green_results.json');
