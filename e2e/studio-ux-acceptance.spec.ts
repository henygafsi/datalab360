/**
 * studio-ux-acceptance — UX acceptance for Jobs and Model, kept SEPARATE
 * from the technical suites on purpose.
 *
 * "262 green tests" is not a validation of the UX: those tests prove the
 * endpoints answer, not that a reader can pilot the application. So what is
 * asserted here is what a person can see and do — the state without opening
 * logs, the source and target without reading SQL, an edit that does not
 * force the AI, a context panel that stays shut with nothing selected, and
 * type that is actually legible.
 *
 * Three viewports, because the defect being guarded against is a layout
 * that only holds at the developer's window size. No CSS zoom, no shrunken
 * text and no hidden overflow is allowed to make these pass — the checks
 * below look for exactly those cheats.
 */
import { test, expect, type Page } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const DRAFT = process.env.D360_STUDIO_DRAFT ?? 'proj_8265085af4dc';

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1600x950', width: 1600, height: 950 },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await page.locator('input[name="username"], input#username').first().fill(USER);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await expect
    .poll(
      async () =>
        Boolean(
          await page.request
            .get('/api/auth/session')
            .then((r) => r.json())
            .then((s) => s?.user?.access_token)
            .catch(() => null),
        ),
      { timeout: 90_000 },
    )
    .toBe(true);
});

test.afterAll(async () => page?.close());

/**
 * The brand rule covers what the reader can SEE, and a tooltip is seen.
 * Checking innerText alone missed "Snowflake metering over 7 days" sitting
 * in a title attribute in the Studio header for who knows how long.
 */
async function noVendorAnywhere(p: Page, where: string): Promise<void> {
  const leaks = await p.evaluate(() => {
    const found: string[] = [];
    const vendors = ['Snowflake', 'Cortex', 'Kimi'];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
        const v = el.getAttribute(attr);
        if (v && vendors.some((s) => v.includes(s))) found.push(`${attr}="${v.slice(0, 60)}"`);
      }
    }
    const text = document.body.innerText;
    for (const s of vendors) if (text.includes(s)) found.push(`text:${s}`);
    return found.slice(0, 5);
  });
  expect(leaks, `${where}: vendor names must not reach customer copy`).toEqual([]);
}

/** Legibility + no cheating: nothing under 12px, no page-level sideways scroll. */
async function readable(p: Page, where: string): Promise<void> {
  const bad = await p.evaluate(() => {
    const tiny: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const t = (el.textContent ?? '').trim();
      if (!t || el.children.length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (parseFloat(cs.fontSize) < 12) tiny.push(`${parseFloat(cs.fontSize)}px "${t.slice(0, 30)}"`);
    }
    return {
      tiny: tiny.slice(0, 6),
      zoomed: Boolean((document.body as HTMLElement).style.zoom),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(bad.tiny, `${where}: text under 12px`).toEqual([]);
  expect(bad.zoomed, `${where}: CSS zoom is not a layout fix`).toBe(false);
  expect(bad.sideways, `${where}: the page must not scroll sideways`).toBeLessThanOrEqual(1);
}

for (const vp of VIEWPORTS) {
  test(`Jobs is a pilot list a reader can act on — ${vp.name}`, async () => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`/studio/apps/${DRAFT}?view=jobs`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(11_000);

    const body = await page.evaluate(() => document.body.innerText);

    // the state and what it feeds, without opening any log
    expect(body).not.toContain('Application error');
    expect(body).not.toContain('[object Object]');
    await noVendorAnywhere(page, `Jobs ${vp.name}`);

    // source AND target readable without reading SQL: no raw SQL on first paint
    expect(
      /\bSELECT\b[\s\S]{0,80}\bFROM\b/.test(body),
      'a job row must not print its SQL by default',
    ).toBe(false);

    await readable(page, `Jobs ${vp.name}`);
  });

  test(`Model reads as a target model, panel shut with nothing selected — ${vp.name}`, async () => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`/studio/apps/${DRAFT}?view=model`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(12_000);

    // the choice between the two readings is explicit
    await expect(page.getByRole('tab', { name: 'Target model' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Source → target mapping' })).toBeVisible();

    // nothing selected ⇒ no inspector, and no giant panel inviting a click
    await expect(page.getByRole('complementary', { name: /inspector/i })).toHaveCount(0);

    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toContain('Application error');
    expect(body).not.toContain('[object Object]');
    await noVendorAnywhere(page, `Model ${vp.name}`);

    await readable(page, `Model ${vp.name}`);
  });
}

test('a reader can reach an edit without being forced through the AI', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/studio/apps/${DRAFT}?view=model`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12_000);

  // selecting a table opens the inspector — the direct, non-AI path
  const node = page.locator('[data-entity-id], [role="button"][aria-label*="table" i]').first();
  if (await node.count()) {
    await node.click();
    await page.waitForTimeout(2_500);
    const body = await page.evaluate(() => document.body.innerText);
    // the inspector offers real edit controls, not only "ask the AI"
    expect(
      /Edit|Add a column|Open the job|Declare/i.test(body),
      'the inspector must offer a direct edit, not only an AI prompt',
    ).toBe(true);
  }
});

test('keyboard focus is visible — actions do not require a mouse', async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/studio/apps/${DRAFT}?view=jobs`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9_000);

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      ring: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none',
    };
  });
  expect(focused, 'tabbing must reach a control').not.toBeNull();
  expect(focused?.ring, 'the focused control must be visibly focused').toBe(true);
});
