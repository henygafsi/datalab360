import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** Verifies the COCO governance-posture narrative renders on the governance AI axis. */
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
test.setTimeout(180_000);

test('governance AI axis shows COCO posture narrative, no page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/governance?axis=ai', { waitUntil: 'domcontentloaded' });

  const block = page.getByTestId('gov-posture-insight');
  await expect(block).toBeVisible({ timeout: 60_000 });
  // Header always present; narrative lands from the (server-cached) Cortex call.
  await expect(page.getByText('COCO reads your governance posture')).toBeVisible({ timeout: 90_000 });

  const txt = (await block.innerText().catch(() => '')) || '';
  // eslint-disable-next-line no-console
  console.log(`GOV_POSTURE len=${txt.length} :: ${txt.replace(/\s+/g, ' ').slice(0, 140)}`);
  expect(txt.length, 'posture insight has content').toBeGreaterThan(40);
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'gov-posture-insight.png') }).catch(() => {});
});
