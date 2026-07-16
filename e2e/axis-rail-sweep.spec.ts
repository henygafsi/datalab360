import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AXIS RAIL SWEEP — priority-1 audit for "broken right-bar tab" / stuck axes.
 * For every deep-linkable axis on the cockpit pages, assert the axis panel opens
 * with real content and no error boundary / stuck skeleton.
 */
const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
fs.mkdirSync(path.dirname(STATE), { recursive: true });
if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

// Deep-linkable axis/section views across the cockpit pages.
const VIEWS: Array<{ url: string; label: string }> = [
  { url: '/governance?axis=overview', label: 'gov:overview' },
  { url: '/governance?axis=policies', label: 'gov:policies' },
  { url: '/governance?axis=users', label: 'gov:users' },
  { url: '/governance?axis=access', label: 'gov:access' },
  { url: '/governance?axis=history', label: 'gov:history' },
  { url: '/governance?axis=ai', label: 'gov:ai' },
  { url: '/account-overview?section=account', label: 'ao:account' },
  { url: '/account-overview?section=finops', label: 'ao:finops' },
  { url: '/account-overview?section=performance', label: 'ao:performance' },
  { url: '/account-overview?section=data-objects', label: 'ao:data-objects' },
  { url: '/account-overview?section=organization', label: 'ao:organization' },
];

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

for (const v of VIEWS) {
  test(`axis ${v.label} opens with content, no error/stuck`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(v.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000); // let SVC/redis-cached data land

    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    const boundary = /Something went wrong|Une erreur/i.test(body) && body.length < 900;
    // Stuck = still showing a bare loading affordance with almost no real content.
    const stuck = /cache initializing|initializing/i.test(body) && body.replace(/\s+/g, '').length < 400;
    const findings: string[] = [];
    if (errors.length) findings.push(`PAGE_ERRORS(${errors.length}): ${errors[0].slice(0, 140)}`);
    if (boundary) findings.push('ERROR_BOUNDARY');
    if (stuck) findings.push('STUCK');
    if (body.trim().length < 150) findings.push('EMPTY');
    // eslint-disable-next-line no-console
    console.log(`AXIS ${v.label} :: ${findings.length ? findings.join(' | ') : 'OK'} (len=${body.length})`);
    expect(findings, `${v.label} :: ${findings.join(' | ')}`).toEqual([]);
  });
}
