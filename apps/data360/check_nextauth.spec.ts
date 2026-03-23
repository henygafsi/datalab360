import { test } from '@playwright/test';

test('test nextauth signin', async ({ page }) => {
  const allNetwork: { method: string; url: string; status: number; body?: string }[] = [];
  
  page.on('response', async resp => {
    if (resp.url().includes('auth') || resp.url().includes('api') || resp.url().includes('8000')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 300); } catch {}
      allNetwork.push({ method: resp.request().method(), url: resp.url().slice(0, 120), status: resp.status(), body });
    }
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`BROWSER_${msg.type().toUpperCase()}: ${msg.text().slice(0, 100)}`);
    }
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(2000);
  
  // First check what CSRF token NextAuth has
  const csrfResp = await page.evaluate(async () => {
    const r = await fetch('/api/auth/csrf');
    return await r.json();
  });
  console.log('CSRF:', JSON.stringify(csrfResp));
  
  // Check NextAuth providers
  const providersResp = await page.evaluate(async () => {
    const r = await fetch('/api/auth/providers');
    return await r.json();
  });
  console.log('PROVIDERS:', JSON.stringify(providersResp).slice(0, 200));
  
  // Try to call signIn directly
  await page.fill('input[name="account_name"]', 'abcd');
  await page.fill('input[name="username"]', 'testadmin');
  await page.fill('input[name="password"]', 'NewSecurePassword123!');
  
  // Click submit and track the signIn call
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  
  console.log('NETWORK_CALLS:', JSON.stringify(allNetwork.map(r => ({ m: r.method, u: r.url.slice(-60), s: r.status })), null, 2));
  
  // Check for any visible error
  const errorText = await page.evaluate(() => {
    const el = document.querySelector('[class*="text-red"], [role="alert"]');
    return el?.textContent?.trim() || '';
  });
  console.log('ERROR_TEXT:', errorText);
  
  console.log('FINAL_URL:', page.url());
});
