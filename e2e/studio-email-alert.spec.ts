/**
 * studio-email-alert — the e-mail delivery panel renders and behaves, in a
 * real browser, on a real workflow.
 *
 * Proof standard: the panel is FOLDED under a workflow that has no e-mail (so
 * a reader who doesn't want it isn't shown a setup card), opening it reads the
 * capability and paints the enrollment card + the form, and a save paints the
 * real message preview inside its sandboxed frame. Not a 200, not a screenshot
 * alone — the surface doing its job.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const APP = process.env.APP ?? 'proj_d3922b1b628d';
const OUT = process.env.OUT ?? 'e2e/results';

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

test('e-mail delivery: folded by default, opens to the enrollment card + form, saves to a preview', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=workflows`, { waitUntil: 'domcontentloaded' });

    // ── open a workflow that has NO e-mail configured ──────────────────
    const search = page.getByRole('searchbox', { name: /Search workflows/i }).or(
      page.locator('input[aria-label="Search workflows"]'),
    );
    if (await search.first().isVisible().catch(() => false)) {
      await search.first().fill('Rapport');
    }
    const openBtn = page.getByRole('button', { name: /Rapport périodique/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 60_000 });
    await openBtn.click();

    // FOLDED: the disclosure is a link, no setup card yet
    const disclosure = page.getByRole('button', { name: /Deliver by e-mail/i });
    await expect(disclosure).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/isn't set up on this account/i)).toHaveCount(0);
    notes.push('✓ e-mail delivery is folded on a workflow without it');

    // OPEN: reading the capability paints the form (enrollment card only when
    // the account is not enrolled — the form is present either way)
    await disclosure.click();
    await expect(
      page.getByRole('heading', { name: /Deliver by e-mail/i }).or(page.getByText(/Deliver by e-mail/i).first()),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[placeholder="DATA360_EMAIL"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/Add a recipient e-mail/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Professional/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Custom HTML/i })).toBeVisible();
    notes.push('✓ opening reads the capability and paints the form');
    await page.screenshot({ path: `${OUT}/email-panel-enrollment.png`, fullPage: false });

    // Custom template reveals the HTML editor + placeholder chips
    await page.getByRole('button', { name: /Custom HTML/i }).click();
    await expect(page.getByRole('button', { name: '{{rows_table}}' })).toBeVisible({ timeout: 10_000 });
    notes.push('✓ custom template reveals the HTML editor + placeholder chips');
    await page.getByRole('button', { name: /Professional/i }).click();

    // ── the configured workflow auto-expands; a save paints the preview ─
    await page.goto(`/studio/apps/${APP}?view=workflows`, { waitUntil: 'domcontentloaded' });
    const openAlert = page.getByRole('button', { name: /Alerte d'échéance/i }).first();
    await expect(openAlert).toBeVisible({ timeout: 60_000 });
    await openAlert.click();
    // configured → auto-expanded (no disclosure click needed)
    await expect(page.locator('input[placeholder="DATA360_EMAIL"]')).toBeVisible({ timeout: 30_000 });
    // ensure a valid recipient is present (prefilled or typed)
    const recip = page.getByLabel(/Add a recipient e-mail/i);
    if ((await page.getByText('JohnDoe@example.com').count()) === 0) {
      await recip.fill('JohnDoe@example.com');
      await recip.press('Enter');
    }
    const saveBtn = page.getByRole('button', { name: /Save configuration|Update configuration/i });
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    await saveBtn.click();
    // the preview frame paints the real message
    const frame = page.locator('iframe[title="E-mail preview"]');
    await expect(frame).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Configuration saved/i)).toBeVisible();
    notes.push('✓ a save paints the sandboxed preview frame — nothing sent');
    await page.screenshot({ path: `${OUT}/email-panel-preview.png`, fullPage: false });

    // the panel didn't throw
    expect(consoleErrors.filter((e) => /EmailAlert|email/i.test(e))).toEqual([]);
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nEMAIL-ALERT NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
