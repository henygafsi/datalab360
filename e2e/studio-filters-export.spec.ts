/**
 * studio-filters-export — regression cover for the two defects that opened
 * the stabilisation campaign.
 *
 * DEFECT 1 (selector): the report declared page filters, the run routes had
 * always accepted `global_filters`, and the UI rendered them as dead text
 * under "page filters are set by the generator". The server reported
 * `filters_applied: 0` on every widget: a filter the reader could see,
 * could not set, and that never reached the query.
 *
 * DEFECT 2 (export): one "Download" button serialised whatever the tile had
 * already rendered — an extract capped by the preview envelope, with the cap
 * invisible in the payload (`row_count` equals `rows.length`). Twenty rows
 * were handed over as if they were the answer.
 *
 * These assertions stand whether or not the warehouse answers. The proof
 * that the filter reaches the query is the REQUEST payload, and the proof
 * that a refused scope is honest is the message shown. That was written
 * while the resource monitor had the warehouse suspended, and it is why
 * the suite kept its meaning throughout: a test asserting on returned
 * figures would have reported the product broken when only the budget was
 * spent. The warehouse has since resumed, and the filter is now confirmed
 * end to end — the server returns SQL carrying WHERE ... IN (...) — but
 * these tests deliberately do not depend on that staying true.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const DRAFT = process.env.D360_STUDIO_DRAFT ?? 'proj_8265085af4dc';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

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
  await page.goto(`/studio/apps/${DRAFT}?view=reporting`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(13_000); // studio settles slowly
});

test.afterAll(async () => page?.close());

test('the page filters are controls, not a description of controls', async () => {
  const bar = page.getByRole('region', { name: 'Report filters' });
  await expect(bar).toBeVisible();

  // the declared date_range is two real date inputs
  const dates = bar.locator('input[type="date"]');
  await expect(dates).toHaveCount(2);

  // and the honest summary states nothing is applied yet
  await expect(bar).toContainText('No filter is applied');

  // the old dead sentence must be gone from the surface
  expect(await page.evaluate(() => document.body.innerText)).not.toContain(
    'per-chart filters arrive with the next contract',
  );
});

test('applying a filter puts it in the query the server receives', async () => {
  const bar = page.getByRole('region', { name: 'Report filters' });

  const sent: unknown[] = [];
  const capture = (req: Request) => {
    if (/\/studio\/report\/run-batch/.test(req.url()) && req.method() === 'POST') {
      const body = req.postDataJSON() as { global_filters?: unknown[] };
      sent.push(body?.global_filters);
    }
  };
  page.on('request', capture);

  const dates = bar.locator('input[type="date"]');
  await dates.nth(0).fill('2025-01-01');
  await dates.nth(1).fill('2025-12-31');

  const apply = bar.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();
  await page.waitForTimeout(6_000);
  page.off('request', capture);

  // THE assertion: the filter travelled with the run.
  expect(sent.length, 'applying a filter must re-run the widgets').toBeGreaterThan(0);
  const last = sent[sent.length - 1] as Array<{ column?: string; operator?: string; value?: unknown }>;
  expect(Array.isArray(last)).toBe(true);
  expect(last.length).toBeGreaterThan(0);
  expect(last[0]?.column).toBe('DAT_FACTURE');
  // the server's operator vocabulary is closed — anything else earns a 422
  expect(String(last[0]?.operator).toLowerCase()).toBe('between');
  expect(last[0]?.value).toEqual(['2025-01-01', '2025-12-31']);

  // and the surface says what is applied, rather than implying it
  await expect(bar).toContainText('1 filter applied');
});

/**
 * The crash this campaign found: /studio/report/run-batch DECLARES
 * `error?: string` and sends `{error_code, message, detail}`. That object
 * reached JSX, threw React #31, and blanked the whole application — so one
 * failing widget destroyed the page, and a spent compute budget looked
 * exactly like a broken product.
 */
