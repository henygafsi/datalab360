import { test } from '@playwright/test';

test('error detail debug', async ({ page }) => {
  const pageErrors: string[] = [];
  
  page.on('pageerror', (err: any) => {
    pageErrors.push({
      message: err.message,
      stack: err.stack?.slice(0, 500),
    } as any);
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(8000);
  
  console.log('ERRORS:');
  (pageErrors as any[]).forEach((e: any, i) => {
    console.log(`\n=== Error ${i+1} ===`);
    console.log('MSG:', e.message);
    console.log('STACK:', e.stack);
  });
});
