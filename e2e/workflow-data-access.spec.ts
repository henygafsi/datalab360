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
test.setTimeout(120_000);

test('workflow Governance tab shows the Data Access section', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto('/workflow', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // Open a workflow from the "Choose a workflow project" list (the builder — and
  // its right-bar Governance section — only mount once a workflow is open).
  const row = page.getByText(/Bad reviews sentiment|Returns Integrity Gate|Reviews AI Enrichment/i).first();
  await row.click({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(9000);

  // Click the RIGHT-RAIL Governance icon (not the left-nav Governance menu — use
  // the last match, the rail is later in the DOM).
  const govBtns = page.locator('[aria-label="Governance"], [title="Governance"]');
  const govCount = await govBtns.count();
  // eslint-disable-next-line no-console
  console.log('WFACCESS govBtnCount=', govCount, 'url=', page.url());
  await govBtns.last().click({ timeout: 20000 }).catch((e) => console.log('WFACCESS click err', String(e).slice(0, 80)));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'wf-data-access.png') }).catch(() => {});

  // The Data Access section renders (either the real matrix, or the honest
  // "select an output block" hint) — never a crash.
  const dataAccess = page.getByText(/Data Access/i).first();
  await expect(dataAccess, 'Data Access section present').toBeVisible({ timeout: 15000 });

  const hasHint = await page.getByText(/Select an output.*block/i).count();
  const hasViewers = await page.getByText(/Viewer roles/i).count();
  // eslint-disable-next-line no-console
  console.log('WFACCESS dataAccess=1 hint=', hasHint, 'viewers=', hasViewers, 'errors=', errors.length);
  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'wf-data-access.png') }).catch(() => {});
  expect(errors, `page errors: ${errors.slice(0, 3).join(' || ')}`).toEqual([]);
});
