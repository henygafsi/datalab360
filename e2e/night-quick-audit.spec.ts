import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * NIGHT QUICK AUDIT — fast, parallel render check across every top-level page.
 * Bounded 12s settle per page (not the 180s of all-pages-audit). Flags:
 * error boundary, uncaught page errors, stuck cache, empty main region.
 */
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-HAHA';
const USER = process.env.D360_USER ?? 'HAHA';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');

const PAGES = [
  '/account-overview', '/client-accounts', '/explore-design', '/explore-design?view=catalog',
  '/explore-design/catalog', '/workflow', '/governance', '/bi-dashboard', '/intelligent',
  '/data-quality', '/observability', '/administration', '/data-source-connection',
];

fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT).catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill(USER).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
});

test.use({ storageState: STATE });

for (const p of PAGES) {
  test(`quick-audit ${p}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    const hasBoundary = /Something went wrong|Une erreur|Error boundary|Reessayer|Try again/i.test(body) && body.length < 800;
    const stuck = /cache initializing|initializing cache/i.test(body);
    const empty = body.trim().length < 120;
    const findings: string[] = [];
    if (errors.length) findings.push(`PAGE_ERRORS(${errors.length}): ${errors[0].slice(0, 160)}`);
    if (hasBoundary) findings.push('ERROR_BOUNDARY');
    if (stuck) findings.push('STUCK_CACHE');
    if (empty) findings.push('EMPTY');
    // eslint-disable-next-line no-console
    console.log(`QA ${p} :: ${findings.length ? findings.join(' | ') : 'OK'} (len=${body.length})`);
    expect(findings, `${p} :: ${findings.join(' | ')}`).toEqual([]);
  });
}
