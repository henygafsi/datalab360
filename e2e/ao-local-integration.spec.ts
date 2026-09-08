/**
 * ao-local-integration — the UI_VERIFIED_LOCAL journey for the Account
 * Overview lot (front :3000 + corrected backend :8078, both local builds).
 *
 * Evidence contract (per the convergence mandate):
 *  - trace: 'on' (full traces under e2e/.artifacts/), one PNG per step under
 *    e2e/results/ao-local-integration/, per-step timings written as JSON with
 *    run start/end, front HEAD and BUILD_ID — correlatable with the backend's
 *    timestamped access log.
 *  - PROVENANCE, not just presence: every asserted figure is compared with
 *    the API payload that feeds it (same window, same cache key).
 *  - Backend-path correlation via AO-001 body meta.served_from and
 *    /command-center/actions=200 (the deployed backend has neither).
 *  - RM: cancel-path only. The real DROP is never exercised on the live
 *    monitor (it caps real spend) — mutation stays NOT-VERIFIED by design.
 *
 * Requires: D360_PASS in the env (never hardcoded — repo secrets rule);
 * next start :3000 built with API_PROXY_UPSTREAM=127.0.0.1:8078; uvicorn
 * :8078 with DATA360_SVC_AUTO_PROVISION=0.
 */
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';

const RESULTS_DIR = path.join(__dirname, 'results', 'ao-local-integration');
const runMeta: {
  startedAt: string;
  endedAt?: string;
  frontHead?: string;
  buildId?: string;
  steps: Array<{ test: string; step: string; tMs: number }>;
} = { startedAt: new Date().toISOString(), steps: [] };

test.beforeAll(() => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  try {
    runMeta.frontHead = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') })
      .toString()
      .trim();
    runMeta.buildId = fs
      .readFileSync(path.join(__dirname, '..', 'apps', 'data360', '.next', 'BUILD_ID'), 'utf8')
      .trim();
  } catch {
    /* recorded as undefined — the report must then say so */
  }
});

test.afterAll(() => {
  runMeta.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(RESULTS_DIR, 'timings.json'), JSON.stringify(runMeta, null, 2));
});

test.use({ viewport: { width: 1600, height: 950 }, trace: 'on' });
test.setTimeout(420_000);
test.skip(!PASS, 'D360_PASS not set — export it to run the local-integration journey (never hardcoded)');

const t0 = Date.now();
function makeMark(testName: string, page: Page) {
  let shot = 0;
  return async (step: string) => {
    const tMs = Date.now() - t0;
    runMeta.steps.push({ test: testName, step, tMs });
    console.log(`[t+${(tMs / 1000).toFixed(1)}s] ${step}`);
    shot += 1;
    await page
      .screenshot({
        path: path.join(RESULTS_DIR, `${testName}-${String(shot).padStart(2, '0')}.png`),
      })
      .catch(() => {});
  };
}

async function login(page: Page) {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await page.locator('input[name="username"], input#username').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await expect
    .poll(
      async () => {
        const s = await page.request.get('/api/auth/session').then((r) => r.json()).catch(() => null);
        return Boolean(s?.user?.access_token);
      },
      { timeout: 120_000, message: 'NextAuth session never carried an access_token' },
    )
    .toBe(true);
  const s = await page.request.get('/api/auth/session').then((r) => r.json());
  return s.user.access_token as string;
}

/**
 * B2-aware API probe: a cold key answers HTTP 200 { state:'preparing',
 * retry_after_seconds } while the backend computes in the background. A
 * contract-compliant client re-reads after retry_after — so must the spec's
 * own provenance probes (bounded), otherwise a TTL rollover mid-suite reads
 * an envelope where it expects the payload.
 */
async function fetchReady(
  page: Page,
  token: string,
  url: string,
  capMs = 90_000,
): Promise<Record<string, unknown> & { [k: string]: any }> {
  const t0 = Date.now();
  for (;;) {
    const body = await page.request
      .get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 130_000 })
      .then((r) => r.json());
    if (body?.state !== 'preparing' || Date.now() - t0 > capMs) return body;
    await page.waitForTimeout(
      Math.min(Math.max((Number(body.retry_after_seconds) || 5) * 1000, 2000), 10_000),
    );
  }
}

