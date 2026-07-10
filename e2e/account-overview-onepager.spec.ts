import { test, expect, type Page } from '@playwright/test';

/**
 * Account Overview one-pager — the 9 former tabs render as STACKED sections
 * on one scrollable page (user direction 2026-07-10): nav clicks jump-scroll,
 * the scrollspy keeps the nav in sync, and section bodies lazy-mount with
 * real data as they approach the viewport. Guards the refactor of
 * shared/command-center/index.tsx.
 */

const PASS = process.env.D360_PASS ?? '';
test.setTimeout(15 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

test('account-overview renders all sections stacked and scrollspy tracks', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await signIn(page);
  await page.goto('/account-overview');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // All 9 section shells exist at once — the one-pager contract.
  const sections = page.locator('[data-cc-section]');
  await expect(sections).toHaveCount(9, { timeout: 60_000 });

  // The overview section mounts immediately with real content (not a skeleton).
  const overview = page.locator('#cc-sec-overview');
  await expect(overview).toBeVisible();
  await expect
    .poll(async () => (await overview.innerText()).length, { timeout: 90_000 })
    .toBeGreaterThan(200);

  // Nav click on FinOps jump-scrolls to its section and the body mounts.
  await page.getByRole('tab', { name: /finops/i }).click();
  const finops = page.locator('#cc-sec-finops');
  await expect(finops).toBeInViewport({ timeout: 15_000 });
  await expect
    .poll(async () => (await finops.innerText()).length, { timeout: 120_000 })
    .toBeGreaterThan(200);

  // Nav jump to a FAR section: sections above it lazy-mount and grow during
  // the scroll — the re-anchor correction must keep Security in view.
  await page.getByRole('tab', { name: /security/i }).click();
  await expect
    .poll(async () => (await page.locator('#cc-sec-security').innerText()).length, { timeout: 120_000 })
    .toBeGreaterThan(100);
  await page.waitForTimeout(3000); // let re-anchor + spy suppression settle
  await expect(page.locator('#cc-sec-security')).toBeInViewport({ timeout: 15_000 });
  await expect(page).toHaveURL(/tab=security/, { timeout: 15_000 });

  // Plain scroll on SETTLED geometry (everything between is mounted now):
  // the scrollspy itself must follow and sync the URL — no click involved.
  await page.locator('#cc-sec-projects').scrollIntoViewIfNeeded();
  await expect(page).toHaveURL(/tab=projects/, { timeout: 15_000 });

  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
