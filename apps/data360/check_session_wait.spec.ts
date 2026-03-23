import { test } from '@playwright/test';

test('wait for session to complete', async ({ page, context }) => {
  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 120)}`));
  
  // Step 1: Authenticate via NextAuth credentials callback
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(2000);
  
  const csrfToken = await page.evaluate(async () => {
    const r = await fetch('/api/auth/csrf');
    const d = await r.json();
    return d.csrfToken;
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
  
  // Check cookies
  const cookies = await context.cookies();
  console.log('COOKIES:', cookies.map(c => `${c.name}=${c.value.slice(0, 10)}`).join(', '));
  
  // Navigate to workflow and wait 20 seconds for session to load
  await page.goto('http://localhost:3000/workflow');
  
  // Poll for session to load (max 30s)
  let sessionLoaded = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText.trim());
    const url = page.url();
    
    console.log(`POLL_${i}: url=${url.slice(-30)}, text_len=${text.length}, has_verifying=${text.includes('Verifying')}, has_pipeline=${text.includes('Pipeline') || text.includes('Workflow')}`);
    
    if (!text.includes('Verifying') && text.length > 200) {
      sessionLoaded = true;
      console.log('SESSION_LOADED!');
      break;
    }
    
    if (url.includes('signin')) {
      console.log('REDIRECTED_TO_SIGNIN');
      break;
    }
  }
  
  const finalUrl = page.url();
  const finalBody = await page.evaluate(() => document.body.innerText.trim().slice(0, 400));
  console.log('FINAL_URL:', finalUrl);
  console.log('FINAL_BODY:', finalBody);
  
  // Check session state
  const sessionState = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session');
    const s = await r.json();
    return JSON.stringify(s).slice(0, 200);
  });
  console.log('SESSION_STATE:', sessionState);
  
  // Check errors
  const errors = consoleLogs.filter(l => l.includes('[error]')).slice(0, 5);
  console.log('ERRORS:', errors.join(' | '));
  
  await page.screenshot({ path: '/tmp/session_wait_result.png' });
});