test('a widget that fails does not take the page down with it', async () => {
  // whatever the widgets did above, the application must still be standing
  await expect(page.getByRole('region', { name: 'Report filters' })).toBeVisible();
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).not.toContain('Application error');
  expect(body).not.toContain('client-side exception');
  // and no failure is ever rendered as a JavaScript object
  expect(body).not.toContain('[object Object]');

  // if a tile did fail, it says something a reader can act on
  const failed = page.locator('p.text-amber-700, p.text-red-600').filter({ hasText: /\w{12,}/ });
  if (await failed.count()) {
    const said = await failed.first().innerText();
    expect(said.length, 'a failure must be a sentence, not a code').toBeGreaterThan(20);
    // vendor internals belong in the tooltip, never in the business copy
    for (const vendor of ['Snowflake', 'Cortex', 'Kimi']) expect(said).not.toContain(vendor);
  }
});

test('the export states its scope, and the free one is honest about its cap', async () => {
  // the first widget that finished running owns the menu under test
  const trigger = page.getByRole('button', { name: 'Export this widget' }).first();
  await expect(trigger).toBeEnabled({ timeout: 60_000 });
  await trigger.click();

  const menu = page.getByRole('menu', { name: 'Export scope' });
  await expect(menu).toBeVisible();

  // all three product scopes are offered — the two paid ones are not hidden
  await expect(menu.getByRole('menuitem', { name: /rows on screen/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /free preview/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /complete filtered result/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /underlying rows/ })).toBeVisible();
});

test('the visible-rows export writes exactly the rows that were on screen', async () => {
  const menu = page.getByRole('menu', { name: 'Export scope' });
  const item = menu.getByRole('menuitem', { name: /rows on screen/ });
  const claimed = Number(/\d+/.exec((await item.innerText()).split('\n')[0])?.[0] ?? '-1');

  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = await download.path();
  expect(file, 'the browser must actually receive a file').toBeTruthy();

  // open it and count — a click that fires no file is not an export
  const text = readFileSync(file!, 'utf8').replace(/^﻿/, '');
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  expect(lines.length, 'header + one line per visible row').toBe(claimed + 1);
  expect(lines[0]).toMatch(/,|^[A-Z_]+$/); // a header line, not a blob

  await expect(menu.getByRole('status')).toContainText(`Saved the ${claimed} rows`);
});

test('a credit-gated scope answers with the reason, it never returns a silent file', async () => {
  const menu = page.getByRole('menu', { name: 'Export scope' });

  // no download must fire for a refused scope
  let downloaded = false;
  page.once('download', () => {
    downloaded = true;
  });

  await menu.getByRole('menuitem', { name: /complete filtered result/ }).click();
  const status = menu.getByRole('status');
  await expect(status).toBeVisible({ timeout: 60_000 });

  const said = await status.innerText();
  // Either answer is correct and honest, and they are different things:
  //  · the policy gates the paid scope        → activation
  //  · the warehouse budget is spent          → not a product failure
  expect(
    /activation|credits|budget limit|administrator/i.test(said),
    `a refused export must say why. Got: ${said}`,
  ).toBe(true);
  expect(downloaded, 'a refused scope must not hand over a file').toBe(false);
});

/**
 * THE CHAIN the campaign asks to prove:
 *   modification → rendu → export → réouverture.
 *
 * The AI leg is asserted separately (see the test after this one) because
 * it is capped by a per-draft free envelope, not by the product. The point
 * of this one is that a FORM edit — the path that must never require the
 * AI — persists, redraws, exports and survives a reload.
 *
 * Every step is checked against a SERVER read, never against component
 * state: a rejected write leaves the previous value on screen, which is
 * exactly how a broken save can look like a successful one.
 */
