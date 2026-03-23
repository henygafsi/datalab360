import { test } from '@playwright/test';

test('webpack deep debug', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err: any) => pageErrors.push(err.message.slice(0, 300)));
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(8000);
  
  const state = await page.evaluate(() => {
    const w = window as any;
    const chunks = w.webpackChunk_N_E || [];
    
    return {
      chunkNames: chunks.map((c: any) => JSON.stringify(c[0])),
      chunkModuleCounts: chunks.map((c: any) => Object.keys(c[1] || {}).length),
      // Check webpack module registry
      webpackModuleCount: Object.keys(w.__webpack_modules__ || {}).length,
      // Check if webpack require works
      webpackRequireExists: typeof w.__webpack_require__ !== 'undefined',
      // Check webpackChunkN_E queue handler
      hasChunkHandler: !!(chunks.push !== Array.prototype.push),
    };
  });
  
  console.log('DEEP_STATE:', JSON.stringify(state));
  console.log('PAGE_ERRORS_COUNT:', pageErrors.length);
  if (pageErrors.length) {
    console.log('FIRST_ERROR:', pageErrors[0]);
  }
});
