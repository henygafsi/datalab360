import { test, expect, type Page } from '@playwright/test';

/**
 * Shell redesign gate — "no one page and lifetime scroll" (user directive
 * 2026-07-10). Three former scroll offenders must now fit ONE viewport each,
 * with inner regions scrolling instead of the document:
 *
 *   - /deploy-app            → tabbed (Build / Deployments & approvals)
 *   - /workflow              → builder shell strictly viewport-fit (canvas
 *                              pans internally; NOT re-tabbed — it's a canvas app)
 *   - /workflow/dev-tools    → existing tabs kept, now ?tab=-synced and
 *                              viewport-fit
 *
 * For every route (and after every tab switch): document.scrollHeight must
 * not exceed the viewport (+ small epsilon), no error boundary, no pageerrors.
 */

const PASS = process.env.D360_PASS ?? '';
// Allowance for sub-pixel rounding and the layout's settle animation.
const EPSILON = 8;

test.setTimeout(15 * 60_000);

async function signIn(page: Page) {
  // Up to 3 attempts: the shared dev stack is exercised by several harnesses
  // at once and the auth round-trip occasionally exceeds one attempt's budget.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('/signin');
      await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
      await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
      await page.locator('input[type="password"]').first().fill(PASS);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Known-foreign pageerror: app/shared/command-center/index.tsx is being
 * reworked by a CONCURRENT agent (uncommitted working-tree edit) and currently
 * references LayoutGroup without importing it. It is outside this task's
 * allowed file set (deploy-app / workflow shell / dev-tools), so it is
 * excluded here — every OTHER pageerror still fails the gate. Remove this
 * filter once command-center lands.
 */
function realErrors(errs: string[]): string[] {
  return errs.filter((e) => !e.includes('LayoutGroup is not defined'));
}

function collectPageErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  return errs;
}

async function assertNoPageScroll(page: Page, label: string) {
  // Poll first: late-mounting content may briefly grow the document while
  // data streams in; the SETTLED document must fit the viewport. The numeric
  // asserts below produce the precise failure numbers if it never settles.
  await expect
    .poll(
      () =>
        page.evaluate(
          (eps) =>
            document.documentElement.scrollHeight - window.innerHeight <= eps &&
            document.documentElement.scrollWidth - window.innerWidth <= eps,
          EPSILON,
        ),
      { timeout: 30_000 },
    )
    .toBe(true)
    .catch(() => {});
  const m = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  expect(m.scrollHeight, `${label}: vertical page scroll (${m.scrollHeight} > ${m.innerHeight}+${EPSILON})`).toBeLessThanOrEqual(m.innerHeight + EPSILON);
  expect(m.scrollWidth, `${label}: horizontal page scroll (${m.scrollWidth} > ${m.innerWidth}+${EPSILON})`).toBeLessThanOrEqual(m.innerWidth + EPSILON);
}

async function assertNoErrorBoundary(page: Page, label: string) {
  await expect(
    page.getByText('Something went wrong', { exact: true }),
    `${label}: error boundary tripped`,
  ).toHaveCount(0);
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000); // layout entrance animation + late mounts
}

