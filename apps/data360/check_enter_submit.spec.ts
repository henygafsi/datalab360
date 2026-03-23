import { test } from '@playwright/test';

test('submit form via Enter key', async ({ page }) => {
  test.setTimeout(60000);
  
  const authCalls: any[] = [];
  page.on('response', async resp => {
    if (resp.url().includes('auth') || resp.url().includes('8000')) {
      let body = '';
      try { body = (await resp.text()).slice(0, 200); } catch {}
      authCalls.push({ status: resp.status(), url: resp.url().slice(-60), body: body.slice(0, 50) });
    }
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForLoadState('networkidle');
  
  // Focus on form fields
  const accountInput = await page.$('input[name="account_name"]');
  const usernameInput = await page.$('input[name="username"]');
  const passwordInput = await page.$('input[name="password"]');
  
  if (accountInput && usernameInput && passwordInput) {
    await accountInput.click();
    await accountInput.type('abcd', { delay: 50 });
    await usernameInput.click();
    await usernameInput.type('testadmin', { delay: 50 });
    await passwordInput.click();
    await passwordInput.type('NewSecurePassword123!', { delay: 50 });
    
    console.log('FORM_FILLED');
    
    // Try pressing Enter
    await passwordInput.press('Enter');
    await page.waitForTimeout(5000);
    
    console.log('AFTER_ENTER_URL:', page.url());
    
    // Try clicking the button directly  
    const btn = await page.$('button[type="submit"]');
    if (btn) {
      const btnText = await btn.textContent();
      const btnVisible = await btn.isVisible();
      const btnEnabled = await btn.isEnabled();
      console.log(`BUTTON: text="${btnText?.trim()}", visible=${btnVisible}, enabled=${btnEnabled}`);
      
      if (btnVisible && btnEnabled) {
        await btn.click();
        await page.waitForTimeout(8000);
        console.log('AFTER_CLICK_URL:', page.url());
      }
    }
  }
  
  const cookies = await page.context().cookies();
  console.log('COOKIES:', cookies.map(c => `${c.name}=${c.value.slice(0,10)}`).join(', '));
  
  console.log('AUTH_CALLS:', JSON.stringify(authCalls, null, 2));
  
  await page.screenshot({ path: '/tmp/enter_submit.png' });
});
