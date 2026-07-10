import { test } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(12 * 60_000);
test('repro explore-design', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}`.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 250)); });
  const failed: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });

  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  for (const url of ['/explore-design', '/explore-design?view=catalog', '/explore-design?project_id=proj_01c59ad751d8&view=catalog']) {
    pageErrors.length = 0; consoleErrors.length = 0; failed.length = 0;
    await page.goto(url).catch(()=>{});
    await page.waitForTimeout(30_000);
    const boom = await page.getByText('Something went wrong', { exact: false }).isVisible().catch(()=>false);
    console.log(`\n=== ${url}  crashed=${boom}`);
    console.log('  PAGE_ERRORS:', JSON.stringify(pageErrors.slice(0,3)));
    console.log('  HTTP_FAILS :', JSON.stringify([...new Set(failed)].slice(0,6)));
    console.log('  CONSOLE    :', JSON.stringify(consoleErrors.filter(e=>!e.includes('Warning:')).slice(0,3)));
  }
});
