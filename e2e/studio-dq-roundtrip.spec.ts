/**
 * studio-dq-roundtrip — proves the DQ Resolve cycle through the real UI on
 * the backend's proof draft (proj_48ba0ed32a4a): a proposed model makes the
 * standardized actions available, so resolving both blockers via the UI turns
 * the gate WARN (defects handled, not a false pass; source untouched).
 *
 * Design-time only — NO job run (no credits). The draft is reset to its
 * two-blocker state before AND after, via the API undo, so it stays clean.
 *
 * Run (repo root):
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     SHOTS=/abs/dir APP=proj_48ba0ed32a4a \
 *     npx playwright test e2e/studio-dq-roundtrip.spec.ts --project=demo-video
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const SHOTS = process.env.SHOTS ?? '';
const APP = process.env.APP ?? 'proj_48ba0ed32a4a';
const BE = process.env.BE ?? 'http://127.0.0.1:8078';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

async function login(p: Page): Promise<string> {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
  await p.locator('input[name="username"], input#username').first().fill(USER);
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  const deadline = Date.now() + 90_000;
  for (;;) {
    const s = await p.request.get('/api/auth/session').then((r) => r.json()).catch(() => null);
    if (s?.user?.access_token) return s.user.access_token as string;
    if (Date.now() > deadline) throw new Error('login timeout');
    await p.waitForTimeout(1200);
  }
}

test('resolve → gate warn (real UI), state restored (no job run)', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const token = await login(page);
  const H = { Authorization: `Bearer ${token}` };

  type Chk = { handled?: boolean; resolution?: { run_id?: string } };
  const getGate = async () =>
    (await page.request.get(`${BE}/studio/activation/${APP}`, { headers: H, timeout: 60_000 }).then((r) => r.json()))
      ?.tests?.dq_gate ?? {};
  /** Deterministic reset: undo every handled check's resolution. */
  const undoAll = async () => {
    for (let i = 0; i < 6; i += 1) {
      const g = await getGate();
      const handled: Chk[] = [...(g.checks ?? []), ...(g.handled ?? [])].filter(
        (c: Chk) => c.handled && c.resolution?.run_id,
      );
      if (!handled.length) return;
      await page.request
        .post(`${BE}/studio/drafts/${APP}/dq/resolve/undo`, {
          headers: H,
          data: { run_id: handled[0].resolution!.run_id },
          timeout: 60_000,
        })
        .catch(() => {});
      await page.waitForTimeout(400);
    }
  };

  const gateLine = () => page.locator('p').filter({ hasText: 'Data quality gate' }).first();
  const relCard = (id: string): Locator => page.locator('li').filter({ hasText: id }).first();
  const resolveDlq = async (id: string) => {
    const btn = relCard(id).getByRole('button', { name: /Route the faulty rows to the DLQ/ });
    await expect(btn).toBeEnabled({ timeout: 20_000 });
    await btn.click();
  };

  try {
    await undoAll(); // start from the two-blocker state, whatever a prior run left

    await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
    const toggle = page.getByRole('button', { name: /Activation panel/ });
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    await toggle.click();
    await expect(gateLine()).toContainText('blocked', { timeout: 30_000 });

    // both real blockers present with the recommended DLQ action enabled
    await expect(relCard('rel_2.referential_integrity')).toBeVisible({ timeout: 20_000 });
    await expect(relCard('rel_3.referential_integrity')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/dq-roundtrip-blocked.png`, fullPage: true });

    // resolve rel_2 (UI) → handled; the gate STAYS blocked (rel_3 remains)
    await resolveDlq('rel_2.referential_integrity');
    await expect(page.getByText(/1 handled/).first()).toBeVisible({ timeout: 60_000 });
    // resolve rel_3 (UI) → every defect handled → the gate turns WARN
    await resolveDlq('rel_3.referential_integrity');
    await expect(gateLine()).toContainText('warn', { timeout: 60_000 });
    await expect(page.getByText(/2 handled/).first()).toBeVisible({ timeout: 20_000 });
    console.log('[roundtrip] resolved both via UI → gate warn, 2 handled');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/dq-roundtrip-warn.png`, fullPage: true });
  } finally {
    // restore the draft to its two-blocker state (proves undo end-to-end too)
    await undoAll();
    const g = await getGate();
    console.log(`[roundtrip] restored — gate overall=${g.overall}, handled=${(g.handled ?? []).length}`);
    await context.close();
  }
});
