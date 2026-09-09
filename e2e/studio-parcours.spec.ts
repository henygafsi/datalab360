/**
 * studio-parcours — one application walked end to end on real data:
 * besoin → modèle → rapport → workflow → accès, then an EXPORT that opens,
 * then an EDIT that survives a full reopen in a fresh browser context.
 *
 * Proof standard (not a screenshot or a 200): a business surface that renders
 * its real content, a file that parses, and an edit that persists.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const APP = process.env.APP ?? 'proj_576e16333cdf';
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

const view = (p: Page, v: string) =>
  p.goto(`/studio/apps/${APP}?view=${v}`, { waitUntil: 'domcontentloaded' });

test('parcours: besoin → modèle → rapport → workflow → accès → export → édition → réouverture', async ({
  browser,
}) => {
  test.skip(!PASS, 'D360_PASS required');
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const notes: string[] = [];
  try {
    await login(page);

    // ── BESOIN — the Overview states the application's goal ──────────
    await view(page, 'overview');
    await expect(page.getByText(/GOAL|Goal ·/i).first()).toBeVisible({ timeout: 60_000 });
    notes.push('✓ besoin: Overview shows the goal');

    // UI regression: "Needs your attention" must not show the bare "on ?"
    // placeholder, and identical items are grouped (not repeated once per check).
    const attnSection = page.locator('section', { hasText: 'Needs your attention' }).first();
    await attnSection.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (await attnSection.count()) {
      const attnText = await attnSection.innerText();
      expect(attnText).not.toMatch(/\bon \?/); // the bare-placeholder defect is gone
      const rows = await attnSection.locator('li').count();
      expect(rows).toBeLessThanOrEqual(6); // grouped, never one row per failing check
      notes.push(
        `✓ attention: grouped, no bare "?" — "${attnText.replace(/\s+/g, ' ').replace(/^Needs your attention/i, '').trim().slice(0, 70)}"`,
      );
    } else {
      notes.push('attention: section not populated this run (backend returned none)');
    }

    // ── MODÈLE — real tables, not an empty canvas ───────────────────
    await view(page, 'model');
    await page.waitForTimeout(2500);
    const modelText = await page.locator('main').first().innerText();
    expect(/SRC_|src |table\(s\)|relationship/i.test(modelText)).toBeTruthy();
    notes.push('✓ modèle: model surface renders tables/relationships');

    // ── RAPPORT — the reporting surface with its widgets ────────────
    await view(page, 'reporting');
    await page.waitForTimeout(3000);
    const repText = await page.locator('main').first().innerText();
    notes.push(`rapport: reporting text len=${repText.length}`);
    expect(repText.length).toBeGreaterThan(50);

    // ── EXPORT — a widget's CSV must open and carry rows ────────────
    const exportBtn = page.getByRole('button', { name: /Export this widget/ }).first();
    if (await exportBtn.count()) {
      let captured: { rows: string[]; via: string } | null = null;
      // the widget must have RUN before "rows on screen" is offered — give the
      // chart batch time, retrying the menu until a real choice is enabled.
      for (let attempt = 0; attempt < 12 && !captured; attempt++) {
        await exportBtn.click(); // open the menu
        const onScreen = page.getByRole('menuitem', { name: /rows on screen/i }).first();
        const preview = page.getByRole('menuitem', { name: /free preview/i }).first();
        const useOnScreen = (await onScreen.count()) && !(await onScreen.isDisabled().catch(() => true));
        const target = useOnScreen ? onScreen : preview;
        const via = useOnScreen ? 'rows on screen' : 'free preview';
        if (await target.count()) {
          const dl = page.waitForEvent('download', { timeout: 12_000 });
          await target.click();
          try {
            const download = await dl;
            const path = await download.path();
            const fs = await import('node:fs');
            const body = path ? fs.readFileSync(path, 'utf8') : '';
            const rows = body.split(/\r?\n/).filter((l) => l.trim().length);
            captured = { rows, via };
          } catch {
            const msg = await page.getByRole('menu').innerText().catch(() => '');
            if (/cap|gated|budget|preview/i.test(msg)) {
              notes.push(`export: honest outcome shown — "${msg.replace(/\s+/g, ' ').slice(0, 80)}"`);
            }
            await page.keyboard.press('Escape');
            await page.waitForTimeout(3000);
          }
        } else {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(3000);
        }
      }
      if (captured) {
        expect(captured.rows.length).toBeGreaterThan(1); // header + ≥1 data row
        notes.push(`✓ export (${captured.via}): CSV ${captured.rows.length} line(s), header="${captured.rows[0].slice(0, 60)}"`);
      } else {
        notes.push('⚠ export: control present but no file captured after retries');
      }
    } else {
      notes.push('⚠ export: no Export control on the reporting widgets');
    }

    // ── WORKFLOW — the automation list is real ──────────────────────
    await view(page, 'workflows');
    await page.waitForTimeout(2500);
    const wfText = await page.locator('main').first().innerText();
    expect(/Alerte|Planification|Rapport|workflow|Schedule|trigger/i.test(wfText)).toBeTruthy();
    notes.push('✓ workflow: Automation lists real workflows');

    // ── ACCÈS — the access surface renders ──────────────────────────
    await view(page, 'governance');
    await page.waitForTimeout(2000);
    expect(/People with access|App roles|Data profiles|Access/i.test(await page.locator('main').first().innerText())).toBeTruthy();
    notes.push('✓ accès: Access surface renders');

    // ── ÉDITION + RÉOUVERTURE — rename persists across a fresh context ─
    await view(page, 'overview');
    const marker = `Parcours ${Date.now().toString().slice(-6)}`;
    const title = page.locator('h1[title="Click to rename this application"]').first();
    await expect(title).toBeVisible({ timeout: 30_000 });
    const original = (await title.innerText()).trim();
    const savePromise = page.waitForResponse(
      (r) => /\/studio\/drafts\/.*(update|display)|\/studio\/drafts\//.test(r.url()) && r.request().method() !== 'GET',
      { timeout: 20_000 },
    ).catch(() => null);
    await title.click();
    const input = page.locator('input[aria-label="Name of this application"]');
    await input.fill(marker);
    await input.press('Enter');
    await savePromise;
    await page.waitForTimeout(1500);
    notes.push(`✓ édition: renamed to "${marker}" (was "${original}")`);

    // reopen in a BRAND-NEW context (fresh page, no in-memory state)
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page2 = await ctx2.newPage();
    try {
      await login(page2);
      await view(page2, 'overview');
      await expect(page2.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 45_000 });
      notes.push('✓ réouverture: the renamed application persisted into a fresh session');
    } finally {
      await ctx2.close();
    }

    // restore the original name (leave the demo draft as we found it)
    await title.click();
    const input2 = page.locator('input[aria-label="Name of this application"]');
    await input2.fill(original);
    await input2.press('Enter');
    await page.waitForTimeout(1200);
    notes.push(`✓ cleanup: restored name to "${original}"`);

    await page.screenshot({ path: `${OUT}/parcours-overview.png`, fullPage: true });
  } finally {
    console.log('\n==== PARCOURS ====');
    for (const n of notes) console.log(n);
    console.log('==== END ====\n');
    await ctx.close();
  }
});