test('journey: :8078 path, U&P slice with provenance, AI panel, RM cancel-proof', async ({ page }) => {
  const mark = makeMark('journey', page);
  const token = await login(page);
  await mark('auth OK (session token present)');

  // ── Correlation: the browser path hits the CORRECTED local backend ──
  const summaryRes = await page.request.get('/api-proxy/command-center/summary', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130_000,
  });
  expect(summaryRes.status(), 'summary via the front proxy').toBe(200);
  const summaryBody = await summaryRes.json();
  expect(
    ['live', 'cache'],
    'AO-001 meta.served_from — only the corrected local backend emits it',
  ).toContain(summaryBody?.meta?.served_from);
  const actionsRes = await page.request.get('/api-proxy/command-center/actions', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130_000,
  });
  expect(actionsRes.status(), '/actions is 404 on the deployed backend, 200 locally').toBe(200);
  await mark(`correlation OK (served_from=${summaryBody?.meta?.served_from}, /actions=200)`);

  // ── Warm-cache proof on the same endpoint ──
  const warm = await page.request.get('/api-proxy/command-center/summary', {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 130_000,
  });
  expect((await warm.json())?.meta?.served_from, '2nd summary read from cache').toBe('cache');
  await mark(`cache warm OK (x-execution-time-ms=${warm.headers()['x-execution-time-ms']})`);

  // ── Shell ──
  await page.goto('/account-overview', { waitUntil: 'domcontentloaded' });
  const tablist = page.getByRole('tablist', { name: 'Account overview sections' });
  await expect(tablist, 'horizontal section tabs render').toBeVisible({ timeout: 60_000 });
  await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(page.getByRole('group', { name: 'Time window' })).toBeVisible({ timeout: 30_000 });
  await mark('shell OK (horizontal tabs + analytical header)');

  // ── U&P slice: KPI with PROVENANCE (UI = API = Σ query_count) ──
  await page.getByRole('tab', { name: /^Usage$/ }).click({ timeout: 30_000 });
  const totalQueries = page
    .locator('div', { has: page.getByText(/^Total Queries \(\d+d\)$/) })
    .locator('[class*="text-2xl"], [class*="text-xl"]')
    .first();
  await expect(totalQueries, 'Total Queries KPI shows a value').not.toHaveText(/^—?$/, {
    timeout: 180_000,
  });
  const kpiLabel = await page.getByText(/^Total Queries \(\d+d\)$/).textContent();
  const windowDays = Number(kpiLabel?.match(/\((\d+)d\)/)?.[1] ?? 30);
  const kpiValue = Number(((await totalQueries.textContent()) ?? '').replace(/[^0-9]/g, ''));
  const perfApi = await fetchReady(
    page,
    token,
    `/api-proxy/org-accounts/performance-overview?days=${windowDays}`,
  );
  const apiTotal = (perfApi.query_performance ?? []).reduce(
    (n: number, d: { query_count?: number }) => n + (Number(d.query_count) || 0),
    0,
  );
  expect(kpiValue, `UI KPI ${kpiValue} vs API Σ query_count ${apiTotal} (days=${windowDays})`).toBe(apiTotal);
  await mark(`U&P KPI provenance OK (UI=${kpiValue} = API Σ=${apiTotal}, window ${windowDays}d)`);

  await expect
    .poll(
      async () =>
        page.locator('.recharts-surface').evaluateAll((els) =>
          els.reduce(
            (n, el) =>
              n +
              el.querySelectorAll('.recharts-curve, .recharts-bar-rectangle, .recharts-area-area, .recharts-dot')
                .length,
            0,
          ),
        ),
      { timeout: 60_000, message: 'charts never painted real marks' },
    )
    .toBeGreaterThan(0);
  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount, 'overview table bounded (Top-N page, not a dump)').toBeLessThanOrEqual(20);
  expect(rowCount, 'overview table has rows').toBeGreaterThan(0);
  const docOver = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(docOver, 'no document-level scroll').toBeLessThanOrEqual(8);
  await mark(`U&P charts+table OK (${rowCount} rows, docOver=${docOver}px)`);

  // ── Ask AI context panel ──
  await page.getByRole('button', { name: 'Ask AI' }).click({ timeout: 15_000 });
  const panel = page.getByRole('complementary', { name: 'AI context panel' });
  await expect(panel, 'context panel opens docked').toBeVisible({ timeout: 15_000 });
  await expect(panel, 'panel carries injected context').toContainText(/Usage/i);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden({ timeout: 10_000 });
  await mark('Ask AI panel OK (docked, context, Escape)');

  // ── RM cancel-proof: gated control, confirm, Cancel, ZERO DELETE on wire ──
  const deletes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'DELETE') deletes.push(r.url());
  });
  await page.goto('/client-accounts', { waitUntil: 'domcontentloaded' });
  const dropBtn = page.locator('button[aria-label^="Drop resource monitor"]').first();
  await expect
    .poll(
      async () => {
        if (await dropBtn.count()) return true;
        await page.mouse.wheel(0, 900);
        return false;
      },
      { timeout: 120_000, message: 'RM drop control never rendered (permission or data)' },
    )
    .toBe(true);
  await dropBtn.scrollIntoViewIfNeeded();
  await dropBtn.click();
  const confirm = page.getByText(/removes a spend guard/);
  await expect(confirm, 'explicit confirm banner').toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(confirm).toBeHidden({ timeout: 10_000 });
  expect(deletes, 'NO DELETE request emitted after Cancel').toHaveLength(0);
  await mark('RM cancel-proof OK (gated render → confirm → Cancel, 0 DELETE)');
});

