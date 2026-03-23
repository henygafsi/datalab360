import { test } from '@playwright/test';

test('workflow full test with nextauth', async ({ page, context }) => {
  const consoleLogs: string[] = [];
  const networkCalls: any[] = [];
  
  page.on('console', msg => {
    if (msg.type() !== 'debug') {
      consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 120)}`);
    }
  });
  
  page.on('response', async resp => {
    if (!resp.url().includes('_next/static') && !resp.url().includes('.ico')) {
      networkCalls.push({ status: resp.status(), url: resp.url().slice(-70) });
    }
  });
  
  // Step 1: Go to signin, get CSRF, authenticate
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(2000);
  
  const csrfToken = await page.evaluate(async () => {
    const r = await fetch('/api/auth/csrf');
    const d = await r.json();
    return d.csrfToken;
  });
  
  // Post to credentials callback
  await page.evaluate(async ({ csrf }) => {
    await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrfToken: csrf,
        account_name: 'abcd',
        username: 'testadmin',
        password: 'NewSecurePassword123!',
        callbackUrl: '/workflow',
        json: 'true',
      }).toString(),
    });
  }, { csrf: csrfToken });
  
  // Check what cookies we have
  const cookiesBefore = await context.cookies();
  console.log('COOKIES_AFTER_AUTH:', cookiesBefore.map(c => c.name).join(', '));
  
  // Navigate to workflow
  await page.goto('http://localhost:3000/workflow');
  await page.waitForTimeout(8000);
  
  const finalUrl = page.url();
  console.log('FINAL_URL:', finalUrl);
  
  if (finalUrl.includes('signin')) {
    // Still on signin - check what's happening
    console.log('STILL_ON_SIGNIN');
    
    // Try signing in via the form with JS execution
    await page.fill('input[name="account_name"]', 'abcd');
    await page.fill('input[name="username"]', 'testadmin');
    await page.fill('input[name="password"]', 'NewSecurePassword123!');
    
    // Wait for the form submission to trigger the JS
    await page.click('button[type="submit"]');
    await page.waitForTimeout(10000);
    
    const urlAfterForm = page.url();
    console.log('URL_AFTER_FORM:', urlAfterForm);
    
    // Check for any error message
    const errorMsg = await page.evaluate(() => {
      const errEl = document.querySelector('.text-red-600, .text-red-500, [class*="text-red"]');
      return errEl?.textContent?.trim() || 'NO_ERROR_SHOWN';
    });
    console.log('ERROR_MSG:', errorMsg);
  }
  
  const finalBodyText = await page.evaluate(() => document.body.innerText.trim().slice(0, 400));
  console.log('FINAL_BODY:', finalBodyText);
  
  const hasReactFlow = await page.evaluate(() => !!document.querySelector('.react-flow'));
  console.log('HAS_REACTFLOW:', hasReactFlow);
  
  const hasPalette = await page.evaluate(() => document.body.innerText.includes('Data Sources'));
  console.log('HAS_PALETTE:', hasPalette);
  
  // Console errors
  const errors = consoleLogs.filter(l => l.includes('[error]'));
  console.log('CONSOLE_ERRORS:', errors.slice(0, 5).join(' | '));
  
  await page.screenshot({ path: '/tmp/workflow_full_test.png' });
  console.log('SCREENSHOT:', '/tmp/workflow_full_test.png');
});
