import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
// SEED_WF_PLATFORM_HEALTH — has a destination writing to
// CP_DATA360.EVENT_STORE.SEED_OUT_PLATFORM_HEALTH.
const WF = 'proj_bf6e32758ab5';
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

test('Data Access populates when a destination block is selected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  // Open the workflow list, then open SEED_WF_PLATFORM_HEALTH into the builder.
  await page.goto('/workflow', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  const row = page.getByText(/PLATFORM_HEALTH|Platform events|Platform Health/i).first();
  await row.click({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(9000);

  const gov = page.locator('[aria-label="Governance"], [title="Governance"]');
  const nodes = page.locator('.react-flow__node');
  const n = await nodes.count();
  let populated = false;
  // Selecting a canvas node auto-switches the right panel to Block Details, so for
  // each node: select it, RE-OPEN Governance, then check the Data Access section.
  // Assert on "Owner:" / "Viewer roles" — text that ONLY exists in the Data
  // Access panel (never on a canvas node label), to avoid a false positive.
  for (let i = 0; i < Math.min(n, 8); i++) {
    await nodes.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await gov.last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const hint = await page.getByText(/Select an output.*block/i).count();
    const daScoped = await page.getByText(/^Owner:/i).count()
      + await page.getByText(/Viewer roles \(/i).count();
    // eslint-disable-next-line no-console
    console.log(`WFPOP node ${i}/${n}: hint=${hint} dataAccessScoped=${daScoped}`);
    if (hint === 0 && daScoped > 0) { populated = true; break; }
  }

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'wf-data-access-populated.png') }).catch(() => {});
  // eslint-disable-next-line no-console
  console.log('WFPOP nodes=', n, 'populated=', populated, 'errors=', errors.length);
  expect(errors, `page errors: ${errors.slice(0, 3).join(' || ')}`).toEqual([]);
  expect(populated, 'Data Access populated for a destination block').toBe(true);
});