// ─── AO-014: scope provenance AND its UI restitution (payload-driven) ────────
test('AO-014: query-volume figure and scope banner both come from the payload', async ({ page }) => {
  const mark = makeMark('ao-014', page);
  const token = await login(page);

  const api = await fetchReady(page, token, '/api-proxy/org-accounts/queries?days=30');
  expect(api.scope, 'AO-014 scope field').toMatch(/^(org|account)$/);
  expect(typeof api.total_queries, 'total_queries numeric').toBe('number');
  await mark(`API: scope=${api.scope}, total=${api.total_queries}, source=${api.meta?.scope_source}`);

  await page.goto('/client-accounts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Query Volume').first(), 'Query Volume card renders').toBeVisible({
    timeout: 120_000,
  });

  // Anchor on the figure's own row (the div holding the "queries · last Nd"
  // label) — `.last()` on any div containing "Query Volume" broke when the
  // card's DOM nesting changed: it landed on the header row, which never
  // carries the figure.
  const figure = page
    .locator('div', { has: page.getByText(/^queries · last \d+d$/) })
    .last()
    .locator('text=/^[0-9][0-9.,]*[KM]?$/')
    .first();
  await expect(figure, 'figure painted').toBeVisible({ timeout: 120_000 });
  const raw = ((await figure.textContent()) ?? '').trim();
  const shown = raw.endsWith('K')
    ? parseFloat(raw) * 1_000
    : raw.endsWith('M')
      ? parseFloat(raw) * 1_000_000
      : parseFloat(raw.replace(/,/g, ''));
  const rel = Math.abs(shown - api.total_queries) / Math.max(api.total_queries, 1);
  expect(rel, `UI ${raw} (${shown}) vs API ${api.total_queries}`).toBeLessThan(0.02);
  await mark(`provenance OK (UI ${raw} ≈ API ${api.total_queries})`);

  // Restitution is PAYLOAD-driven: the banner text is the API's own note.
  if (api.scope === 'account') {
    expect(typeof api.note, 'scope=account carries an explanatory note').toBe('string');
    await expect(
      page.getByText(api.note.slice(0, 60), { exact: false }).first(),
      'banner shows the payload note verbatim',
    ).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText(/showing the current account only/i).first()).toBeHidden();
  }
  await mark(`restitution OK (scope=${api.scope} banner from payload.note)`);
});

