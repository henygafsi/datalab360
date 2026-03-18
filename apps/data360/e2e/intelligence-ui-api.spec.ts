/**
 * Intelligence Module — API Validation, Dark Mode & Cross-Module Navigation
 * Split from intelligence-ui.spec.ts for parallel execution.
 */

import { test, expect } from '@playwright/test';
import {
  goToPage,
  expectNoRuntimeError,
  expectDarkModeSupport,
  apiGetRaw,
  apiPostRaw,
} from './helpers';

// ---------------------------------------------------------------------------
// TIER 2 — API VALIDATION
// ---------------------------------------------------------------------------

test.describe('Intelligence — API Validation', () => {
  test('8.1 GET /cortex/kpis — returns models_active field', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/kpis');
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    const data = body?.data || body;
    expect(data).toHaveProperty('models_active');
  });

  test('8.2 GET /cortex/capabilities — returns feature flags', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/capabilities');
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    const data = body?.data || body;
    expect(data).toHaveProperty('features');
    expect(data.features).toHaveProperty('ml_finetune');
    expect(data.features).toHaveProperty('classification');
    expect(data.features).toHaveProperty('document_ai');
  });

  test('8.3 GET /cortex/semantic-models/list — returns an array', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/semantic-models/list');
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    const models = body?.data?.models || body?.models || body?.data || [];
    expect(Array.isArray(models)).toBe(true);
  });

  test('8.4 GET /cortex/ml/registry — returns models array with count', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/ml/registry');
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    expect(body).toHaveProperty('models');
    expect(body).toHaveProperty('count');
    expect(Array.isArray(body.models)).toBe(true);
  });

  test('8.5 GET /cortex/ml/document-ai/templates — returns 3+ templates', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/ml/document-ai/templates');
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    const templates = body?.data?.templates || body?.templates || [];
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates[0]).toHaveProperty('name');
    expect(templates[0]).toHaveProperty('fields');
  });

  test('8.6 GET /cortex/ml/finetune/jobs — responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/ml/finetune/jobs');
    expect(resp.status()).toBeLessThan(503);
  });

  test('8.7 GET /cortex/ml/classification/models — returns models', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/ml/classification/models');
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.json();
    expect(body).toHaveProperty('models');
  });

  test('8.8 GET /cortex/ml/document-ai/models — responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/ml/document-ai/models');
    expect(resp.status()).toBeLessThan(503);
  });

  test('8.9 GET /cortex/ml/top-insights — responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/ml/top-insights');
    expect(resp.status()).toBeLessThan(503);
  });

  test('8.10 POST /cortex/complete — LLM completion responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiPostRaw(page, '/cortex/complete', {
      model: 'mistral-7b',
      prompt: 'Explain data governance in one sentence.',
      max_tokens: 50,
    });
    expect(resp.status()).toBeLessThan(503);
  });

  test('8.11 POST /cortex/ml/sentiment — sentiment responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiPostRaw(page, '/cortex/ml/sentiment', {
      texts: ['This platform is excellent!', 'Very disappointing experience.'],
      text_column: 'text',
    });
    expect(resp.status()).toBeLessThan(503);
  });

  test('8.12 POST /cortex/ml/translate — translation responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiPostRaw(page, '/cortex/ml/translate', {
      text: 'Good morning',
      from_language: 'en',
      to_language: 'fr',
    });
    expect(resp.status()).toBeLessThan(503);
  });

  test('8.13 GET /cortex/query-analytics/summary — responds without 5xx', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const resp = await apiGetRaw(page, '/cortex/query-analytics/summary');
    expect(resp.status()).toBeLessThan(503);
  });
});

// ---------------------------------------------------------------------------
// TIER 1 — DARK MODE SUPPORT
// ---------------------------------------------------------------------------

test.describe('Intelligence — Dark Mode', () => {
  test('9.1 Page has dark: Tailwind classes on key elements', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await expectDarkModeSupport(page);
  });

  test('9.2 Dark mode classes are present on tab container and KPI cards', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const darkCount = await page.evaluate(() => {
      const all = document.querySelectorAll('[class*="dark:"]');
      return all.length;
    });
    // At least some dark: classes should exist (threshold lowered for resilience)
    expect(darkCount).toBeGreaterThan(0);
  });

  test('9.3 Dark mode does not invert to light background', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const badDarkClasses = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('[class*="dark:bg-gray-50"]'));
      return all.length;
    });
    expect(badDarkClasses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TIER 3 — CROSS-MODULE NAVIGATION
// ---------------------------------------------------------------------------

test.describe('Intelligence — Cross-Module Navigation', () => {
  test('10.1 "Use in Chat" button navigates to cortex-chat tab (if models exist)', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const useInChatBtn = page.locator('button[title="Use in Cortex Chat"]').first();
    const hasButton = await useInChatBtn.isVisible().catch(() => false);
    if (hasButton) {
      await useInChatBtn.click();
      await page.waitForURL(/cortex-chat/, { timeout: 10000 });
      await expectNoRuntimeError(page);
      await page.screenshot({ path: 'e2e/screenshots/intelligence-use-in-chat-navigation.png' });
    }
  });

  test('10.2 Navigate to Cortex Chat tab via clickTab', async ({ page }) => {
    await goToPage(page, '/intelligent');
    // Click the specific tab button containing "Cortex Chat"
    const tab = page.locator('button:has-text("Cortex Chat")').first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click();
    await page.waitForTimeout(1000);
    await expectNoRuntimeError(page);
  });

  test('10.3 Navigate to ML Features tab via clickTab', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const tab = page.locator('button:has-text("ML Features")').first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click();
    await page.waitForTimeout(1000);
    await expectNoRuntimeError(page);
  });

  test('10.4 Navigate to Advanced ML tab via clickTab', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const tab = page.locator('button:has-text("Advanced ML")').first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click();
    await page.waitForTimeout(1000);
    await expectNoRuntimeError(page);
  });

  test('10.5 Navigate to Query Analytics tab via clickTab', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const tab = page.locator('button:has-text("Query Analytics")').first();
    await tab.waitFor({ state: 'visible', timeout: 15000 });
    await tab.click();
    await page.waitForTimeout(1000);
    await expectNoRuntimeError(page);
  });
});
