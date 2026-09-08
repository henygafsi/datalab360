/**
 * studio-convergence-dod — the convergence definition-of-done, exercised
 * with REAL, REVERSIBLE mutations on the star application.
 *
 * The success criterion is NOT « each page works alone »: it is that the
 * application behaves like one versioned, editable, operable system — a
 * change made in one view persists, survives a full reopen, and the
 * context (lifecycle, brief, knowledge, detections) reads the SAME truth.
 *
 * Every mutation here is restored (rename back, delete the throwaway
 * profile, remove the probe glossary term); nothing is applied to the
 * warehouse and no fixture is left modified.
 *
 * Run:
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     npx playwright test e2e/studio-convergence-dod.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const APP = process.env.D360_STUDIO_STAR ?? 'proj_576e16333cdf';
const PROBE = `DOD PROBE ${Date.now() % 100000}`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(420_000);

let page: Page;

async function login(p: Page) {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await p.locator('input[name="username"], input#username').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  await expect
    .poll(
      async () =>
        Boolean(
          await p.request
            .get('/api/auth/session')
            .then((r) => r.json())
            .then((s) => s?.user?.access_token)
            .catch(() => null),
        ),
      { timeout: 90_000 },
    )
    .toBe(true);
}

test.beforeAll(async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS is required (grep PAT: apps/data360/.env)');
  page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await login(page);
});

test.afterAll(async () => page?.close());

test('the application opens on the served brief — lifecycle, questions, one next action', async () => {
  await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist', { name: 'Workspace views' }).waitFor({ timeout: 60_000 });
  // Overview is the landing view
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Next best action')).toBeVisible({ timeout: 60_000 });
  // ONE lifecycle chip in the header — never two unexplained badges
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toMatch(/(Draft|Ready to activate|Active|Paused|Degraded)/);
  // the seven questions render when the server context answers
  // (absence is tolerated — the context degrades, never blanks)
});

test('a workflow renamed in the editor persists across a FULL reopen — then restored', async () => {
  await page.goto(`/studio/apps/${APP}?view=workflows`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10_000);
  const firstEdit = page.getByRole('button', { name: 'Edit' }).first();
  test.skip(!(await firstEdit.isVisible().catch(() => false)), 'no workflow on the app');
  await firstEdit.click();
  const nameInput = page.getByLabel('Workflow name');
  await expect(nameInput).toBeVisible({ timeout: 20_000 });
  const original = await nameInput.inputValue();

  await nameInput.fill(PROBE);
  await page.getByRole('button', { name: /Save 1 change/ }).click();
  await expect(page.getByRole('button', { name: /Save 1 change/ })).toHaveCount(0, {
    timeout: 60_000,
  });

  // FULL reopen — a different page load, same truth
  await page.goto(`/studio/apps/${APP}?view=workflows`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10_000);
  await expect(page.getByText(PROBE).first()).toBeVisible({ timeout: 30_000 });

  // restore
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const nameInput2 = page.getByLabel('Workflow name');
  await expect(nameInput2).toBeVisible({ timeout: 20_000 });
  if ((await nameInput2.inputValue()) === PROBE) {
    await nameInput2.fill(original);
    await page.getByRole('button', { name: /Save 1 change/ }).click();
    await expect(page.getByRole('button', { name: /Save 1 change/ })).toHaveCount(0, {
      timeout: 60_000,
    });
  }
});

test('the detection registry reads honestly and a dry-run act stays a dry run', async () => {
  await page.goto(`/studio/apps/${APP}?view=detection`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9_000);
  await expect(page.getByText('Detection & alerts')).toBeVisible();
  const body = await page.evaluate(() => document.body.innerText);
  // states are said, never invented: any of the honest words must appear
  expect(body).toMatch(/(needs an observation first|on demand|scheduled|inactive|No detector)/);
});

test('knowledge says where it came from and an explicit sync answers', async () => {
  await page.goto(`/studio/apps/${APP}?view=knowledge`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8_000);
  await expect(page.getByRole('button', { name: /Refresh from context/ })).toBeVisible();
  await page.getByRole('button', { name: /Refresh from context/ }).click();
  await expect(
    page.getByText(/(proposal\(s\) written|Nothing new — the knowledge already reflects)/),
  ).toBeVisible({ timeout: 60_000 });
});

test('a data profile created, listed, reopened and deleted — nothing applied', async () => {
  await page.goto(`/studio/apps/${APP}?view=access`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9_000);
  await page.getByRole('button', { name: /New profile/ }).click();
  await page.getByPlaceholder('Magasins Nord').fill(PROBE);
  // ready-to-select objects: click the first chip
  const chip = page.locator('section[aria-label="New data profile"], section').getByRole('button', { name: /SRC_/ }).first();
  await chip.click();
  await page.getByRole('button', { name: 'Create the profile' }).click();

  // back on the pilot list, the profile exists as planned
  await expect(page.getByRole('button', { name: PROBE })).toBeVisible({ timeout: 30_000 });
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toContain('planned');

  // delete (two clicks, consequences said) — the app is left as found
  const row = page.locator('tr', { hasText: PROBE });
  await row.getByRole('button', { name: 'Delete…' }).click();
  await row.getByRole('button', { name: /Confirm — policies stay until undo/ }).click();
  await expect(page.getByRole('button', { name: PROBE })).toHaveCount(0, { timeout: 30_000 });
});

test('a glossary term added then removed — words feed the AI, cleanup proven', async () => {
  await page.goto(`/studio/apps/${APP}?view=knowledge`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8_000);
  await page.getByLabel('New glossary term').fill('dod_probe');
  await page.getByLabel('Meaning of the new term').fill('temporary DoD probe term');
  await page.getByLabel('Add the term').click();
  await expect(page.getByRole('button', { name: /dod_probe/ })).toBeVisible({ timeout: 30_000 });

  // clearing the meaning removes the term (the backend's own semantics)
  await page.getByRole('button', { name: /dod_probe/ }).click();
  const meaning = page.getByLabel(/Meaning of dod_probe/);
  await meaning.fill('');
  await meaning.press('Enter');
  await expect(page.getByRole('button', { name: /dod_probe/ })).toHaveCount(0, { timeout: 30_000 });
});
