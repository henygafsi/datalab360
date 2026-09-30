/**
 * studio-workflow-suggestions — proposed workflows read as AI suggestions the
 * user can review (keep) or dismiss, and can ask the AI to propose more.
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

test('workflow suggestions: proposed read as reviewable suggestions + Suggest more', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);
    await page.goto(`/studio/apps/${APP}?view=workflows`, { waitUntil: 'domcontentloaded' });

    // the self-service "Suggest workflows" action
    await expect(page.getByRole('button', { name: /Suggest workflows/i }).first()).toBeVisible({
      timeout: 90_000,
    });
    notes.push('✓ "Suggest workflows" action present');

    // proposed workflows are framed as reviewable suggestions
    await expect(page.getByText(/proposed for this application/i)).toBeVisible({ timeout: 30_000 });
    notes.push('✓ proposed workflows framed as suggestions (review / dismiss)');

    // a suggestion row offers Review + Dismiss (do NOT actually dismiss)
    await expect(page.getByRole('button', { name: /^Review$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Dismiss$/ }).first()).toBeVisible();
    notes.push('✓ a suggestion row offers Review + Dismiss');
    await page.screenshot({ path: `${OUT}/workflow-suggestions.png`, fullPage: false });

    // asking for more proposals re-derives without crashing
    await page.getByRole('button', { name: /Suggest workflows/i }).first().click();
    await expect(page.getByText(/proposed for this application/i)).toBeVisible({ timeout: 90_000 });
    notes.push('✓ Suggest workflows re-derives proposals');
  } finally {
    // eslint-disable-next-line no-console
    console.log('\nWF-SUGGESTIONS NOTES:\n' + notes.join('\n'));
    await ctx.close();
  }
});
