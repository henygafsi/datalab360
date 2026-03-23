import { test } from '@playwright/test';

test('access workflow page after sign-in to force compilation', async ({ browser }) => {
  test.setTimeout(180000);
  
  // Create a new context (fresh browser)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  
  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 100)}`));
  
  // Step 1: Force compile by loading each key page
  console.log('WARMING UP: Loading signin...');
  await page.goto('http://localhost:3000/signin', { timeout: 30000 });
  await page.waitForTimeout(8000); // Long wait for initial compilation
  
  const signinReady = await page.evaluate(() => document.querySelector('input[name="account_name"]') !== null);
  console.log('SIGNIN_INPUT_PRESENT:', signinReady);
  
  // Check if JS is loading
  const scriptStatuses = await page.evaluate(async () => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const results: Record<string, number> = {};
    for (const s of scripts.slice(0, 5)) {
      const src = s.getAttribute('src') || '';
      if (src.includes('chunks')) {
        const resp = await fetch(src);
        results[src.split('/').pop()?.split('?')[0] || src] = resp.status;
      }
    }
    return results;
  });
  console.log('SCRIPT_STATUSES:', JSON.stringify(scriptStatuses));
  
  // Step 2: Try Sign In
  const csrfToken = await page.evaluate(async () => {
    const r = await fetch('/api/auth/csrf');
    return (await r.json()).csrfToken;
  });
  
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
  
  // Step 3: Navigate to workflow
  console.log('NAVIGATING TO WORKFLOW...');
  await page.goto('http://localhost:3000/workflow', { timeout: 60000 });
  
  // Wait very long for session verification + page load
  await page.waitForTimeout(20000);
  
  const finalUrl = page.url();
  const bodyText = await page.evaluate(() => document.body.innerText.trim().slice(0, 300));
  
  console.log('FINAL_URL:', finalUrl);
  console.log('BODY_TEXT:', bodyText);
  
  // Check JS execution
  const jsExecuted = await page.evaluate(() => {
    // If React hydrated, we'd see specific React elements
    return {
      hasReactRoot: !!document.querySelector('[data-reactroot]') || !!document.querySelector('#__next'),
      hasReactFlow: !!document.querySelector('.react-flow'),
      hasPalette: document.body.innerText.includes('Data Sources'),
      hasVerifying: document.body.innerText.includes('Verifying session'),
      sessionGuardLoaded: !!document.querySelector('[class*="verif"]'),
      htmlBodyChars: document.body.innerHTML.length,
    };
  });
  console.log('JS_EXECUTION:', JSON.stringify(jsExecuted));
  
  const errors = consoleLogs.filter(l => l.includes('[error]')).slice(0, 10);
  console.log('CONSOLE_ERRORS:', errors.join('\n'));
  
  await page.screenshot({ path: '/tmp/workflow_forced.png' });
  await context.close();
});
