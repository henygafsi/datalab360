import { test } from '@playwright/test';

test('first visit trigger compilation', async ({ page }) => {
  const chunkRequests: any[] = [];
  
  page.on('response', async resp => {
    if (resp.url().includes('chunks')) {
      chunkRequests.push({ url: resp.url().slice(-60), status: resp.status() });
    }
  });
  
  // Visit the signin page first
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(5000); // Give compiler time to run
  
  // Check all chunk responses
  const failed = chunkRequests.filter(r => r.status !== 200);
  const ok = chunkRequests.filter(r => r.status === 200);
  
  console.log('SUCCESSFUL_CHUNKS:', ok.length);
  console.log('FAILED_CHUNKS:', failed.length);
  console.log('FAILED_DETAILS:', JSON.stringify(failed));
  
  // Try fetching the problematic chunk from the page context
  const chunkStatus = await page.evaluate(async () => {
    const urls = [
      '/_next/static/chunks/app-pages-internals.js',
      '/_next/static/chunks/main-app.js',
    ];
    const results: any = {};
    for (const url of urls) {
      try {
        const r = await fetch(url, { credentials: 'omit' });
        results[url] = { status: r.status, ok: r.ok };
      } catch(e: any) {
        results[url] = { error: e.message };
      }
    }
    return results;
  });
  console.log('CHUNK_STATUS_FROM_PAGE:', JSON.stringify(chunkStatus));
});
