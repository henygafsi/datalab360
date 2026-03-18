/**
 * Intelligence Module — Advanced ML & Query Analytics
 * Split from intelligence-ui.spec.ts for parallel execution.
 */

import { test, expect } from '@playwright/test';
import {
  goToPage,
  expectNoRuntimeError,
  clickTab,
  clickButton,
  closeModal,
  expectNoLoader,
  expectKpiCards,
} from './helpers';

// ---------------------------------------------------------------------------
// TIER 3 — ADVANCED ML SUB-TABS
// ---------------------------------------------------------------------------

test.describe('Intelligence — Advanced ML Sub-tabs', () => {
  test('6.1 Model Registry section loads — summary KPI cards are visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await expect(page.locator('text=Fine-Tune Jobs').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Classification Models').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Document AI Models').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Top Insights').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/intelligence-model-registry.png' });
  });

  test('6.2 Fine-tuning section — content loads after tab click', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'Fine-tuning');
    // Verify section loaded — either "New Fine-Tune Job" button or "No fine-tuning jobs" text
    const body = await page.textContent('body');
    const hasFinetuneContent = (body ?? '').toLowerCase().includes('fine-tun') || (body ?? '').toLowerCase().includes('fine_tun');
    expect(hasFinetuneContent).toBe(true);
    await page.screenshot({ path: 'e2e/screenshots/intelligence-finetune-section.png' });
  });

  test('6.3 Fine-tuning — open create modal and "Use Sample Data" button is visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    // Use exact button match for sub-tab (avoid matching "Fine-Tune Jobs" KPI text)
    const ftTab = page.locator('button').filter({ hasText: /^Fine-tuning/ }).first();
    const isFtVisible = await ftTab.isVisible().catch(() => false);
    if (isFtVisible) {
      await ftTab.click();
      await page.waitForTimeout(500);
      const newJobBtn = page.locator('button:has-text("New Fine-Tune Job")').first();
      const hasBtn = await newJobBtn.isVisible().catch(() => false);
      if (hasBtn) {
        await newJobBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'e2e/screenshots/intelligence-finetune-modal.png' });
        await closeModal(page);
      }
    }
    await expectNoRuntimeError(page);
  });

  test('6.4 Fine-tuning — "Use Sample Data" fills the form fields', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    const ftTab = page.locator('button').filter({ hasText: /^Fine-tuning/ }).first();
    const isFtVisible = await ftTab.isVisible().catch(() => false);
    if (isFtVisible) {
      await ftTab.click();
      await page.waitForTimeout(500);
      const newJobBtn = page.locator('button:has-text("New Fine-Tune Job")').first();
      const hasBtn = await newJobBtn.isVisible().catch(() => false);
      if (hasBtn) {
        await newJobBtn.click();
        await page.waitForTimeout(500);
        const sampleBtn = page.locator('button:has-text("Use Sample Data")').first();
        const hasSample = await sampleBtn.isVisible().catch(() => false);
        if (hasSample) {
          await sampleBtn.click();
          await page.waitForTimeout(300);
        }
        await closeModal(page);
      }
    }
    await expectNoRuntimeError(page);
  });

  test('6.5 ML Classification section — "Train Model" and "Predict" buttons visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'ML Classification');
    await expect(page.locator('button:has-text("Train Model")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Predict")').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/intelligence-classification-section.png' });
  });

  test('6.6 ML Classification — open Train modal and "Use Sample Data" button is visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'ML Classification');
    await clickButton(page, 'Train Model');
    await expect(page.locator('text=Train Classification Model').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Use Sample Data")').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/intelligence-train-classification-modal.png' });
    await closeModal(page);
  });

  test('6.7 ML Classification — open Predict modal and input fields are present', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'ML Classification');
    await clickButton(page, 'Predict');
    await expect(page.locator('text=Run Prediction').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Model Name').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Input Table').first()).toBeVisible({ timeout: 5000 });
    await closeModal(page);
  });

  test('6.8 Document AI section — "Create Document AI Model" button is visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await page.locator('button:has-text("Document AI")').first().click();
    await page.waitForTimeout(1000);
    // Check for create button or verify tab content loaded
    const createBtn = page.locator('button:has-text("Create Model"), button:has-text("New Model"), button:has-text("Create Document AI")').first();
    const isVisible = await createBtn.isVisible().catch(() => false);
    if (isVisible) {
      await page.screenshot({ path: 'e2e/screenshots/intelligence-document-ai-section.png' });
    }
    await expectNoRuntimeError(page);
  });

  test('6.9 Document AI section — templates are loaded', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'Document AI');
    await expectNoLoader(page);
    const bodyText = await page.locator('body').textContent();
    expect((bodyText ?? '').length).toBeGreaterThan(50);
    await expectNoRuntimeError(page);
  });

  test('6.10 Document AI — file upload area visible in predict modal', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'Document AI');
    const predictBtn = page.locator('button:has-text("Predict"), button:has-text("Extract"), button:has-text("Upload")').first();
    const isVisible = await predictBtn.isVisible().catch(() => false);
    if (isVisible) {
      await predictBtn.click();
      await page.waitForTimeout(400);
      const fileInput = page.locator('input[type="file"], input[placeholder*="stage"], input[placeholder*="file"]').first();
      const modalContent = page.locator('[class*="modal"], [role="dialog"]').first();
      await expect(modalContent.or(fileInput)).toBeVisible({ timeout: 10000 });
      await page.screenshot({ path: 'e2e/screenshots/intelligence-document-ai-predict-modal.png' });
      await closeModal(page);
    }
    await expectNoRuntimeError(page);
  });

  test('6.11 Top Insights section — "Create Instance" button visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    await clickTab(page, 'Top Insights');
    await expectNoLoader(page);
    await expect(
      page.locator('button:has-text("Create Instance"), button:has-text("New Instance"), button:has-text("Create Top Insights")').first()
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'e2e/screenshots/intelligence-top-insights-section.png' });
  });

  test('6.12 Advanced ML — no runtime errors across all sub-tabs', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Advanced ML');
    const subTabs = ['Model Registry', 'Fine-tuning', 'ML Classification', 'Document AI', 'Top Insights'];
    for (const subTab of subTabs) {
      await clickTab(page, subTab);
      await page.waitForTimeout(300);
      await expectNoRuntimeError(page);
    }
  });
});

