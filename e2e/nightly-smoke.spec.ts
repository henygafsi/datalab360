import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Fast nightly smoke — one test PER page so Playwright parallelizes across
 * workers (the full all-pages-audit is ONE sequential test with networkidle
 * (60s) + scroll loops + screenshots, so it can't parallelize and times out at
 * ~7min). This trades the visual capture for speed: each page just proves it
 * renders authenticated, shows no error boundary, and emits no page errors —
 * runnable repeatedly in a nightly loop (~1-2 min with workers).
 */

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

test.use({ storageState: STATE });
test.setTimeout(75_000);

const PAGES = [
  '/account-overview',
  '/client-accounts',
  '/explore-design',
  '/explore-design?view=catalog',
  // Modeling view WITH a project — the source-rail/virtualizer path that crashed
  // into the error boundary on schema switch (fixed 8b34f9d5). Keep it covered.
  '/explore-design?project_id=proj_01c59ad751d8&view=modeling',
  '/workflow',
  '/governance',
  '/bi-dashboard',
  '/intelligent',
  '/data-quality',
  '/observability',
  '/administration',
  '/data-source-connection',
];

for (const route of PAGES) {
  test(`smoke ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text().slice(0, 140)); });

    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    expect(page.url(), `${route} not bounced to signin`).not.toContain('/signin');
    await expect(page.getByText(/Something went wrong/i), `${route} no error boundary`).toHaveCount(0);
    const bodyLen = (await page.locator('body').innerText().catch(() => '')).trim().length;
    // eslint-disable-next-line no-console
    console.log(`SMOKE ${route} bodyLen=${bodyLen} errors=${errors.length}`);
    expect(bodyLen, `${route} rendered content`).toBeGreaterThan(200);
    expect(errors, `${route} page errors: ${errors.slice(0, 4).join(' || ')}`).toEqual([]);
  });
}
