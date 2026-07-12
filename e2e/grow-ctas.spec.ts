import { test, expect, type Page } from '@playwright/test';

/**
 * Grow strips + CTA groups (FINAL-TAB-DISPLAY-SPEC wave 2).
 *
 * Contract guarded here:
 *   1. Overview tab renders the maturity ladder (Connected → Governed →
 *      Optimized → AI-operated): 4 rungs, each resolving from skeleton to a
 *      REAL gating fact (achieved/missed) or an honest '?' with the reason —
 *      never an empty/blank rung.
 *   2. FinOps tab renders the warehouse lifecycle CTA group bound to
 *      /api/administration/warehouses: either actionable CTAs each carrying a
 *      why-line from the live list, or ONE honest gate/empty message
 *      (RBAC 403 / API absent / nothing to do) — never a fake CTA.
 *   3. Security tab renders the CTA group: orphan-grants deep-link with its
 *      why-line, and the MFA CTA either binding the real N (users without
 *      MFA) or an honest "source unavailable" state.
 *   4. Zero page scroll still holds on all three tabs; zero pageerrors; zero
 *      "Something went wrong".
 *
 * Run with:  npx playwright test e2e/grow-ctas.spec.ts --output=e2e/.tmp-w2
 * (NEVER the default output dir — it would wipe e2e/results.)
 */

const PASS = process.env.D360_PASS ?? '';
test.setTimeout(12 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.getByPlaceholder('Enter your account name').fill('uchsfvb-HAHA');
  await page.getByPlaceholder('Enter your username').fill('HAHA');
  await page.getByPlaceholder('Enter your password').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

/** document scrollHeight excess over the viewport (page-level scroller). */
async function pageScrollExcess(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    return doc - window.innerHeight;
  });
}

async function clickTab(page: Page, label: string, sectionId: string) {
  await page
    .getByRole('tab', { name: label, exact: true })
    .click({ position: { x: 24, y: 14 } });
  await expect(page).toHaveURL(new RegExp(`section=${sectionId}`), { timeout: 15_000 });
  await expect(page.locator(`#cc-panel-${sectionId}`)).toBeVisible({ timeout: 30_000 });
}

async function assertNoPageScroll(page: Page, where: string) {
  await expect
    .poll(() => pageScrollExcess(page), {
      timeout: 30_000,
      message: `zero page scroll on ${where}`,
    })
    .toBeLessThanOrEqual(8);
}