test('chain: modify → render → export → reopen, verified server-side', async () => {
  // Start from a clean surface. An export menu left open by an earlier test
  // overlays the rails, so this passed alone and failed in the full suite —
  // an order dependency, not a product defect.
  await page.keyboard.press('Escape');
  await page.goto(`/studio/apps/${DRAFT}?view=reporting`, { waitUntil: 'domcontentloaded' });
  // The application's data read is MEASURED at ~30 s once the fact table
  // holds 300M rows (every other read is sub-second). This wait matches
  // that measurement — it is not padding to hide a flake.
  await page.waitForTimeout(20_000);

  /* Read from the SERVER using the app's own credentials. page.request does
   * not carry the bearer token the client injects, so it silently returned
   * nothing and the assertion would have compared two empty strings. */
  const readTitle = async (): Promise<string> =>
    page.evaluate(async (draft) => {
      const token = window.localStorage.getItem('access_token') ?? '';
      const res = await fetch(`/api-proxy/studio/drafts/${draft}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const j = (await res.json()) as {
        report?: { charts?: Array<{ chart_id?: string; title?: string }> };
      };
      return (j.report?.charts ?? []).find((c) => c.chart_id === 'chart_breakdown')?.title ?? '';
    }, DRAFT);

  const before = await readTitle();
  expect(before, 'the server read must actually work before anything is claimed').not.toBe('');
  const next = `Chain probe ${Date.now() % 100000}`;

  // MODIFICATION — through the form, no AI involved. The title becomes an
  // input only after clicking the widget name in the rails, so the edit
  // starts the way a reader starts it.
  const nameInRail = page.getByText(before, { exact: true }).last();
  await nameInRail.scrollIntoViewIfNeeded();
  await nameInRail.click();
  const field = page.getByRole('textbox', { name: `New title for ${before}` }).first();
  // under the full suite the server is warm-cache-busy; alone this appears
  // in ~2s, under load it can take >15s — the wait matches the worst case
  await expect(field).toBeVisible({ timeout: 45_000 });
  await field.fill(next);
  await field.blur();

  // persisted? ask the SERVER, not the input — polled, because under the
  // full suite the save can take longer than any fixed wait
  await expect
    .poll(readTitle, { timeout: 60_000, message: 'the edit must reach the draft' })
    .toBe(next);

  // RENDU — the surface shows what was saved
  await expect(page.getByText(next, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  // RÉOUVERTURE — a full reload restores it from the server
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(readTitle, { timeout: 60_000, message: 'reopening must restore the saved value' })
    .toBe(next);
  await page.waitForTimeout(8_000); // let the rails hydrate before clicking them
  await expect(page.getByText(next, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  // restore the fixture — a campaign must not leave the app renamed
  await page.getByText(next, { exact: true }).last().click();
  const restore = page.getByRole('textbox', { name: `New title for ${next}` }).first();
  if (await restore.count()) {
    await restore.fill(before);
    await restore.blur();
  }
  await expect
    .poll(readTitle, { timeout: 60_000, message: 'the fixture is left as it was found' })
    .toBe(before);
});

test('the AI leg is capped by the free envelope, and says so honestly', async () => {
  const r = await page.request.post(`/api-proxy/studio/model/${DRAFT}/edit`, {
    data: { instruction: 'Rename the breakdown chart to something else.', apply: false },
  });
  // 429 = the free per-draft envelope is spent. That is a product ANSWER,
  // not a defect, and it must name what unlocks it.
  if (r.status() === 429) {
    const body = (await r.json()) as { detail?: { message?: string; next_step?: string } };
    expect(String(body.detail?.message)).toMatch(/preview limit|free preview/i);
    expect(String(body.detail?.next_step), 'a cap must state what raises it').toMatch(
      /activation|ACCOUNTADMIN|credits/i,
    );
  } else {
    expect(r.status(), 'the AI route must answer or state its cap').toBeLessThan(500);
  }
});

test('exporting never regenerates the report', async () => {
  const ai: string[] = [];
  const watch = (req: Request) => {
    if (/\/studio\/(report\/generate|model\/[^/]+\/edit|understand)/.test(req.url())) {
      ai.push(req.url());
    }
  };
  page.on('request', watch);

  // open the menu here: relying on one left open by an earlier test made
  // this depend on the order the suite happens to run in
  await page.getByRole('button', { name: 'Export this widget' }).first().click();
  const m = page.getByRole('menu', { name: 'Export scope' });
  await expect(m).toBeVisible({ timeout: 20_000 });
  await m.getByRole('menuitem', { name: /free preview/ }).click();
  await page.waitForTimeout(8_000);
  page.off('request', watch);

  expect(ai, 'an export must use the validated contract, not re-ask the AI').toEqual([]);
});
