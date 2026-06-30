/**
 * Targeted re-run: capture ALL responses (no URL filter) for
 * cortex-chat and ml-features to identify the 404 endpoints.
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname2, '..');
const AUTH_STATE = path.join(REPO_ROOT, 'e2e/.auth/state.json');
const BASE_URL = 'http://localhost:3000';

async function captureTab(page, url, label) {
  console.log(`\n=== ${label} ===`);
  const all404s = [];
  const allFailed = [];

  const respListener = async (response) => {
    if (response.status() === 404) {
      all404s.push({ url: response.url(), status: 404 });
    }
  };
  const failListener = (request) => {
    allFailed.push({ url: request.url(), failure: request.failure()?.errorText });
  };

  page.on('response', respListener);
  page.on('requestfailed', failListener);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);

  page.off('response', respListener);
  page.off('requestfailed', failListener);

  if (all404s.length === 0) {
    console.log('  No 404 responses detected');
  } else {
    console.log('  404 responses:');
    for (const r of all404s) {
      console.log(`    404 ${r.url}`);
    }
  }
  if (allFailed.length > 0) {
    console.log('  Failed requests:');
    for (const r of allFailed) {
      console.log(`    FAIL ${r.url} — ${r.failure}`);
    }
  }
  return { all404s, allFailed };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  await captureTab(page, `${BASE_URL}/intelligent?tab=cortex-chat`, 'intelligent/AI Chat (cortex-chat)');
  await captureTab(page, `${BASE_URL}/intelligent?tab=ml-features`, 'intelligent/ML Features (ml-features)');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
