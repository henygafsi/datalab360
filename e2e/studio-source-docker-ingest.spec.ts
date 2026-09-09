/**
 * studio-source-docker-ingest — thread 1 of the user's directive: "the
 * source must be tested with real data from docker or rest api ingestion".
 *
 * The "Docker PG (journey)" connection points at a REAL local Postgres
 * (container d360-test-postgres, postgres:16-alpine, 127.0.0.1:5433,
 * db retaildb, user d360). Its diagnostic was failing on a missing secret
 * ("authentication — no password supplied"). This spec rotates the real
 * secret in through the product's own config-draft flow and proves the
 * diagnostic reads the REAL database:
 *   config draft → set password → Save the draft → Test the draft
 *     ⇒ authentication = pass, metadata discovery = pass (real schema read)
 *   → Apply → active "Test the connection" ⇒ overall pass.
 *
 * It drives the existing ConnectionSheet surface only — no new UI. Row-
 * level preview lives behind discover→attach→ObjectsPanel and is a
 * separate step (reported, not built here).
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir \
 *     npx playwright test e2e/studio-source-docker-ingest.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';
const PG_SECRET = process.env.PG_SECRET ?? 'd360test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function login(p: Page) {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await p.locator('input[name="username"], input#username').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  const deadline = Date.now() + 90_000;
  for (;;) {
    const s = await p.request.get('/api/auth/session').then((r) => r.json()).catch(() => null);
    if (s?.user?.access_token) return;
    if (Date.now() > deadline) throw new Error('login timeout');
    await p.waitForTimeout(1200);
  }
}

test('Docker PG source is tested with real data (secret rotated → diagnostic green)', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);

    // Open the Connections view and the Docker PG connection sheet.
    await page.goto('/studio/source?view=connections', { waitUntil: 'domcontentloaded' });
    const card = page.getByText(/Docker PG \(journey\)/i).first();
    await expect(card, 'the Docker PG (journey) connection exists').toBeVisible({ timeout: 60_000 });
    await card.click();
    // the sheet opens in place — the config section is the anchor
    await expect(page.getByText(/Identity & capabilities|IDENTITY & CAPABILITIES/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // Rotate the real secret through a config draft.
    await page.getByRole('button', { name: /Change the configuration \(draft\)|Continue the draft/ }).click();
    const pw = page.locator('section input[type="password"]').first();
    await expect(pw).toBeVisible({ timeout: 15_000 });
    await pw.fill(PG_SECRET);
    await page.getByRole('button', { name: /^Save the draft$/ }).click();

    // Test the DRAFT against the real container (no apply yet).
    const testDraftBtn = page.getByRole('button', { name: /^Test the draft$/ });
    await expect(testDraftBtn).toBeVisible({ timeout: 20_000 });
    await testDraftBtn.click();

    const draftTest = page.locator('div[role="status"]').filter({ hasText: 'Draft test' });
    await expect(draftTest).toBeVisible({ timeout: 60_000 });
    // real-data proof: authentication + metadata discovery pass against retaildb
    const authRow = draftTest.locator('li').filter({ hasText: 'authentication' }).first();
    await expect(authRow).toContainText('pass', { timeout: 30_000 });
    const metaRow = draftTest.locator('li').filter({ hasText: 'metadata discovery' }).first();
    await expect(metaRow).toContainText('pass', { timeout: 30_000 });
    const draftText = (await draftTest.textContent()) ?? '';
    console.log('[docker] DRAFT diagnostic:\n' + draftText.replace(/\s+/g, ' ').trim());
    expect(draftText).not.toContain('no password supplied');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/docker-draft-green.png`, fullPage: true });

    // Apply the draft so the connection is really configured, then run the
    // active diagnostic — the source is now usable with real data.
    await page.getByRole('button', { name: /^Apply…$/ }).click();
    await page.getByRole('button', { name: /Confirm — the active configuration changes now/ }).click();
    // active test
    const testActive = page.getByRole('button', { name: /^Test the connection$/ });
    await expect(testActive).toBeVisible({ timeout: 30_000 });
    await testActive.click();
    // the active diagnostic (not the draft one) — the section under "Test the connection"
    await expect
      .poll(
        async () => {
          const t = (await page.locator('body').textContent()) ?? '';
          // authentication no longer complains about a missing password
          return !t.includes('no password supplied');
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const bodyAfter = (await page.locator('body').innerText()) ?? '';
    const activeAuthOk = /authentication/i.test(bodyAfter) && /\bpass\b/i.test(bodyAfter);
    console.log(`[docker] active auth shows pass = ${activeAuthOk}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/docker-active.png`, fullPage: true });
  } finally {
    await context.close();
  }
});
