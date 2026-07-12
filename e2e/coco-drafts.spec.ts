import { test, expect } from '@playwright/test';

const PASS = process.env.D360_PASS ?? '';

test.setTimeout(8 * 60_000);

test('COCO Drafts mode generates a chart draft tested on real data', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('response', (r) => {
    if (r.url().includes('/cortex/coco/draft')) {
      console.log('NET:', r.status(), r.url().replace(/^https?:\/\/[^/]+/, ''));
    }
  });

  // ── Sign in ──
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 90_000 });

  // ── Open the global chat surface (floating bubble bottom-right) ──
  await page.locator('button[aria-label="Open chat"]').click({ timeout: 60_000 });

  // ── Enter Drafts mode ──
  await page.getByTestId('coco-drafts-open').click();
  await expect(page.getByTestId('coco-drafts-panel')).toBeVisible();

  // ── Fill the form: Chart module + intent + grounding tables ──
  await page.getByRole('radio', { name: 'Chart' }).click();
  await page
    .locator('textarea[aria-label="Draft intent"]')
    .fill('Total order amount by channel name');
  await page
    .locator('input[aria-label="Table FQNs, comma-separated"]')
    .fill('DRAFT_SOURCE.RETAIL_DW.FACT_ORDERS,DRAFT_SOURCE.RETAIL_DW.DIM_CHANNELS');

  // ── Generate (LLM + real test execution: 5-30s, allow up to 90s) ──
  const generateBtn = page.getByTestId('coco-draft-generate');
  await generateBtn.click();
  await expect(generateBtn).toBeDisabled(); // honest running state

  const card = page.getByTestId('coco-draft-card');
  await expect(card).toBeVisible({ timeout: 90_000 });

  // ── Ready badge: draft was TESTED on real data ──
  const badge = page.getByTestId('coco-draft-badge');
  await expect(badge).toHaveText('Tested on real data');

  // ── Sample table from the live test run ──
  const sampleTable = page.getByTestId('coco-draft-sample-table');
  await expect(sampleTable).toBeVisible();
  await expect(sampleTable.locator('tbody tr').first()).toBeVisible();
  const cardText = await card.innerText();
  console.log('CARD_TEXT:', cardText.replace(/\n/g, ' | ').slice(0, 600));

  // Grounding chips present (2 tables were provided)
  await expect(page.getByTestId('coco-draft-grounding')).toBeVisible();

  // ── Zero page errors ──
  expect(pageErrors, `pageerrors: ${pageErrors.join(' || ')}`).toHaveLength(0);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/results/coco-draft-card.png', fullPage: false });
});
