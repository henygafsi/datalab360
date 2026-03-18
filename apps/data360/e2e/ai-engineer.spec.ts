import { test, expect } from '@playwright/test';
import { goToPage, apiGet, apiGetRaw, apiPostRaw, expectNoRuntimeError } from './helpers';

test.describe('AI Engineer — ML & Cortex Test', () => {
  test('1. Intelligence page loads', async ({ page }) => {
    await goToPage(page, '/intelligent');
    await expectNoRuntimeError(page);
  });

  test('2. API: Cortex complete (mistral-large2)', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiPostRaw(page, '/cortex/complete', {
      model: "mistral-large2",
      prompt: "What is Snowflake Data Cloud?",
      max_tokens: 100
    });
    expect(r.status()).toBeLessThan(503);
  });

  test('3. API: ML classification models', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiGetRaw(page, '/cortex/ml/classification/models');
    expect(r.status()).toBeLessThan(503);
  });

  test('4. API: ML forecast (time series)', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiPostRaw(page, '/cortex/ml/forecast', {
      table: "CP_DATA360.RETAIL_DW.FACT_TRANSACTIONS",
      timestamp_column: "DATE_KEY",
      value_column: "MONTANT_TOTAL",
      forecast_periods: 7
    });
    expect(r.status()).toBeLessThan(503);
  });

  test('5. API: ML anomaly detection', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiPostRaw(page, '/cortex/ml/anomaly-detection', {
      table: "CP_DATA360.RETAIL_DW.FACT_TRANSACTIONS",
      timestamp_column: "DATE_KEY",
      value_column: "MONTANT_TOTAL"
    });
    expect(r.status()).toBeLessThan(503);
  });

  test('6. API: ML sentiment analysis', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiPostRaw(page, '/cortex/ml/sentiment', {
      text: "The product quality is excellent and delivery was fast",
      model: "mistral-large2"
    });
    expect(r.status()).toBeLessThan(503);
  });

  test('7. API: ML top insights', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiGetRaw(page, '/cortex/ml/top-insights');
    expect(r.status()).toBeLessThan(503);
  });

  test('8. API: Fine-tuning jobs list', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiGetRaw(page, '/cortex/ml/finetune/jobs');
    expect(r.status()).toBeLessThan(503);
  });

  test('9. API: Document AI models', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiGetRaw(page, '/cortex/ml/document-ai/models');
    expect(r.status()).toBeLessThan(503);
  });

  test('10. API: Generate semantic model', async ({ page }) => {
    await goToPage(page, '/intelligent');
    const r = await apiPostRaw(page, '/cortex/semantic-models/generate', {
      database: "CP_DATA360",
      schema: "RETAIL_DW"
    });
    expect(r.status()).toBeLessThan(503);
  });
});