test('deploy-app: tabbed shell fits one viewport, tabs preserve all zones', async ({ page }) => {
  const errs = collectPageErrors(page);
  await signIn(page);

  await page.goto('/deploy-app');
  await settle(page);

  // Build tab (default): hero + kind tiles + drafts all present.
  await expect(page.getByRole('heading', { name: 'Deploy App' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tab', { name: 'Build' })).toBeVisible();
  await expect(page.getByText('Pick a starting point')).toBeVisible();
  await expect(page.getByText('Streamlit Dashboard')).toBeVisible();
  await expect(page.getByText('Recent drafts')).toBeVisible();
  await assertNoPageScroll(page, 'deploy-app (Build)');
  await assertNoErrorBoundary(page, 'deploy-app (Build)');

  // Deployments tab: URL syncs via history.replaceState, approvals surface mounts.
  await page.getByRole('tab', { name: 'Deployments & approvals' }).click();
  await expect(page).toHaveURL(/tab=deployments/);
  await expect(page.getByRole('heading', { name: 'Deployments & approvals' })).toBeVisible({ timeout: 30_000 });
  // The deployments list (previously 9000px+ of document) now scrolls internally.
  await settle(page);
  await assertNoPageScroll(page, 'deploy-app (Deployments)');
  await assertNoErrorBoundary(page, 'deploy-app (Deployments)');
  await page.screenshot({ path: 'e2e/results/redesign-deploy-app.png' });

  // Back to Build — content still there (panels are hidden, not unmounted).
  await page.getByRole('tab', { name: 'Build' }).click();
  await expect(page).toHaveURL(/tab=build/);
  await expect(page.getByText('Pick a starting point')).toBeVisible();
  await assertNoPageScroll(page, 'deploy-app (Build, return)');

  // Deep link: ?tab=deployments opens directly on the approvals surface.
  await page.goto('/deploy-app?tab=deployments');
  await settle(page);
  await expect(page.getByRole('heading', { name: 'Deployments & approvals' })).toBeVisible({ timeout: 30_000 });
  await assertNoPageScroll(page, 'deploy-app (deep link)');

  expect(realErrors(errs), `pageerrors: ${realErrors(errs).join(' | ')}`).toHaveLength(0);
});

test('workflow: builder shell strictly viewport-fit, canvas keeps internal panning', async ({ page }) => {
  const errs = collectPageErrors(page);
  await signIn(page);

  await page.goto('/workflow');
  await settle(page);
  await page.waitForTimeout(3000); // heavy dynamic import (react-flow builder)

  // The builder mounted inside the shell — either directly on the canvas or
  // on its "Choose a workflow project" picker (the builder's own pre-state).
  const canvas = page.locator('.react-flow').first();
  const picker = page.getByRole('listbox', { name: 'workflow list' });
  await expect(canvas.or(picker).first()).toBeVisible({ timeout: 60_000 });
  // Cross-module links row is inside the fixed-height shell, not below the fold.
  await expect(page.getByText('Related:')).toBeVisible();

  await assertNoPageScroll(page, 'workflow (initial)');
  await assertNoErrorBoundary(page, 'workflow (initial)');

  // Open the first workflow so the REAL canvas mounts, then verify the
  // document stays pinned: panning belongs to the canvas, not the page.
  if (await picker.isVisible().catch(() => false)) {
    await picker.getByRole('option').first().click();
  }
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  await settle(page);
  await assertNoPageScroll(page, 'workflow (canvas open)');
  await assertNoErrorBoundary(page, 'workflow (canvas open)');

  await canvas.hover();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(500);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY, 'workflow: document scrolled on canvas wheel').toBe(0);

  await page.screenshot({ path: 'e2e/results/redesign-workflow.png' });
  expect(realErrors(errs), `pageerrors: ${realErrors(errs).join(' | ')}`).toHaveLength(0);
});

test('workflow/dev-tools: viewport-fit, tabs switch and sync ?tab=', async ({ page }) => {
  const errs = collectPageErrors(page);
  await signIn(page);

  await page.goto('/workflow/dev-tools');
  await settle(page);

  await expect(page.getByRole('heading', { name: 'Developer Tools' })).toBeVisible({ timeout: 30_000 });
  await assertNoPageScroll(page, 'dev-tools (git)');
  await assertNoErrorBoundary(page, 'dev-tools (git)');

  // Each tab switches content, syncs ?tab= and never grows the document.
  const tabs: { name: RegExp; probe: RegExp; key: string }[] = [
    { name: /Notebooks/, probe: /Snowflake notebooks/, key: 'notebooks' },
    { name: /Run SQL/, probe: /Ad-hoc statement/, key: 'sql' },
    { name: /Run Python/, probe: /Snowpark sandbox/, key: 'python' },
    { name: /Git Repositories/, probe: /Git repository integrations/, key: 'git' },
  ];
  const nav = page.locator('nav[aria-label="Developer tools"]');
  for (const t of tabs) {
    await nav.getByRole('button', { name: t.name }).click();
    await expect(page).toHaveURL(new RegExp(`tab=${t.key}`));
    await expect(page.getByText(t.probe).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await assertNoPageScroll(page, `dev-tools (${t.key})`);
    await assertNoErrorBoundary(page, `dev-tools (${t.key})`);
  }

  // Deep link into a non-default tab.
  await page.goto('/workflow/dev-tools?tab=sql');
  await settle(page);
  await expect(page.getByText(/Ad-hoc statement/).first()).toBeVisible({ timeout: 30_000 });
  await assertNoPageScroll(page, 'dev-tools (deep link sql)');

  await page.screenshot({ path: 'e2e/results/redesign-dev-tools.png' });
  expect(realErrors(errs), `pageerrors: ${realErrors(errs).join(' | ')}`).toHaveLength(0);
});
