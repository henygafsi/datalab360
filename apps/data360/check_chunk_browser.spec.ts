import { test } from '@playwright/test';

test('check chunk loading in browser', async ({ page }) => {
  // Check if chunks are served
  const response1 = await page.request.get('http://localhost:3000/_next/static/chunks/app-pages-internals.js');
  console.log('DIRECT_FETCH_STATUS:', response1.status());
  console.log('DIRECT_FETCH_HEADERS:', JSON.stringify(Object.fromEntries(Object.entries(await response1.allHeaders()).slice(0, 5))));
  
  // Now open the page and check what happens when the browser loads it
  const failedRequests: string[] = [];
  page.on('requestfailed', req => failedRequests.push(`${req.url()} - ${req.failure()?.errorText}`));
  page.on('response', resp => {
    if (resp.url().includes('app-pages-internals')) {
      console.log(`BROWSER_REQUEST: ${resp.url()} -> ${resp.status()}`);
      resp.headers().then(h => console.log('BROWSER_HEADERS:', JSON.stringify(h).slice(0, 200)));
    }
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(3000);
  
  console.log('FAILED_REQUESTS:', failedRequests.slice(0, 5).join(', '));
  
  // Check browser console for clues
  const browserErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      browserErrors.push(msg.text().slice(0, 120));
    }
  });
  
  // Try fetching in browser context
  const browserFetch = await page.evaluate(async () => {
    const r = await fetch('/_next/static/chunks/app-pages-internals.js');
    return { status: r.status, type: r.type, url: r.url };
  });
  console.log('BROWSER_FETCH:', JSON.stringify(browserFetch));
  
  console.log('ERRORS:', browserErrors.slice(0, 5).join(' | '));
});
