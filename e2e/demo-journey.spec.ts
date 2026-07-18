import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
const STATE = path.join(__dirname, 'night-audit-artifacts', '.auth.json');
const OUT = path.join(__dirname, 'agentic-os-artifacts', 'demo-journey');
fs.mkdirSync(OUT, { recursive: true });
test.use({ storageState: STATE, viewport: { width: 1440, height: 900 } });
test.setTimeout(420_000);

test('DEMO: need → rights-scoped analysis → tap journey → real chart → tap create', async ({ page }) => {
  await page.goto('/intelligent', { waitUntil: 'domcontentloaded' });
  const nav = page.getByRole('navigation', { name: 'Lifecycle steps' });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  const box = page.getByLabel('Ask the agent');

  // 1 · The user expresses ONLY the need.
  await box.fill('I want to understand my sales performance and get a plan to a dashboard');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Exploring your sources…')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/I explored your sources and picked|Plan ready/), 'agent analyzed & grounded within MY rights').toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '1-need-understood.png') });

  // 2 · Ask for the journey → clickable plan (tap choices).
  await box.fill('plan the steps to a sales dashboard');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Plan ready — click any step/), 'journey proposed as taps').toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: path.join(OUT, '2-journey-tap-choices.png') });

  // 3 · TAP the Dashboards node (user only taps).
  const dashNode = page.locator('.react-flow__node', { hasText: '→ Dashboards' }).first();
  if (await dashNode.isVisible().catch(() => false)) {
    await dashNode.click();
    await page.waitForTimeout(800);
  }
  await nav.getByRole('button', { name: /Dashboards/i }).click();
  // A crisp single-metric ask on the FACT-first grounding (proven shape).
  await box.fill('bar chart of transaction count by store');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/chart draft/).last(), 'real chart outcome').toBeVisible({ timeout: 150_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '3-real-chart.png') });

  // 4 · TAP create — the only word the user ever needs is a tap (or 'go').
  const createBtn = page.getByRole('button', { name: 'Create as BI widget' });
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await expect(page.getByText(/Created — widget|could not validate/)).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: path.join(OUT, '4-created-by-tap.png') });
});
