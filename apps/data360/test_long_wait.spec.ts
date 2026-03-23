import { test } from '@playwright/test';

test('long wait test', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (msg: any) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text().slice(0, 100)}`);
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(500);
  
  const csrfToken = await page.evaluate(async () => {
    const r = await fetch('/api/auth/csrf');
    return ((await r.json()) as any).csrfToken;
  });
  
  await page.evaluate(async ({ csrf }: { csrf: string }) => {
    await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrfToken: csrf,
        account_name: 'abcd',
        username: 'testadmin',
        password: 'NewSecurePassword123!',
        callbackUrl: '/intelligent',
        json: 'true',
      }).toString(),
    });
  }, { csrf: csrfToken });
  
  await page.goto('http://localhost:3000/intelligent');
  
  // Wait up to 30 seconds for the page to change from "Verifying session..."
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const body = await page.evaluate(() => document.body.innerText.trim());
    console.log(`T+${i+1}s: body=${body.slice(0, 80)}`);
    if (body.length > 50 && !body.includes('Verifying session')) {
      console.log('PAGE_LOADED_AT_T+' + (i+1));
      break;
    }
  }
  
  const finalBody = await page.evaluate(() => document.body.innerText.trim());
  console.log('FINAL_BODY_LENGTH:', finalBody.length);
  console.log('FINAL_BODY:', finalBody.slice(0, 400));
  
  console.log('\nCONSOLE_MESSAGES:');
  consoleMessages.forEach(m => console.log(m));
  
  await page.screenshot({ path: '/tmp/long_wait_test.png' });
});
