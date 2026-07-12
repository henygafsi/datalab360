import { test, expect, type Page } from '@playwright/test';

/**
 * Data Quality viewport-fit tabs (redesign 2026-07 — "no one page and lifetime
 * scroll"). Guards the refactor of (dashboard)/data-quality/page.tsx:
 *  - NO page scroll: document scrollHeight fits the viewport (+ small epsilon);
 *    each main tab owns its own internal overflow-y-auto panel
 *  - 4 main tabs (Overview / Dimensions / Monitors (DMF) / Activity & Audit),
 *    each clickable, ?tab= synced via history.replaceState (no navigation),
 *    each rendering real content
 *  - KPI row always visible above the tabs (KPI-first ordering)
 *  - right rail: SmartRightBar "overview by axis" carries 7 bucket-colored chips
 *  - zero error boundaries, zero pageerrors
 */

const USER = process.env.D360_USER ?? 'HAHA';
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-HAHA';

// The layout keeps a min-h-screen root, so a viewport-fit page reports
// scrollHeight === innerHeight exactly. Epsilon absorbs sub-pixel rounding only.
const SCROLL_EPSILON = 8;

const MAIN_TABS = [
  { id: 'overview', label: 'Overview', marker: /Analytics & Charts|Recommendations/ },
  { id: 'dimensions', label: 'Dimensions', marker: /Completeness|Uniqueness/ },
  { id: 'monitors', label: 'Monitors (DMF)', marker: /Data Metric Functions/ },
  { id: 'audit', label: 'Activity & Audit', marker: /Query Audit/ },
] as const;

test.setTimeout(10 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT).catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill(USER).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

async function assertNoPageScroll(page: Page, when: string) {
  const { scrollHeight, innerHeight, scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  console.log(`[${when}] scrollHeight=${scrollHeight} innerHeight=${innerHeight}`);
  expect(scrollHeight, `no vertical page scroll (${when})`).toBeLessThanOrEqual(innerHeight + SCROLL_EPSILON);
  expect(scrollWidth, `no horizontal page scroll (${when})`).toBeLessThanOrEqual(innerWidth + SCROLL_EPSILON);
}

test('data-quality: viewport-fit tabs, no page scroll, axis chips, zero errors', async ({ page }) => {
  await signIn(page);

  // Collect pageerrors for the data-quality journey ONLY (registered after the
  // post-signin landing page settles): on a live dev stack, OTHER pages being
  // recompiled concurrently can throw ChunkLoadErrors on the landing route,
  // which are outside this gate's scope.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

  // Navigate to the page; retry the auth handshake once if the session cookie
  // races the redirect on the live dev stack.
  await page.goto('/data-quality');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  if (page.url().includes('/signin')) {
    pageErrors.length = 0; // signin bounce is pre-journey
    await signIn(page);
    await page.goto('/data-quality');
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  }

  // Zero error boundary.
  expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false)).toBe(false);

  // Shell + KPI row render before anything else (KPI-first ordering).
  await expect(page.locator('[data-dq-root]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[role="region"][aria-label="Data quality KPI scores"]')).toBeVisible({ timeout: 90_000 });

  // The KPI row sits ABOVE the tab strip in the layout.
  const kpiBox = await page.locator('[role="region"][aria-label="Data quality KPI scores"]').boundingBox();
  const tabsBox = await page.locator('[role="tablist"][aria-label="Data quality views"]').boundingBox();
  expect(kpiBox && tabsBox && kpiBox.y < tabsBox.y, 'KPI row must render above the main tabs').toBe(true);

  // NO page scroll on load.
  await assertNoPageScroll(page, 'initial load');

  // Same-page tab switching: marker survives (history.replaceState, no reload).
  await page.evaluate(() => { (window as any).__no_reload_marker = 1; });

  for (const t of MAIN_TABS) {
    const tab = page.locator(`[data-dq-main-tab="${t.id}"]`);
    await expect(tab, `main tab ${t.id} is clickable`).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(page.url(), `?tab= synced for ${t.id}`).toContain(`tab=${t.id}`);

    // The tab panel renders real content for this tab.
    const panel = page.locator(`[data-dq-panel="${t.id}"]`);
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const txt = await panel.innerText().catch(() => '');
        return t.marker.test(txt) ? 'marker' : `len=${txt.length}`;
      }, { timeout: 90_000, intervals: [1500] })
      .toBe('marker');

    // Still zero error boundary, still no page scroll.
    expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false)).toBe(false);
    await assertNoPageScroll(page, `tab ${t.id}`);

    await page.screenshot({ path: `e2e/results/redesign-dq-${t.id}.png`, fullPage: false });
  }

  // No reload happened across the four switches.
  expect(await page.evaluate(() => (window as any).__no_reload_marker)).toBe(1);

  // Right rail — "overview by axis": 7 bucket-colored highlight chips.
  const axisEntries = page.locator('[data-dq-axis]');
  await expect(axisEntries, 'right rail carries the 7 axis highlight entries').toHaveCount(7, { timeout: 30_000 });
  for (const axis of ['Data Quality', 'Freshness', 'Integrity', 'Thresholds', 'Storage', 'History']) {
    await expect(page.locator('[data-dq-axis]', { hasText: axis }).first()).toBeVisible();
  }

  // Zero uncaught page errors across the whole journey.
  expect(pageErrors, `pageerrors: ${pageErrors.join(' | ')}`).toEqual([]);
});
