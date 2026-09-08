import { test } from '@playwright/test';

/**
 * Live verification for the 2026-07-16 batch:
 *  1. Guided policy builder ("New" tab, object-first) in the E&D right bar
 *  2. Release tab "Traced activity" feed (every action incl. test successes)
 *  3. 13" density: viewport 1440x900 @100% — screenshots for the audit log
 * Run: npx playwright test e2e/policy-trace-verify.spec.ts
 */

const USER = 'HAHA', PASS = process.env.D360_PASS || '', ACCOUNT = 'uchsfvb-HAHA';
const PROJECT = process.env.D360_PROJECT || 'proj_01c59ad751d8';
const SHOTS = '/Users/datalab360/.claude/jobs/3f5bfc4a/tmp/verify';

test.use({ viewport: { width: 1440, height: 900 } });

test('policy builder + release trace', async ({ page }) => {
  test.setTimeout(300_000);
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));

  // Sign in (re-fill account until it sticks — HMR clears it mid-fill)
  await page.goto('/signin');
  for (let i = 0; i < 5; i++) {
    await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT).catch(() => {});
    await page.locator('input[name="username"], input#username').first().fill(USER).catch(() => {});
    await page.locator('input[type="password"]').first().fill(PASS).catch(() => {});
    const acct = await page.locator('input[name="account_name"], input#account_name').first().inputValue().catch(() => '');
    if (acct === ACCOUNT) break;
    await page.waitForTimeout(500);
  }
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });

  // Modeling canvas
  await page.goto(`/explore-design?project_id=${PROJECT}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(9_000); // dev first-compile settle
  await page.screenshot({ path: `${SHOTS}/01-canvas-1440.png` });

  // Select a table node to arm the right bar with a target
  const node = page.locator('.react-flow__node').first();
  if (await node.count()) {
    await node.click().catch(() => {});
    await page.waitForTimeout(2_500);
  }
  await page.screenshot({ path: `${SHOTS}/02-table-selected.png` });

  // Governance tab → policy panel (builder should be the default "New" tab)
  const govTab = page.getByRole('button', { name: /governance/i }).first();
  if (await govTab.count()) {
    await govTab.click().catch(() => {});
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: `${SHOTS}/03-governance-tab.png` });
  }
  const newTab = page.getByRole('button', { name: /^New$/ }).first();
  if (await newTab.count()) {
    await newTab.click().catch(() => {});
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: `${SHOTS}/04-policy-builder.png` });
    const cards = await page.getByText(/Aggregation policy|Projection policy|Row access policy/i).count();
    console.log('POLICY_TYPE_CARDS_VISIBLE:', cards);
  } else {
    console.log('POLICY_BUILDER_TAB_NOT_FOUND');
  }

  // Release tab → Changes step + Traced activity
  const deployTab = page.getByRole('button', { name: /release|deploy/i }).first();
  if (await deployTab.count()) {
    await deployTab.click().catch(() => {});
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: `${SHOTS}/05-release-tab.png`, fullPage: false });
    const traced = await page.getByText('Traced activity').count();
    const noChanges = await page.getByText('No pending changes').count();
    console.log('TRACED_ACTIVITY_SECTION:', traced, 'NO_PENDING_EMPTY_STATE:', noChanges);
  }

  console.log('PAGE_ERRORS:', errs.length, errs.slice(0, 3));
});
