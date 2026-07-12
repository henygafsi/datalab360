import { test, type Page } from '@playwright/test';

/**
 * ed-schemafocus — visual capture of the catalog schema-click focus flow:
 * center KPI band (tables / columns / PII / quality) + immediate lineage.
 * Not an assertion gate; produces e2e/results/schemafocus-*.png at 1920×1080.
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(10 * 60_000);

const PROJECT = process.env.D360_PROJECT ?? 'proj_27fcf868068a';

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

test('catalog schema-click → center KPI band + lineage screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await signIn(page);

  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`);
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 1. Overview — full map (breadcrumb → Overview) for the "before" state.
  const overviewBtn = page.locator('nav[aria-label="Catalog focus"] button', { hasText: 'Overview' });
  if (await overviewBtn.isVisible().catch(() => false)) {
    await overviewBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: 'e2e/results/schemafocus-1-overview.png' });

  // 2. Click a DATABASE node → db focus (KPI band appears at db level).
  const dbNode = page.locator('button[title="Dive into this database"]').first();
  if (await dbNode.isVisible().catch(() => false)) {
    await dbNode.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: 'e2e/results/schemafocus-2-db.png' });

  // 3. Click a SCHEMA node → schema focus (KPI band + per-object scores + lineage).
  const schemaNode = page.locator('button[title="Dive into this schema"]').first();
  if (await schemaNode.isVisible().catch(() => false)) {
    await schemaNode.click().catch(() => {});
    // Let the per-object KPI fetches land so Quality is scored, not a spinner.
    await page.waitForTimeout(9000);
  }
  await page.screenshot({ path: 'e2e/results/schemafocus-3-schema.png' });

  // 4. Band close-up for design review.
  const band = page.locator('[data-testid="focus-kpi-band"]');
  if (await band.isVisible().catch(() => false)) {
    await band.screenshot({ path: 'e2e/results/schemafocus-4-band.png' });
  }
});
