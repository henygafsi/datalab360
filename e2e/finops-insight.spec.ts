import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** Verifies the two new COCO FinOps insight blocks render on the FinOps tab. */
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-HAHA';
const USER = process.env.D360_USER ?? 'HAHA';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
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
test.setTimeout(180_000);

// storage-insight lives on the FinOps tab; warehouse-insight on the Performance tab.
const CASES: Array<{ section: string; testid: string; header: string }> = [
  { section: 'finops', testid: 'storage-insight', header: 'COCO reads your storage' },
  { section: 'performance', testid: 'warehouse-insight', header: 'COCO reads your warehouses' },
];

for (const c of CASES) {
  test(`${c.testid} renders a COCO narrative (section=${c.section}), no page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/account-overview?section=${c.section}`, { waitUntil: 'domcontentloaded' });

    const block = page.getByTestId(c.testid);
    // Data-first: skeleton immediately, then the real narrative (server-cached → fast).
    await expect(block).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(c.header)).toBeVisible({ timeout: 90_000 });

    const txt = (await block.innerText().catch(() => '')) || '';
    // eslint-disable-next-line no-console
    console.log(`INSIGHT ${c.testid} len=${txt.length} :: ${txt.replace(/\s+/g, ' ').slice(0, 120)}`);
    expect(txt.length, `${c.testid} has content`).toBeGreaterThan(40);
    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);

    await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', `${c.testid}.png`) }).catch(() => {});
  });
}
