import { test } from '@playwright/test';

test('nextauth credentials signin', async ({ page }) => {
  const allNetworkDetail: any[] = [];
  
  page.on('response', async resp => {
    if (resp.url().includes('auth')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 300); } catch {}
      allNetworkDetail.push({ 
        method: resp.request().method(),
        url: resp.url().slice(-80),
        status: resp.status(),
        body: body.slice(0, 100),
      });
    }
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(1000);
  
  // Get CSRF token first
  const csrfToken = await page.evaluate(async () => {
    const r = await fetch('/api/auth/csrf');
    const d = await r.json();
    return d.csrfToken;
  });
  console.log('CSRF_TOKEN:', csrfToken?.slice(0, 20));
  
  // Try to post directly to NextAuth credentials callback
  const authResp = await page.evaluate(async ({ csrf }) => {
    const resp = await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrfToken: csrf,
        account_name: 'abcd',
        username: 'testadmin',
        password: 'NewSecurePassword123!',
        callbackUrl: '/workflow',
        json: 'true',
      }).toString(),
    });
    return { status: resp.status, url: resp.url, body: (await resp.text()).slice(0, 200) };
  }, { csrf: csrfToken });
  
  console.log('AUTH_RESP_STATUS:', authResp.status);
  console.log('AUTH_RESP_URL:', authResp.url.slice(-60));
  console.log('AUTH_RESP_BODY:', authResp.body);
  
  // Check for session cookie now
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(c => c.name.includes('next-auth') || c.name.includes('session'));
  console.log('AUTH_COOKIE:', authCookie ? `${authCookie.name}=${authCookie.value.slice(0, 20)}...` : 'NONE');
  
  // Navigate to workflow
  await page.goto('http://localhost:3000/workflow');
  await page.waitForTimeout(5000);
  
  console.log('FINAL_URL:', page.url());
  
  const hasContent = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasWorkflow: text.includes('Pipeline') || text.includes('Workflow') || text.includes('ETL'),
      hasPalette: text.includes('Data Sources') || text.includes('Transforms'),
      hasSignin: text.includes('Sign in'),
    };
  });
  console.log('CONTENT_CHECK:', JSON.stringify(hasContent));
  
  console.log('ALL_AUTH_NETWORK:', JSON.stringify(allNetworkDetail, null, 2));
  
  await page.screenshot({ path: '/tmp/nextauth_test.png' });
});
