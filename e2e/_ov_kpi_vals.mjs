import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
const __d = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: 'e2e/.auth/state.json',
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

// Capture API responses with bodies
const apiData = {};
page.on('response', async (resp) => {
  const url = resp.url();
  if (url.includes('/api-proxy/command-center/kpis/') || url.includes('/api-proxy/command-center/recommendations')) {
    try {
      const body = await resp.json();
      const key = url.split('/api-proxy/')[1];
      apiData[key] = body;
    } catch {}
  }
});

await page.goto('http://localhost:3000/bi-dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
await page.waitForTimeout(5000);

console.log('ScoreCards API responses:');
Object.entries(apiData).forEach(([k, v]) => {
  console.log(' ', k, '->', JSON.stringify(v).substring(0, 200));
});

await browser.close();
