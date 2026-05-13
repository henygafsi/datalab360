import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://data36.vercel.app';
const ACCOUNT = process.env.TEST_ACCOUNT || 'abcd';
const USER = process.env.TEST_USER || 'TESTADMIN';
const PASS = process.env.TEST_PASS || 'NewSecurePassword123!';

const PAGES = [
  '/account-overview',
  '/gouvernance',
  '/data-quality',
  '/observability',
  '/explore-design',
  '/workflow',
  '/intelligent',
  '/connect-datalake',
];

async function tryFill(page: Page, selectors: string[], value: string) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      await el.fill(value);
      return sel;
    }
  }
  throw new Error(`No selector matched: ${selectors.join(' / ')}`);
}

async function fullSignin(page: Page) {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await tryFill(page, [
    'input[name="account"]',
    'input[name="account_name"]',
    'input[name="accountName"]',
    'input[placeholder*="account" i]',
  ], ACCOUNT);
  await tryFill(page, [
    'input[name="username"]',
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="username" i]',
  ], USER);
  await tryFill(page, [
    'input[name="password"]',
    'input[type="password"]',
  ], PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.toString().includes('/signin'), { timeout: 60_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

test.describe('Data360 — signin + nav + create account', () => {
  test('signin flow + redirect', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror:' + e.message));

    console.log('GOTO', `${BASE}/signin`);
    await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: '/tmp/data360-shot-1-signin.png', fullPage: true });

    await tryFill(page, [
      'input[name="account"]',
      'input[name="account_name"]',
      'input[name="accountName"]',
      'input[placeholder*="account" i]',
    ], ACCOUNT);
    await tryFill(page, [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
    ], USER);
    await tryFill(page, [
      'input[name="password"]',
      'input[type="password"]',
    ], PASS);

    await page.screenshot({ path: '/tmp/data360-shot-2-filled.png', fullPage: true });

    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(u => !u.toString().includes('/signin'), { timeout: 60_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const currentUrl = page.url();
    console.log('after-submit URL:', currentUrl);
    await page.screenshot({ path: '/tmp/data360-shot-3-after-signin.png', fullPage: true });

    console.log('CONSOLE ERRORS after signin:', consoleErrors.slice(0, 10));
    expect(currentUrl).not.toContain('/signin');
  });

  test('navigate all pages after auth', async ({ page }) => {
    await fullSignin(page);
    const afterLoginUrl = page.url();
    console.log('after-login URL:', afterLoginUrl);

    const results: { url: string; status: number; finalUrl: string; errs: number }[] = [];
    for (const path of PAGES) {
      const errs: string[] = [];
      page.removeAllListeners('console');
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      const r = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(e => null);
      const status = r?.status() ?? 0;
      await page.waitForTimeout(1500);
      const fname = `/tmp/data360-page-${path.replace(/\//g, '_')}.png`;
      await page.screenshot({ path: fname, fullPage: true }).catch(() => {});
      const finalUrl = page.url();
      console.log(`PAGE ${path} → status=${status} final=${finalUrl} errs=${errs.length}`);
      results.push({ url: path, status, finalUrl, errs: errs.length });
    }
    console.log('SUMMARY:', JSON.stringify(results, null, 2));
  });

  test('create-account page reachable', async ({ page }) => {
    await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
    const link = page.locator('a:has-text("Create account"), a:has-text("Create Account")').first();
    if (await link.count() > 0) {
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);
      console.log('create-account URL:', page.url());
      await page.screenshot({ path: '/tmp/data360-shot-create-account.png', fullPage: true });
    } else {
      console.log('Create account link not found, going directly');
      await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.screenshot({ path: '/tmp/data360-shot-create-account.png', fullPage: true });
    }
  });
});