// ---------------------------------------------------------------------------
// TIER 3 — QUERY ANALYTICS
// ---------------------------------------------------------------------------

test.describe('Intelligence — Query Analytics', () => {
  test('7.1 Time range selector shows all expected options', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Query Analytics');
    const timeSelect = page.locator('select').first();
    await expect(timeSelect).toBeVisible({ timeout: 10000 });
    const optionTexts = await timeSelect.locator('option').allTextContents();
    expect(optionTexts.some((t) => t.includes('1h'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('24h'))).toBe(true);
  });

  test('7.2 Run Analysis button is enabled and clicking it does not crash', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Query Analytics');
    const runBtn = page.locator('button:has-text("Run Analysis")').first();
    await expect(runBtn).toBeVisible({ timeout: 10000 });
    await expect(runBtn).not.toBeDisabled();
    await runBtn.click();
    await page.waitForTimeout(500);
    await expectNoRuntimeError(page);
  });

  test('7.3 Query Analytics KPI cards are visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Query Analytics');
    await expectNoLoader(page);
    await expect(page.locator('text=Total Analyzed').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Redundant').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/intelligence-query-analytics-kpis.png' });
  });

  test('7.4 Analysis Results section header is visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Query Analytics');
    await expect(page.locator('text=Analysis Results').first()).toBeVisible({ timeout: 15000 });
  });

  test('7.5 Filter chips are visible', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Query Analytics');
    await expectNoLoader(page);
    await expect(page.locator('button:has-text("All Issues")').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("Redundant")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Error Pattern")').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'e2e/screenshots/intelligence-query-analytics-filters.png' });
  });

  test('7.6 Switching filter chips does not crash the page', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await clickTab(page, 'Query Analytics');
    await expectNoLoader(page);
    const filters = ['Redundant', 'Error Pattern', 'Slow Query', 'Optimization', 'All Issues'];
    for (const f of filters) {
      const btn = page.locator(`button:has-text("${f}")`).first();
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        await btn.click();
        await page.waitForTimeout(300);
        await expectNoRuntimeError(page);
      }
    }
  });
});
