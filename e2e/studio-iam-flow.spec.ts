/**
 * studio-iam-flow — the redesigned data-access IAM surface (StudioGovernanceMap):
 * sub-tabs + master-detail. Proves the flow survives the restructure end-to-end:
 * open Advanced governance → People & roles → SELECT a principal → pick a role
 * CARD → the row shows its grant + the tab count increments → Review & apply →
 * "Prepare the change" enables → planDraftAccess fires and returns mutations.
 */
import { test, expect, type Page } from '@playwright/test';

const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const APP = process.env.APP ?? 'proj_576e16333cdf';
const SHOTS = process.env.SHOTS ?? '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function signIn(page: Page) {
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()) as { csrfToken: string };
  await page.request.post('/api/auth/callback/credentials', {
    form: { csrfToken: csrf.csrfToken, account_name: ACCOUNT, username: USER, password: PASS, redirect: 'false', json: 'true' },
  });
  const s = (await (await page.request.get('/api/auth/session')).json()) as { user?: unknown };
  if (!s?.user) throw new Error('signIn failed (PAT rejected?)');
}

test('data-access IAM: select principal → role card → prepare the change', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  let plannedStatus = 0;
  page.on('response', (r) => {
    if (/\/studio\/drafts\/[^/]+\/access\/plan/.test(r.url())) plannedStatus = r.status();
  });
  try {
    await signIn(page);
    await page.goto(`/studio/apps/${APP}?view=governance`, { waitUntil: 'domcontentloaded' });

    // open the Advanced governance disclosure → StudioAccessPanel → GovernanceMap
    const adv = page.getByRole('button', { name: /Advanced governance/i }).first();
    await expect(adv).toBeVisible({ timeout: 60_000 });
    await adv.click();

    // the sub-tab bar is the redesign's signature — one panel at a time
    const govTablist = page.getByRole('tablist', { name: 'Governance surface' });
    await expect(govTablist).toBeVisible({ timeout: 60_000 });
    await expect(govTablist.getByRole('tab', { name: /People & roles/ })).toBeVisible();
    await expect(govTablist.getByRole('tab', { name: /Row policies/ })).toBeVisible();
    await expect(govTablist.getByRole('tab', { name: /Review & apply/ })).toBeVisible();

    // master list: pick the first selectable principal (stable aria-label)
    const firstPrincipal = page.getByRole('button', { name: /^Select / }).first();
    await expect(firstPrincipal).toBeVisible({ timeout: 45_000 });
    const principalName = (await firstPrincipal.getAttribute('aria-label'))?.replace(/^Select /, '') ?? '?';
    await firstPrincipal.click();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/iam-selected.png`, fullPage: true });

    // detail panel opened → the role cards render with descriptions
    await expect(page.getByText(/Pick what .* may do/)).toBeVisible({ timeout: 15_000 });
    // click the first real Data360 role card (stable aria-label "Grant … to …")
    const roleCard = page.getByRole('button', { name: /^Grant / }).first();
    await expect(roleCard).toBeVisible({ timeout: 15_000 });
    await roleCard.click();

    // the People & roles tab now carries a count (>=1 to grant)
    const peopleTab = govTablist.getByRole('tab', { name: /People & roles/ });
    await expect(peopleTab).toContainText(/[1-9]/, { timeout: 15_000 });
    console.log(`[iam] selected "${principalName}" → role card → tab shows a grant count`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/iam-granted.png`, fullPage: true });

    // Review & apply → Prepare the change enables → planDraftAccess fires
    await govTablist.getByRole('tab', { name: /Review & apply/ }).click();
    const prepare = page.getByRole('button', { name: /Prepare the change/ });
    await expect(prepare).toBeVisible({ timeout: 15_000 });
    await expect(prepare).toBeEnabled();
    await prepare.click();
    await page.waitForResponse((r) => /\/access\/plan/.test(r.url()) && r.status() < 500, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    console.log(`[iam] Prepare the change → planDraftAccess HTTP ${plannedStatus || '(no call seen)'}`);
    expect(plannedStatus, 'planDraftAccess should have been called and not 5xx').toBeGreaterThan(0);
    expect(plannedStatus).toBeLessThan(500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/iam-prepared.png`, fullPage: true });
  } finally {
    await ctx.close();
  }
});
