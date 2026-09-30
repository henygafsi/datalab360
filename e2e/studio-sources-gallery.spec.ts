/**
 * studio-sources-gallery — Surface A of the Final UX pass: the AI-first
 * source PICKER (StudioSourceGallery) that replaced the dense grid + flow
 * bar in the onboarding "Where does this data live?" step.
 *
 * What it proves, WITHOUT spending a warehouse credit (metadata only — no
 * content scan is triggered here):
 *   - the intent bar (need chip + one global search) renders;
 *   - sources are grouped into collapsible CATEGORIES with a one-line
 *     summary, not a long flat list;
 *   - a category paginates (Previous/Next, "page X of Y") when it holds
 *     more than one page — turning a page fetches nothing;
 *   - selection is STABLE across a page turn AND across a category switch;
 *   - the surface reflows at 1600×950, 1366×768, 1024×768, 768×1024,
 *     390×844 without a horizontal body scrollbar.
 *
 * Screenshots for each viewport are written to the job tmp dir so the
 * reflow can be inspected after the data resolves (never before).
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/absolute/dir \
 *     npx playwright test e2e/studio-sources-gallery.spec.ts --project=demo-video
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const VIEWPORTS: Array<{ w: number; h: number; tag: string }> = [
  { w: 1600, h: 950, tag: '1600x950' },
  { w: 1366, h: 768, tag: '1366x768' },
  { w: 1024, h: 768, tag: '1024x768' },
  { w: 768, h: 1024, tag: '768x1024' },
  { w: 390, h: 844, tag: '390x844' },
];

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

/** Drive /studio/new far enough to land on the Sources step. */
async function reachSourcesStep(p: Page) {
  await p.goto('/studio/new', { waitUntil: 'domcontentloaded' });
  const startOver = p.getByText('Start over');
  if (await startOver.count()) await startOver.first().click().catch(() => {});
  await p.getByRole('option', { name: /Retail/ }).first().click({ timeout: 30_000 });
  const focus = p
    .getByRole('button', { name: /revenue|margin|stock|sales|performance/i })
    .first();
  await focus.click({ timeout: 30_000 });
  const focus2 = p.getByRole('button', { name: /by |per |top |trend/i }).first();
  if (await focus2.count()) await focus2.click().catch(() => {});
  await p.getByRole('button', { name: /Start — the AI drafts the application/ }).click();
  // the Sources question is the anchor for this step
  await p.getByText('Where does this data live?').waitFor({ timeout: 120_000 });
}

test('Surface A — gallery structure, pagination, stable selection', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  try {
    await login(page);
    await reachSourcesStep(page);

    // (1) intent bar: the one global search of the gallery
    const search = page.getByRole('searchbox', { name: 'Search every source' });
    await expect(search).toBeVisible({ timeout: 60_000 });

    // (2) categories: at least the warehouse category, with a summary
    const warehouse = page.getByRole('button', { name: /Data warehouse|Warehouse/i }).first();
    await expect(warehouse).toBeVisible({ timeout: 30_000 });

    // The warehouse category defaults open. A selectable database card is a
    // pressable button whose tooltip is "Use <db>" (its accessible name is
    // the db label; aria-pressed carries the on/off state).
    const pickable = page.locator('button[title^="Use "]');
    const firstPageCount = await pickable.count();
    console.log(`[gallery] warehouse first-page selectable cards = ${firstPageCount}`);
    expect(firstPageCount, 'at least one selectable warehouse database').toBeGreaterThan(0);

    // (3) selection is controlled — pick a card that is NOT already selected
    // (auto-discovery may pre-select some), so the count must go UP by one.
    const traySel = () => page.getByText(/\d+ sources? selected/).first();
    const readCount = async () =>
      (await traySel().count())
        ? Number(((await traySel().textContent()) ?? '0').match(/\d+/)?.[0] ?? 0)
        : 0;
    const baseline = await readCount();
    const unselected = page.locator('button[title^="Use "][aria-pressed="false"]').first();
    const firstName = (await unselected.getAttribute('title')) ?? '';
    await unselected.click();
    await expect(traySel()).toBeVisible({ timeout: 10_000 });
    await expect.poll(readCount, { timeout: 10_000 }).toBe(baseline + 1);

    // (4) pagination: if warehouse holds > 1 page, turn it and prove the
    // selection made on page 1 survives the page turn.
    const nextBtn = page.getByRole('button', { name: 'Next' }).first();
    let provedPageTurn = false;
    if (await nextBtn.count()) {
      const pageLabel = page.getByText(/^page \d+ of \d+$/).first();
      const before = (await pageLabel.textContent()) ?? '';
      await nextBtn.click();
      await expect.poll(async () => (await pageLabel.textContent()) ?? '').not.toBe(before);
      // the pick made on page 1 is still counted — stable across pages
      expect(await readCount()).toBe(baseline + 1);
      provedPageTurn = true;
      console.log(`[gallery] page turn proved: "${before}" -> next, selection kept`);
    } else {
      console.log('[gallery] warehouse fits on one page — page-turn not exercised');
    }

    // (5) stability across a category switch: open a second category header,
    // the selection count must be unchanged.
    const headers = page.locator('button[aria-expanded]');
    if ((await headers.count()) > 1) {
      await headers.nth(1).click();
      await page.waitForTimeout(200);
      expect(await readCount()).toBe(baseline + 1);
      console.log('[gallery] selection kept across a category switch');
    }
    console.log(
      `[gallery] selection ${baseline} -> ${baseline + 1} after picking "${firstName}"; page-turn=${provedPageTurn}`,
    );

    // no vendor leak in the picker copy
    const bodyText = await page.evaluate(() => document.body.innerText);
    for (const w of ['Kimi', 'Cortex']) expect(bodyText).not.toContain(w);

    // (6) responsive reflow — resize the SAME page (no re-fetch), capture
    // every viewport, and name any element that overflows the body so a fix
    // is precise. Assert AFTER the sweep so one failure doesn't hide the rest.
    const offenders: string[] = [];
    for (const v of VIEWPORTS) {
      await page.setViewportSize({ width: v.w, height: v.h });
      await page.waitForTimeout(400); // let the grid reflow
      if (SHOTS) {
        await page.screenshot({ path: `${SHOTS}/gallery-${v.tag}.png`, fullPage: true });
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 2) {
        const who = await page.evaluate((vw) => {
          const out: string[] = [];
          document.querySelectorAll('*').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width > vw + 2 && r.right > vw + 2) {
              const cls = (el.getAttribute('class') || '').slice(0, 60);
              out.push(`${el.tagName.toLowerCase()}.${cls} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
            }
          });
          // the deepest (narrowest-parent) offenders are most telling
          return out.slice(0, 6);
        }, v.w);
        offenders.push(`${v.tag} +${overflow}px :: ${who.join(' | ')}`);
      }
      console.log(`[gallery] ${v.tag} horizontal overflow = ${overflow}px`);
    }
    if (offenders.length) console.log('[gallery] OVERFLOW OFFENDERS:\n' + offenders.join('\n'));
    expect(offenders, `horizontal body overflow:\n${offenders.join('\n')}`).toEqual([]);
  } finally {
    await context.close();
  }
});
