import { test, expect, type Page } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
const PROJECT = 'proj_d850771ce218'; // SEED_EXP_EVENT_MODEL
test.setTimeout(15 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test('E&D UX: zero pageerrors + no boundary on both views, screenshots', async ({ page }) => {
  await signIn(page);

  const views: Array<{ name: string; url: string; shot: string; coldShot: string }> = [
    { name: 'default', url: `/explore-design?project_id=${PROJECT}`, shot: 'e2e/results/edux-1-default.png', coldShot: 'e2e/results/edux-1-default-cold.png' },
    { name: 'catalog', url: `/explore-design?project_id=${PROJECT}&view=catalog`, shot: 'e2e/results/edux-2-catalog.png', coldShot: 'e2e/results/edux-2-catalog-cold.png' },
  ];

  for (const v of views) {
    const errs: string[] = [];
    const onErr = (e: Error) => errs.push(`${e.name}: ${e.message}`.slice(0, 200));
    page.on('pageerror', onErr);

    await page.goto(v.url);
    // Cold-load evidence: what the user sees BEFORE data lands (data-first
    // discipline — skeletons, never fabricated zeros).
    await page.waitForTimeout(1200);
    await page.screenshot({ path: v.coldShot, fullPage: true });

    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: v.shot, fullPage: true });

    const boom = await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false);
    expect(boom, `${v.name}: error boundary must not trip on a clean load`).toBe(false);
    expect(errs, `${v.name}: zero pageerrors required`).toEqual([]);
    page.off('pageerror', onErr);
  }
});

test('E&D UX: boundary auto-retries a transient chunk error once, then holds', async ({ page }) => {
  await signIn(page);

  // ── 1. Fresh transient chunk error → ONE automatic reload, user never sees
  //       the boundary and never clicks Retry.
  await page.evaluate(() => {
    window.sessionStorage.removeItem('d360-chunk-probe-thrown');
    window.sessionStorage.removeItem('d360-eb-auto-retry-at');
  });
  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog&__force_chunk_error=1`);
  // The probe throws a ChunkLoadError on the first post-hydration render; the
  // boundary must auto-reload. After the reload the probe is spent, so the
  // page recovers. Poll: the reload lands a few seconds after hydration.
  const navType = () =>
    page.evaluate(
      () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown'
    ).catch(() => 'unknown');
  await expect
    .poll(navType, { timeout: 90_000, intervals: [2000] })
    .toBe('reload');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const boomAfterRetry = await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false);
  expect(boomAfterRetry, 'after the automatic retry the page must be healthy').toBe(false);
  const retryStamp = await page.evaluate(() => window.sessionStorage.getItem('d360-eb-auto-retry-at'));
  expect(retryStamp, 'the auto-retry guard stamp must be set').not.toBeNull();
  await page.screenshot({ path: 'e2e/results/edux-3-auto-retry-recovered.png', fullPage: true });

  // ── 2. A SECOND transient error inside the cooldown must NOT loop reloads —
  //       the boundary shows with its manual Retry (real-error behavior kept).
  //       Refresh the guard stamp explicitly: with slowMo + video the 60s
  //       cooldown from step 1 can lapse before this navigation, which would
  //       (by design) allow another auto-reload instead of the boundary.
  await page.evaluate(() => {
    window.sessionStorage.removeItem('d360-chunk-probe-thrown');
    window.sessionStorage.setItem('d360-eb-auto-retry-at', String(Date.now()));
  });
  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog&__force_chunk_error=1`);
  await expect(page.getByText('Something went wrong', { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await page.screenshot({ path: 'e2e/results/edux-4-boundary-holds.png', fullPage: true });

  // Clean up the probe flags so later specs are unaffected.
  await page.evaluate(() => {
    window.sessionStorage.removeItem('d360-chunk-probe-thrown');
    window.sessionStorage.removeItem('d360-eb-auto-retry-at');
  });
});