// ─── FinOps: KPI provenance + readable trend ─────────────────────────────────
test('FinOps: Credits KPI matches cost-breakdown and the trend paints', async ({ page }) => {
  const mark = makeMark('finops', page);
  const token = await login(page);

  const api = await fetchReady(page, token, '/api-proxy/command-center/cost-breakdown?days=30');
  expect(typeof api.total_credits, 'total_credits numeric').toBe('number');
  await mark(`API: total_credits=${api.total_credits} (served_from=${api.meta?.served_from ?? 'n/a'})`);

  await page.goto('/account-overview', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^FinOps$/ }).click({ timeout: 60_000 });

  const creditsKpi = page
    .locator('div', { has: page.getByText(/^Credits \(30d\)$/) })
    .locator('[class*="text-2xl"], [class*="text-xl"]')
    .first();
  await expect(creditsKpi, 'Credits KPI shows a value').not.toHaveText(/^—?$/, { timeout: 180_000 });
  const kpiVal = parseFloat(((await creditsKpi.textContent()) ?? '').replace(/[^0-9.]/g, ''));
  expect(
    Math.abs(kpiVal - api.total_credits),
    `UI Credits ${kpiVal} vs API ${api.total_credits}`,
  ).toBeLessThan(0.5);
  await mark(`provenance OK (UI ${kpiVal} ≈ API ${api.total_credits})`);

  await expect
    .poll(
      async () =>
        page.locator('.recharts-surface').evaluateAll((els) =>
          els.reduce(
            (n, el) =>
              n + el.querySelectorAll('.recharts-curve, .recharts-area-area, .recharts-bar-rectangle').length,
            0,
          ),
        ),
      { timeout: 120_000, message: 'FinOps trend never painted marks' },
    )
    .toBeGreaterThan(0);
  await mark('trend OK (marks painted)');
});

// ─── Quality: AO-004 flags drive the UI states honestly ──────────────────────
test('Quality: AO-004 dmf flags restitution (not-configured ≠ 0%)', async ({ page }) => {
  const mark = makeMark('quality', page);
  const token = await login(page);

  const api = await fetchReady(page, token, '/api-proxy/command-center/kpis/dq?days=30');
  await mark(`API: dmf_available=${api.dmf_available}, dmf_configured=${api.dmf_configured}`);

  await page.goto('/account-overview', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /^Quality$/ }).click({ timeout: 60_000 });
  await expect(page.getByText('Coverage', { exact: false }).first()).toBeVisible({ timeout: 180_000 });

  if (api.dmf_configured === false) {
    await expect(
      page.getByText(/No data-quality monitoring configured|Enable DMF/i).first(),
      'setup recommendation shown (not a fabricated 0% quality)',
    ).toBeVisible({ timeout: 60_000 });
    for (const gone of ['Dmf Measurements', 'Distinct Metrics', 'Monitored Tables']) {
      await expect(
        page.getByText(gone, { exact: true }),
        `redundant zero-card '${gone}' collapsed`,
      ).toHaveCount(0);
    }
    await mark('AO-004 OK (not-configured → setup state, zero-cards collapsed)');
  } else {
    await expect(page.getByText(/Explore all measurements/i)).toBeVisible({ timeout: 60_000 });
    await mark('AO-004 OK (configured → Explore link present)');
  }
});

