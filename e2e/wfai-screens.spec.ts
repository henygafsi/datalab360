import { test, type Page } from '@playwright/test';

/**
 * wfai-screens — evidence screenshots for the 2026-07-11 workflow +
 * intelligent one-pager refactor. Captures both pages at 1920×1080 and
 * 1440×900, the loaded builder, and one fullscreen deep-dive state each,
 * into e2e/results/wfai-*.png.
 */
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(25 * 60_000);

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name, input[placeholder*="ccount"]').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username, input[placeholder*="ser"]').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });
}

async function settle(page: Page, ms = 4000) {
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1440, h: 900 },
];

test('capture workflow + intelligent (both sizes + fullscreen states)', async ({ page }) => {
  await signIn(page);

  for (const { w, h } of SIZES) {
    await page.setViewportSize({ width: w, height: h });

    await page.goto('/workflow');
    await settle(page);
    await page.screenshot({ path: `e2e/results/wfai-workflow-${w}x${h}.png` });

    await page.goto('/intelligent');
    await settle(page);
    await page.screenshot({ path: `e2e/results/wfai-intelligent-home-${w}x${h}.png` });

    await page.goto('/intelligent?tab=query-analytics');
    await settle(page);
    await page.screenshot({ path: `e2e/results/wfai-intelligent-qa-${w}x${h}.png` });
  }

  await page.setViewportSize({ width: 1920, height: 1080 });

  // Intelligent: fullscreen deep-dive of the main content card.
  await page.goto('/intelligent?tab=semantic-models');
  await settle(page, 3000);
  await page.locator('button[aria-label*="fullscreen" i]').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/results/wfai-intelligent-fullscreen-1920x1080.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // Workflow: load a project, capture builder, run-history deep-dive, then
  // the native fullscreen of the whole builder frame.
  await page.goto('/workflow');
  await settle(page);
  await page.getByText('SAMPLE · Coco-drafted', { exact: false }).first().click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'e2e/results/wfai-workflow-builder-1920x1080.png' });

  await page.getByRole('button', { name: 'Run history' }).first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'e2e/results/wfai-workflow-runs-1920x1080.png' });
  const expand = page.getByRole('button', { name: /Expand run history to fullscreen/i }).first();
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/results/wfai-workflow-runs-fullscreen-1920x1080.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  await page.getByRole('button', { name: /Expand builder to fullscreen/i }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/results/wfai-workflow-fullscreen-1920x1080.png' });
});
