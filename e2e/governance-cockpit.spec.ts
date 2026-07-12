import { test, expect, type Page } from '@playwright/test';

const PASS = process.env.D360_PASS ?? '';
test.setTimeout(8 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page
    .locator('input[name="account_name"], input#account_name')
    .first()
    .fill('uchsfvb-HAHA')
    .catch(() => {});
  await page
    .locator('input[name="username"], input#username')
    .first()
    .fill('HAHA')
    .catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

test('governance cockpit: compact KPI strip, segmented control, server-paginated audit', async ({
  page,
}) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));

  await signIn(page);
  await page.goto('/account-overview?section=security');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // Robust against URL-param drift: explicitly click the Security & Governance tab.
  await page
    .getByRole('button', { name: /security\s*&?\s*governance/i })
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(1500);

  // 1 · Compact KPI cockpit renders real values.
  const cockpit = page.locator('[data-testid="gov-kpi-cockpit"]');
  await expect(cockpit).toBeVisible({ timeout: 60_000 });
  // Governance score card is present with a real value.
  await expect(cockpit.getByText(/governance score/i).first()).toBeVisible({ timeout: 60_000 });
  // Honest KPI rule: the compact cockpit region never renders an em-dash.
  await expect(cockpit).not.toContainText('—');

  // 2 · Segmented control present.
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
  const auditToggle = page.getByRole('button', { name: 'Audit Table', exact: true });
  await expect(auditToggle).toBeVisible();
  await expect(page.getByRole('button', { name: 'Timeline', exact: true })).toBeVisible();

  // 3 · Switch to Audit Table → rows + a total count.
  await auditToggle.click();
  await expect(page.getByText(/of\s+[\d,]+\s+findings/i).first()).toBeVisible({ timeout: 30_000 });
  const rowCount = await page.locator('table tbody tr').count();
  expect(rowCount, 'audit table shows finding rows').toBeGreaterThan(0);

  // 5 · Clicking a row opens the contextual right bar (not a modal).
  await page.locator('table tbody tr').first().click();
  await expect(page.getByText('Summary', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Evidence', { exact: true }).first()).toBeVisible();

  await page.screenshot({ path: 'e2e/results/governance-cockpit.png', fullPage: false });
  expect(errs, 'zero pageerrors').toEqual([]);
});
