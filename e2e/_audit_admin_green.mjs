import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const SH = 'docs/product-readiness-audit/screens/admin-green';
const TABS = [
  'health', 'performance', 'access', 'costGov', 'projects',
  'featureGov', 'apiHealth', 'serverMetrics', 'config',
];

const b = await chromium.launch();
const ctx = await b.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1600, height: 1100 },
});
const p = await ctx.newPage();

const consoleErrors = [];
const serverErrors = []; // >=500 responses
p.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
});
p.on('response', (r) => {
  if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

const findings = [];

for (const tab of TABS) {
  consoleErrors.length = 0;
  serverErrors.length = 0;
  const url = `${BASE}/administration?tab=${tab}`;
  await p.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(6000);
  // capture empty/error UI states
  const badText = await p
    .getByText(/Could not load|Failed to load|CACHE_NOT_READY|svc_connect_failed|Something went wrong|No data available/i)
    .allInnerTexts()
    .catch(() => []);
  await p.screenshot({ path: `${SH}/admin-${tab}.png`, fullPage: true }).catch(() => {});
  findings.push({
    tab,
    consoleErrors: [...new Set(consoleErrors)],
    serverErrors: [...new Set(serverErrors)],
    badPanels: [...new Set(badText)].slice(0, 8),
  });
  console.log(`[${tab}] consoleErr=${consoleErrors.length} 5xx=${serverErrors.length} badPanels=${badText.length}`);
}

// ---- KPI cross-check: Server Metrics tab "Total requests" vs /admin/server-metrics ----
await p.goto(`${BASE}/administration?tab=serverMetrics`, { waitUntil: 'networkidle' }).catch(() => {});
await p.waitForTimeout(6000);
const bodyText = await p.locator('body').innerText().catch(() => '');
// grab a backend number at the same moment via the page's own fetch (carries auth cookies/proxy)
const apiTotal = await p.evaluate(async () => {
  try {
    const res = await fetch('/api-proxy/admin/server-metrics', { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return { ok: false, status: res.status };
    const d = await res.json();
    return { ok: true, total_requests: d.total_requests, active_users: d.active_users };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
});

console.log('\n===== CROSS-CHECK (Server Metrics) =====');
console.log('backend /admin/server-metrics:', JSON.stringify(apiTotal));
// extract the big "Total requests" style number shown in UI
const uiNums = (bodyText.match(/[\d,]{2,}/g) || []).map((s) => Number(s.replace(/,/g, ''))).filter((n) => n > 0);
console.log('UI numeric tokens (sample):', uiNums.slice(0, 25).join(', '));

console.log('\n===== FINDINGS JSON =====');
console.log(JSON.stringify(findings, null, 1));

await b.close();
