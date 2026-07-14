import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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
test.setTimeout(90_000);

// The governance sub-pages had NO asserting e2e coverage (the audit sweep only
// hit top-level /governance). These are substantial demo pages — this smoke
// asserts each renders authenticated with content and no crash / page errors.
const PAGES = [
  '/governance/policies',
  '/governance/grants',
  '/governance/roles',
  '/governance/users',
  '/governance/security-matrix',
  '/governance/oauth',
  '/governance/access-matrix',
];

for (const route of PAGES) {
  test(`${route} renders authenticated with no crash / page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text().slice(0, 140)); });

    await page.goto(route, { waitUntil: 'domcontentloaded' });
    // These are the heaviest governance pages (oauth ~1.8k L, security-matrix
    // ~1.4k L); under parallel load a 6-7s fixed wait occasionally clipped the
    // content check. 9s absorbs the load so the nightly harness stays reliable.
    await page.waitForTimeout(9000);

    // Stayed on the page (not bounced to signin / 404).
    expect(page.url(), `${route} not redirected to signin`).not.toContain('/signin');
    // No React error boundary.
    await expect(page.getByText(/Something went wrong/i), `${route} no error boundary`).toHaveCount(0);
    // Rendered real content (body is not a blank shell).
    const bodyLen = (await page.locator('body').innerText().catch(() => '')).trim().length;
    // eslint-disable-next-line no-console
    console.log(`GOVSMOKE ${route} bodyLen=${bodyLen} errors=${errors.length}`);
    expect(bodyLen, `${route} rendered content`).toBeGreaterThan(200);
    // No page/console errors (the point of the audit).
    expect(errors, `${route} page errors: ${errors.slice(0, 4).join(' || ')}`).toEqual([]);
  });
}
