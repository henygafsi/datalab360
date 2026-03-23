import { test } from '@playwright/test';

test('direct auth via playwright request', async ({ page, request }) => {
  // Use playwright's request to call the backend
  const loginResp = await request.post('http://localhost:8000/user/login/', {
    data: { account_name: 'abcd', username: 'testadmin', password: 'NewSecurePassword123!' },
    headers: { 'Content-Type': 'application/json' },
  });
  
  console.log('LOGIN_STATUS:', loginResp.status());
  const loginData = await loginResp.json();
  console.log('LOGIN_BODY:', JSON.stringify(loginData).slice(0, 100));
  
  const token = loginData?.access_token || '';
  console.log('TOKEN_LENGTH:', token.length);
  
  if (!token) {
    console.log('BACKEND_ERROR:', JSON.stringify(loginData));
    return;
  }
  
  // Navigate to signin page, set the token, then go to workflow
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(1500);
  
  await page.evaluate(({ t }) => {
    localStorage.setItem('access_token', t);
    localStorage.setItem('snowflake_token', t);
  }, { t: token });
  
  console.log('TOKEN_IN_LOCALSTORAGE: YES');
  
  // Navigate to workflow page
  await page.goto('http://localhost:3000/workflow');
  await page.waitForTimeout(6000);
  
  const url = page.url();
  console.log('FINAL_URL:', url);
  
  const bodyText = await page.evaluate(() => document.body.innerText.trim().slice(0, 300));
  console.log('BODY_TEXT:', bodyText);
  
  // Check for auth redirect
  const isOnSignin = url.includes('signin');
  console.log('REDIRECTED_TO_SIGNIN:', isOnSignin);
  
  const reactFlow = await page.evaluate(() => !!document.querySelector('.react-flow'));
  console.log('HAS_REACTFLOW:', reactFlow);
  
  const canvasText = await page.evaluate(() => {
    const rf = document.querySelector('.react-flow');
    return rf ? 'FOUND' : 'NOT_FOUND';
  });
  console.log('REACTFLOW_ELEMENT:', canvasText);
  
  const paletteFound = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('Data Sources') || text.includes('Basic Transforms');
  });
  console.log('PALETTE_FOUND:', paletteFound);
  
  await page.screenshot({ path: '/tmp/workflow_with_auth.png' });
  console.log('SCREENSHOT_SAVED');
});
