import { test, expect, type Page } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(300_000);
async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}
test('repro #49: catalog view proj_d850771ce218', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String((e as Error).stack || e).slice(0, 800)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 400)); });
  await signIn(page);
  await page.goto('/explore-design?project_id=proj_d850771ce218&view=catalog');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const boundary = await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false);
  await page.screenshot({ path: 'e2e/results/repro49.png', fullPage: false });
  console.log('BOUNDARY:', boundary);
  console.log('ERRORS:\n' + errs.join('\n---\n'));
  expect(boundary, 'error boundary visible').toBe(false);
  const domDefects = errs.filter((e) => e.includes('cannot be a descendant') || e.includes('non-boolean attribute'));
  expect(domDefects, 'DOM nesting / bogus-attribute warnings').toEqual([]);
  const textLen = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.length);
  expect(textLen, 'catalog content').toBeGreaterThan(200);
});
