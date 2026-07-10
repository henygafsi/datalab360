import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(10 * 60_000);

// Throwaway live verification for the E&D cockpit upgrade (not a CI gate):
//  1. Deploy axis of proj_8824118e59ad shows the DEPLOYED truth
//     (VW_FACTORY_RETURNS_STAR, execution record, schedule state).
//  2. Header identity chips render (icon + type chip + tags) and inline tag
//     add/remove round-trips through PUT /projects/{id}.
test('deployed truth + identity chips on FACTORY · Returns Star', async ({ page }) => {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });

  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

  await page.goto('/explore-design?project_id=proj_8824118e59ad&view=modeling');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // ── Identity chips in the header ──
  await expect(page.getByRole('group', { name: 'Project tags' })).toBeVisible({ timeout: 60_000 });
  // Type chip (derived: explore_design → Data product)
  await expect(page.getByText('Data product', { exact: false }).first()).toBeVisible();
  // Existing free tags of the project
  await expect(page.getByRole('group', { name: 'Project tags' }).getByText('factory')).toBeVisible();

  // Inline tag add
  await page.getByRole('button', { name: 'Edit tags inline' }).click();
  const tagInput = page.getByLabel('Add a tag (Enter to add, Backspace to remove the last one)');
  await tagInput.fill('e2e-check');
  await tagInput.press('Enter');
  await expect(page.getByRole('group', { name: 'Project tags' }).getByText('e2e-check')).toBeVisible({ timeout: 30_000 });
  await tagInput.press('Escape').catch(() => {});
  // Inline tag remove (hover the chip to reveal ×)
  const chip = page.getByRole('group', { name: 'Project tags' }).getByText('e2e-check');
  await chip.hover();
  await page.getByRole('button', { name: 'Remove tag e2e-check' }).click();
  await expect(page.getByRole('group', { name: 'Project tags' }).getByText('e2e-check')).toHaveCount(0, { timeout: 30_000 });

  // ── Deploy axis: deployed truth ──
  // Open the right bar Release tab via the mini-rail / rail button.
  await page.getByRole('button', { name: 'Release' }).first().click().catch(async () => {
    await page.getByText('Release', { exact: true }).first().click();
  });
  const prod = page.getByLabel('Deployed production state');
  await expect(prod).toBeVisible({ timeout: 60_000 });
  await expect(prod.getByText('VW_FACTORY_RETURNS_STAR')).toBeVisible({ timeout: 90_000 });
  await expect(prod.getByText('deployed', { exact: false }).first()).toBeVisible();
  await expect(prod.getByText('No deployment schedule', { exact: false })).toBeVisible();

  await page.screenshot({ path: 'e2e/results/deployed-truth.png', fullPage: false });
  console.log('pageErrors:', errs);
  expect(errs).toEqual([]);
});