// ─── 2026-09 restructure: readiness matrix (B1) + X-Request-ID (AO-018) +
//     honest states + viewport reflow + FinOps recomposition ─────────────────
test('restructure: readiness matrix, request-id echo, honest copy, 1366 reflow, FinOps', async ({
  page,
}) => {
  const mark = makeMark('restructure', page);

  // Every apiClient request now carries a generated X-Request-ID (ui_<uuid>);
  // the backend echoes it on the response — capture real app traffic pairs.
  const ridPairs: Array<{ sent: string; echoed: string | null; url: string }> = [];
  page.on('response', (res) => {
    const sent = res.request().headers()['x-request-id'];
    if (sent && res.url().includes('/api-proxy/') && !res.url().includes('cache-stream')) {
      ridPairs.push({ sent, echoed: res.headers()['x-request-id'] ?? null, url: res.url() });
    }
  });

  const token = await login(page);

  // B1 contract, via the SAME read the UI rides (overview-kpis).
  const kpisApi = await page.request
    .get('/api-proxy/command-center/overview-kpis?range=30d', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 130_000,
    })
    .then((r) => r.json());
  expect(kpisApi.availability?.domains, 'B1 availability block present').toBeTruthy();
  const domainKeys = Object.keys(kpisApi.availability.domains);
  expect(domainKeys.length, 'availability carries domains').toBeGreaterThanOrEqual(8);
  await mark(
    `availability OK (${domainKeys.length} domains, backend=${kpisApi.availability.cache_backend}, snapshot=${kpisApi.availability.snapshot_id})`,
  );

  await page.goto('/account-overview', { waitUntil: 'domcontentloaded' });

  // Readiness matrix is the Account centerpiece — renders with real states.
  await expect(page.getByText('Data readiness').first(), 'readiness matrix title').toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText(/Updated \d+[smhd] ago/).first(),
    'at least one domain shows a REAL age (not "just now" fetch time)',
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Domains ready').first(), 'coverage KPI tile').toBeVisible({
    timeout: 30_000,
  });
  await mark('readiness matrix OK (real ages painted)');

  // Honest copy sweep: no maturity ladder, no public cache-plumbing buttons,
  // no vendor names in customer-facing copy (brand rule).
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText, 'maturity ladder removed from first level').not.toMatch(/maturity ladder/i);
  expect(bodyText, 'no public "Refresh cache" control').not.toContain('Refresh cache');
  expect(bodyText, 'vendor-neutral copy').not.toMatch(/Snowflake|Cortex|Kimi/);
  await mark('honest-copy sweep OK');

  // AO-018 in real traffic: app requests carry ui_ ids, echoed verbatim.
  const appPairs = ridPairs.filter((p) => p.sent.startsWith('ui_'));
  expect(appPairs.length, 'app traffic carries generated X-Request-IDs').toBeGreaterThan(3);
  for (const p of appPairs.slice(0, 8)) {
    expect(p.echoed, `echo for ${p.url.slice(-60)}`).toBe(p.sent);
  }
  await mark(`X-Request-ID OK (${appPairs.length} app requests, echo verified)`);

  // Accessibility-size reflow: 1366×768 keeps the one-pager contract.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(1200);
  const over1366 = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - window.innerHeight,
    horiz: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  expect(over1366.doc, '1366×768: no document scroll').toBeLessThanOrEqual(8);
  expect(over1366.horiz, '1366×768: no horizontal overflow').toBe(false);
  await mark('1366×768 reflow OK');
  await page.setViewportSize({ width: 1600, height: 950 });

  // FinOps recomposition: trend + top drivers on the first screen, details
  // bar visible, admin warehouse actions NOT in front of the reporting.
  await page.getByRole('tab', { name: /^FinOps$/ }).click({ timeout: 30_000 });
  await expect(
    page.getByText(/Top cost drivers/).first(),
    'ranking beside the trend',
  ).toBeVisible({ timeout: 180_000 });
  await expect(
    page.getByRole('button', { name: 'Budgets & anomalies' }),
    'details bar reachable without scroll',
  ).toBeVisible({ timeout: 30_000 });
  expect(
    await page.getByText(/warehouse lifecycle actions/i).count(),
    'admin actions not on the primary FinOps screen',
  ).toBe(0);
  await mark('FinOps recomposition OK (trend+drivers, details bar, actions demoted)');
});
