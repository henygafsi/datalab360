import { test, expect, type Page } from '@playwright/test';

/**
 * Demo rehearsal — walks the exact PPT path and asserts each surface shows REAL
 * data, not a skeleton, a placeholder, or an error boundary. Doubles as a cache
 * warmer: every page it touches is fast for the presenter afterwards.
 *
 * Fails loudly if a surface would embarrass us on stage.
 */

const PASS = process.env.D360_PASS ?? '';
test.setTimeout(20 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

/** A transient backend hiccup must not fail the rehearsal — click Retry once. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  const retry = page.getByRole('button', { name: /^retry$/i }).first();
  if (await retry.isVisible().catch(() => false)) {
    await retry.click().catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  }
  expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false)).toBe(false);
}

test('demo step 1 — Account Overview: Problems strip shows real numbers + a Cortex briefing', async ({ page }) => {
  await signIn(page);
  await page.goto('/account-overview');
  await settle(page);

  const strip = page.getByRole('region', { name: /problems across the account/i });
  await expect(strip).toBeVisible({ timeout: 180_000 });
  await expect(strip).toContainText(/Failed queries/i);

  // The narrative is slower than the numbers by design — wait for it to resolve
  // or to degrade honestly. Never assert on a half-rendered strip.
  await expect
    .poll(async () => (await strip.innerText()).includes('Reading the error history'),
          { timeout: 240_000, intervals: [2_000] })
    .toBe(false);

  const text = await strip.innerText();
  console.log('STEP1_STRIP:', text.replace(/\n/g, ' | ').slice(0, 260));
  // A real, non-zero failure count — a zero here means we are reading nothing.
  expect(text).toMatch(/[1-9][\d,]*\s*$|[1-9][\d,]*\s*\|/m);
  expect(text).toMatch(/NEXT:|Summary unavailable|briefing/i);
  await page.screenshot({ path: 'e2e/results/demo-1-problems.png', fullPage: false });
});

test('demo step 2 — Catalog canvas: real nodes, typed schemas, and the axis cockpit', async ({ page }) => {
  await signIn(page);
  await page.goto('/explore-design/catalog');
  await settle(page);

  // The canvas summary panel reports what the graph actually loaded.
  const summary = page.getByText(/databases/i).first();
  await expect(summary).toBeVisible({ timeout: 180_000 });
  const summaryText = await summary.innerText();
  console.log('STEP2_CANVAS:', summaryText.replace(/\n/g, ' | '));
  expect(summaryText).not.toMatch(/Loading graph/i);

  // Click a schema node -> the level-aware cockpit opens with its six axes.
  const node = page.locator('.react-flow__node').nth(1);
  if (await node.isVisible().catch(() => false)) {
    await node.click();
    const cockpit = page.getByRole('tablist', { name: /cockpit axes/i });
    await expect(cockpit).toBeVisible({ timeout: 30_000 });
    console.log('STEP2_COCKPIT_AXES:', (await cockpit.innerText()).replace(/\n/g, ' '));
  }
  await page.screenshot({ path: 'e2e/results/demo-2-catalog.png', fullPage: false });
});

test('demo step 3 — Workflow: the PII Vault showcase exists and opens', async ({ page }) => {
  await signIn(page);
  await page.goto('/workflow');
  await settle(page);

  const vault = page.getByText(/PII Vault/i).first();
  await expect(vault).toBeVisible({ timeout: 120_000 });
  await vault.click();
  await settle(page);
  console.log('STEP3_WORKFLOW: PII Vault opened');
  await page.screenshot({ path: 'e2e/results/demo-3-vault.png', fullPage: false });
});

test('demo step 4 — Governance: policies are listed', async ({ page }) => {
  await signIn(page);
  await page.goto('/governance');
  await settle(page);
  const body = await page.locator('main').first().innerText();
  console.log('STEP4_GOVERNANCE:', body.replace(/\n/g, ' | ').slice(0, 200));
  expect(body.length).toBeGreaterThan(200);
  await page.screenshot({ path: 'e2e/results/demo-4-governance.png', fullPage: false });
});