test('grow strips + CTA groups: ladder facts, FinOps lifecycle CTAs, security CTAs', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await signIn(page);
  await page.goto('/account-overview?section=overview');
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});

  // ══ 1 · Overview — maturity ladder ═══════════════════════════════════════
  const ladder = page.getByTestId('maturity-ladder');
  await expect(ladder).toBeVisible({ timeout: 120_000 });

  const RUNGS = ['connected', 'governed', 'optimized', 'ai-operated'];
  for (const id of RUNGS) {
    const rung = page.getByTestId(`ladder-rung-${id}`);
    await expect(rung, `rung ${id} renders`).toBeVisible({ timeout: 30_000 });
    // Skeleton must resolve to a REAL status (achieved/missed/unknown) —
    // the COCO insight can be a ~20s cold Cortex call, so poll generously.
    await expect
      .poll(async () => (await rung.getAttribute('data-rung-status')) ?? 'pending', {
        timeout: 180_000,
        message: `rung ${id} must resolve from skeleton to a real status`,
      })
      .toMatch(/^(achieved|missed|unknown)$/);
    // Every resolved rung carries its gating fact (or the honest '?' reason).
    const text = (await rung.innerText()).trim();
    expect(text.length, `rung ${id} must carry a gating fact, got: "${text}"`).toBeGreaterThan(15);
  }
  // Once all rungs resolved, the position badge states where the account is.
  await expect(page.getByTestId('ladder-position')).toBeVisible({ timeout: 30_000 });
  await assertNoPageScroll(page, 'overview (with ladder)');
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  // Bring the ladder into the frame's internal scroller for an honest shot
  // (block:center — scrollIntoViewIfNeeded stops at the first visible pixel,
  // which left the strip cut by the fold on the evidence screenshot).
  await ladder.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e/results/w2-maturity-ladder.png', fullPage: false });

  // ══ 2 · FinOps — warehouse lifecycle CTA group ═══════════════════════════
  await clickTab(page, 'FinOps', 'finops');
  // CostTab shows a skeleton until /cost-breakdown lands (~25s worst case).
  const finopsGroup = page.getByTestId('finops-cta-group');
  await expect(finopsGroup).toBeVisible({ timeout: 180_000 });

  // The group must resolve to exactly one honest shape: CTAs with why-lines,
  // an honest gate (403 / absent / error), or the honest "nothing to do".
  await expect
    .poll(
      async () => {
        const ctas = await finopsGroup.locator('[data-testid^="finops-cta-"]').count();
        return ctas > 0 ? 'resolved' : 'loading';
      },
      { timeout: 120_000, message: 'FinOps CTA group must resolve from skeleton' },
    )
    .toBe('resolved');

  const gate = finopsGroup.getByTestId('finops-cta-gate');
  const empty = finopsGroup.getByTestId('finops-cta-empty');
  const actionCards = finopsGroup.locator(
    '[data-testid="finops-cta-suspend"], [data-testid="finops-cta-autosuspend"], [data-testid="finops-cta-resize"]',
  );
  const nActions = await actionCards.count();
  if (nActions > 0) {
    // 2-4 max per spec; every CTA card carries a why-line bound to the live list.
    expect(nActions, 'CTA group is 2-4 max').toBeLessThanOrEqual(4);
    for (let i = 0; i < nActions; i++) {
      const card = actionCards.nth(i);
      const why = (await card.getByTestId('cta-why').innerText()).trim();
      expect(why.length, `FinOps CTA ${i} why-line must state the real gap`).toBeGreaterThan(20);
      // Why-lines must reference real list facts (state / auto_suspend / size).
      expect(why).toMatch(/STARTED|auto.?suspend|running|queries|size|X-|Small|Medium|Large|disabled/i);
      await expect(card.locator('button, span[role="status"]').first()).toBeVisible();
    }
  } else {
    // Honest degrade: a gate reason or the honest empty line must be visible.
    const gateVisible = await gate.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(
      gateVisible || emptyVisible,
      'without CTAs the group must show an honest gate/empty message',
    ).toBeTruthy();
    const msg = ((await (gateVisible ? gate : empty).innerText()) ?? '').trim();
    expect(msg.length, 'gate/empty message states the real reason').toBeGreaterThan(20);
  }
  await assertNoPageScroll(page, 'finops (with CTA group)');
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await finopsGroup.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e/results/w2-finops-ctas.png', fullPage: false });

  // ══ 3 · Security — CTA group (orphan grants + MFA N) ═════════════════════
  await clickTab(page, 'Security', 'security');
  const secGroup = page.getByTestId('security-cta-group');
  await expect(secGroup).toBeVisible({ timeout: 180_000 });

  // Orphan grants deep-link: always offered, targets the governance grants page.
  const grantsCta = secGroup.getByTestId('security-cta-grants');
  await expect(grantsCta).toBeVisible({ timeout: 30_000 });
  await expect(grantsCta.locator('a[href="/governance/grants"]')).toBeVisible();
  const grantsWhy = (await grantsCta.getByTestId('cta-why').innerText()).trim();
  expect(grantsWhy.length, 'grants CTA why-line present').toBeGreaterThan(20);

  // MFA CTA: binds the REAL N (users without MFA) or shows the honest
  // unavailable/complete state — never an invented number.
  const mfaCta = secGroup.getByTestId('security-cta-mfa');
  await expect(mfaCta).toBeVisible({ timeout: 30_000 });
  const mfaText = (await mfaCta.innerText()).trim();
  const boundN = /Require MFA for (\d+) user/.exec(mfaText);
  if (boundN) {
    const n = Number(boundN[1]);
    expect(n, 'bound N must be a positive count').toBeGreaterThan(0);
    // The why-line must carry the same N (the number is bound, not decorative).
    const mfaWhy = (await mfaCta.getByTestId('cta-why').innerText()).trim();
    expect(mfaWhy).toContain(String(n));
    await expect(mfaCta.locator('a[href="/governance/users"]')).toBeVisible();
  } else {
    expect(
      /MFA coverage complete|source unavailable/i.test(mfaText),
      `MFA CTA must be bound or honestly gated, got: "${mfaText}"`,
    ).toBeTruthy();
  }
  await assertNoPageScroll(page, 'security (with CTA group)');
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  await secGroup.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'e2e/results/w2-security-ctas.png', fullPage: false });

  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
