import { test } from '@playwright/test';

test('real login via NextAuth UI flow', async ({ page }) => {
  test.setTimeout(120000);
  
  const consoleLogs: string[] = [];
  const networkCalls: { status: number; url: string }[] = [];
  
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 120)}`));
  page.on('response', resp => {
    if (!resp.url().includes('_next/static') && !resp.url().includes('.css') && !resp.url().includes('.ico')) {
      networkCalls.push({ status: resp.status(), url: resp.url().slice(-80) });
    }
  });
  
  // Navigate to signin and trigger full page compilation
  await page.goto('http://localhost:3000/signin');
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  
  console.log('SIGNIN_LOADED');
  
  // Fill and submit via the actual form UI
  await page.fill('input[name="account_name"]', 'abcd');
  await page.fill('input[name="username"]', 'testadmin');
  await page.fill('input[name="password"]', 'NewSecurePassword123!');
  
  console.log('FORM_FILLED');
  
  // Click sign in and wait
  await page.click('button[type="submit"]');
  
  // Wait for network to settle OR for navigation
  try {
    await page.waitForNavigation({ timeout: 20000 });
  } catch {
    console.log('NAVIGATION_TIMEOUT');
  }
  
  await page.waitForTimeout(3000);
  
  const url = page.url();
  console.log('POST_LOGIN_URL:', url);
  
  // If still on signin, check for errors
  if (url.includes('signin')) {
    const errorText = await page.evaluate(() => {
      const allRed = Array.from(document.querySelectorAll('[class*="red"]'));
      return allRed.map(e => e.textContent?.trim()).filter(Boolean).slice(0, 3).join(' | ');
    });
    console.log('ERROR_TEXT:', errorText);
    
    // Check cookies
    const cookies = await page.context().cookies();
    console.log('COOKIES:', cookies.map(c => c.name).join(', '));
  } else {
    console.log('REDIRECTED:', url);
    await page.waitForTimeout(10000);
    
    const body = await page.evaluate(() => document.body.innerText.trim().slice(0, 300));
    console.log('PAGE_CONTENT:', body);
    
    const hasReactFlow = await page.evaluate(() => !!document.querySelector('.react-flow'));
    console.log('HAS_REACTFLOW:', hasReactFlow);
  }
  
  // Final screenshot
  await page.screenshot({ path: '/tmp/real_login.png' });
  
  // Print non-error network calls
  const nonStatic = networkCalls.filter(r => !r.url.includes('_next') && r.status >= 400);
  console.log('ERROR_NETWORK:', nonStatic.slice(0, 5).join(' | '));
});
