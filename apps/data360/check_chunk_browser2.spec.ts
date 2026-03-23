import { test } from '@playwright/test';

test('check chunk loading in browser context', async ({ page }) => {
  // Listen for all responses related to chunks
  const chunkResponses: { url: string; status: number }[] = [];
  page.on('response', resp => {
    if (resp.url().includes('app-pages') || resp.url().includes('main-app')) {
      chunkResponses.push({ url: resp.url().slice(-60), status: resp.status() });
    }
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(4000);
  
  console.log('CHUNK_RESPONSES:', JSON.stringify(chunkResponses, null, 2));
  
  // Check what's happening in the browser
  const browserFetch = await page.evaluate(async () => {
    try {
      const r = await fetch('/_next/static/chunks/app-pages-internals.js');
      return { status: r.status, size: (await r.text()).length };
    } catch(e) {
      return { error: String(e) };
    }
  });
  console.log('BROWSER_FETCH_RESULT:', JSON.stringify(browserFetch));
  
  // Check if React has loaded
  const reactLoaded = await page.evaluate(() => {
    return {
      hasReact: typeof (window as any).React !== 'undefined',
      hasWebpackChunks: typeof (window as any).webpackChunk_N_E !== 'undefined',
      loadedChunks: Object.keys((window as any).__webpack_require__?.c || {}).length,
    };
  });
  console.log('REACT_LOADED:', JSON.stringify(reactLoaded));
});
