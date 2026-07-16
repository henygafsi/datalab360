import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const PASS = process.env.D360_PASS ?? '';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
// proj_01c59ad751d8 carries a standing FAILED FK DDL action (FK references a
// column with no primary key) — the live fixture for deploy-error remediation.
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

test('deploy failure surfaces a classified remediation for the failed DDL action', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const log = (m: string) => console.log('REMEDIATE ' + m); // eslint-disable-line no-console

  await page.goto(`/explore-design?project_id=${PROJECT}&view=modeling`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  // Open the Release axis. Collapsed, the right bar is a rail of <button
  // aria-label=…>; clicking "Release" expands the release panel.
  const releaseTab = page.getByRole('button', { name: 'Release', exact: true }).first();
  await expect(releaseTab, 'Release axis present').toBeVisible({ timeout: 20_000 });
  await releaseTab.click();
  await page.waitForTimeout(1800);

  // Navigate to the Deploy step inside the release stepper (nav aria-label
  // "Release steps"), if it isn't already active.
  const stepNav = page.getByRole('navigation', { name: /Release steps/i });
  const deployStep = stepNav.getByRole('button', { name: /Deploy/i }).first();
  if (await deployStep.isVisible().catch(() => false)) {
    await deployStep.click();
    await page.waitForTimeout(1200);
  } else {
    log('Deploy step nav not directly visible — panel may already be on Deploy');
  }

  // The remediation panel renders the standing failed action + its proposed fix.
  const panel = page.getByTestId('ddl-remediation');
  await expect(panel, 'remediation panel visible').toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/failed action\(s\)/i)).toBeVisible();
  // The FK-references-a-non-key classification produces an "Add a UNIQUE key"
  // remediation (UNIQUE coexists with an existing PK, unlike ADD PRIMARY KEY).
  await expect(panel.getByText(/Add a UNIQUE key/i), 'FK-needs-UNIQUE remediation title').toBeVisible({ timeout: 10_000 });
  // A runnable diagnostic is offered.
  const diag = panel.getByRole('button', { name: /Run diagnostic/i }).first();
  await expect(diag, 'diagnostic action offered').toBeVisible();
  log('remediation panel + FK-needs-PK fix + diagnostic present');

  // Governed apply: queue the corrective DDL as an audited deployment action
  // (owner/deployer sees "Queue fix for deploy"). Idempotent on the backend, so
  // clicking here won't stack duplicates.
  const queueFix = panel.getByRole('button', { name: /Queue fix for deploy|Request fix via approval/i }).first();
  await expect(queueFix, 'governed apply-fix action offered').toBeVisible({ timeout: 10_000 });
  await queueFix.click();
  await expect(panel.getByText(/Queued as a deployment action/i), 'fix queued confirmation').toBeVisible({ timeout: 20_000 });
  log('governed apply queued the corrective DDL');

  await page.screenshot({ path: path.join(__dirname, 'night-audit-artifacts', 'ddl-remediation.png') }).catch(() => {});
  log(`page errors (${errors.length}): ${errors.slice(0, 5).join(' || ')}`);
  expect(errors, 'no page errors').toEqual([]);
});
