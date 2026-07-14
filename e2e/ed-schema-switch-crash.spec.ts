import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
const PROJECT = 'proj_01c59ad751d8';
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
test.setTimeout(150_000);

// Rapidly churn the selected-schema set (which grows/shrinks the source rail's
// flatItems) to exercise the virtualizer index race that crashed the page into
// the "Something went wrong" boundary. With the guard, no crash across the churn.
test('schema-switch churn does not crash the source rail', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || String(e)).slice(0, 300)));

  await page.goto(`/explore-design?project_id=${PROJECT}&view=catalog`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const openSelector = async () => {
    await page.getByText(/schema[s]? selected/i).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
  };

  const toggle = async (name: RegExp) => {
    await openSelector();
    await page.getByText(name).first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
  };

  for (let i = 0; i < 4; i++) {
    await toggle(/AZRZARAZRE/i);   // add/remove the small schema (13 tables)
    // scroll the rail mid-churn to force virtualizer re-measure
    await page.mouse.wheel(0, 600).catch(() => {});
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, -400).catch(() => {});
    await toggle(/RETAIL_DW/i);    // add/remove the big schema (45 tables)
    await page.waitForTimeout(300);
    const boundary = await page.getByText(/Something went wrong/i).count();
    if (boundary > 0) { errors.push('ERRBOUNDARY at iteration ' + i); break; }
  }

  const boundary = await page.getByText(/Something went wrong/i).count();
  // eslint-disable-next-line no-console
  console.log('SCHEMASWITCH errBoundary=', boundary, 'pageerrors=', errors.length, errors.slice(0, 3));
  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'schema-switch.png') }).catch(() => {});
  expect(boundary, 'no error boundary after schema churn').toBe(0);
  expect(errors, 'no page errors during schema churn').toEqual([]);
});
