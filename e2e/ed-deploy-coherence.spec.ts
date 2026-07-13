import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
// proj_01c59ad751d8 is seeded with a PENDING incoherent FK (references
// NUM_TICKET_LIGNE, which is only part of a composite PK — not a standalone key).
const PROJECT = process.env.ED_REMEDIATION_PROJECT ?? 'proj_01c59ad751d8';
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

test('incoherent DDL blocks deploy with a coherence blocker', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('COHERENCE ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const releaseTab = page.getByRole('button', { name: 'Release', exact: true }).first();
  await expect(releaseTab, 'Release axis present').toBeVisible({ timeout: 20_000 });
  await releaseTab.click();
  await page.waitForTimeout(1800);

  const stepNav = page.getByRole('navigation', { name: /Release steps/i });
  const deployStep = stepNav.getByRole('button', { name: /Deploy/i }).first();
  if (await deployStep.isVisible().catch(() => false)) {
    await deployStep.click();
    await page.waitForTimeout(1200);
  }

  // The coherence blocker panel renders the incoherent FK + suggested fix.
  const panel = page.getByTestId('deploy-coherence-blockers');
  await expect(panel, 'coherence blocker panel visible').toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/Deploy blocked/i)).toBeVisible();
  await expect(panel.getByText(/FK_REFERENCES_NON_KEY/i), 'FK-non-key reason').toBeVisible();
  await expect(panel.getByText(/ADD UNIQUE/i), 'suggested fix shown').toBeVisible();

  // "Deploy now" must be disabled while the batch is incoherent.
  const deployNow = page.getByRole('button', { name: /Deploy now/i }).first();
  if (await deployNow.isVisible().catch(() => false)) {
    await expect(deployNow, 'Deploy now disabled by coherence gate').toBeDisabled();
  }
  log('coherence blocker shown + Deploy now disabled');

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'deploy-coherence.png') }).catch(() => {});
  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});
