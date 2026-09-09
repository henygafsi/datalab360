/**
 * studio-access-guided — the Access "profile" rebuilt as a guided parcours
 * (thread 3): select/create a profile → ① Data & policies → ② Users →
 * ③ Review & apply, with the three layers kept distinct (business PROFILE
 * → generated data-access ROLE → USERS granted) and the object choice as a
 * categorized, paginated, searchable picker instead of a flat chip wall.
 *
 * Metadata-only: opens an existing app's Access view and its profile; never
 * compiles or applies (no warehouse spend).
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir APP=proj_576e16333cdf \
 *     npx playwright test e2e/studio-access-guided.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';
const APP = process.env.APP ?? 'proj_576e16333cdf';

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

test('Access profile is a guided parcours with distinct layers + object picker', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    // open an app (the named one if present, else the first in the list)
    await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
    // the 5-view nav is a tablist; the Access group tab may not be present if
    // the app failed to load — then fall back to the first app in the list.
    const accessTab = page.getByRole('tab', { name: 'Access' }).first();
    if (!(await accessTab.isVisible({ timeout: 20_000 }).catch(() => false))) {
      await page.goto('/studio', { waitUntil: 'domcontentloaded' });
      await page.locator('a[href*="/studio/apps/"]').first().click({ timeout: 30_000 });
    }
    await expect(page.getByRole('tab', { name: 'Access' }).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('tab', { name: 'Access' }).first().click();

    // the profiles panel
    const profilesHeading = page.getByRole('heading', { name: 'Data profiles' });
    if (!(await profilesHeading.isVisible().catch(() => false))) {
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/access-debug.png`, fullPage: true });
    }
    await expect(profilesHeading).toBeVisible({ timeout: 60_000 });
    // the second engine is NOT superposed — it's behind the Advanced disclosure
    await expect(page.getByRole('button', { name: /Advanced governance/ })).toBeVisible();
    // open the first profile
    const openBtn = page.getByRole('button', { name: 'Open' }).first();
    await expect(openBtn).toBeVisible({ timeout: 30_000 });
    await openBtn.click();

    // the three layers, kept distinct
    await expect(page.getByText('generates role', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('granted to', { exact: false })).toBeVisible();

    // the numbered guided steps
    await expect(page.getByRole('button', { name: /Data & policies/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Users/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Review & apply/ })).toBeVisible();

    // ① Data & policies: the categorized object picker (not a flat chip wall)
    await expect(page.getByRole('searchbox', { name: 'Search objects' })).toBeVisible({ timeout: 15_000 });
    const objCount = await page.getByText(/\d+ of \d+ selected/).first().textContent();
    console.log(`[access] object picker selection summary = ${objCount}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/access-1-data.png`, fullPage: true });

    // ② Users
    await page.getByRole('button', { name: /Users/ }).click();
    await expect(page.getByText(/planned first|Nobody is assigned|SHOW GRANTS/).first()).toBeVisible({
      timeout: 30_000,
    });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/access-2-users.png`, fullPage: true });

    // ③ Review & apply (no compile clicked — just the surface)
    await page.getByRole('button', { name: /Review & apply/ }).click();
    await expect(page.getByRole('button', { name: /Compile the plan/ })).toBeVisible({ timeout: 20_000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/access-3-apply.png`, fullPage: true });

    // responsive: no body overflow at tablet + mobile
    const offenders: string[] = [];
    for (const v of [
      { w: 1366, h: 768, tag: '1366' },
      { w: 390, h: 844, tag: '390' },
    ]) {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.waitForTimeout(300);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/access-apply-${v.tag}.png`, fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 2) {
        const who = await page.evaluate((vw) => {
          const out: string[] = [];
          document.querySelectorAll('*').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.right > vw + 2 && r.width > 40) {
              const cls = (el.getAttribute('class') || '').slice(0, 70);
              out.push(`${el.tagName.toLowerCase()}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
            }
          });
          return out.slice(-6); // the deepest offenders print last
        }, v.w);
        offenders.push(`${v.tag} +${overflow}px :: ${who.join(' | ')}`);
      }
      console.log(`[access] ${v.tag} horizontal overflow = ${overflow}px`);
    }
    if (offenders.length) console.log('[access] OFFENDERS:\n' + offenders.join('\n'));
    expect(offenders, `overflow:\n${offenders.join('\n')}`).toEqual([]);
  } finally {
    await context.close();
  }
});
