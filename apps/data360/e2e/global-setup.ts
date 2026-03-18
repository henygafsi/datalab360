/**
 * Global setup: log in once via the /signin form and save the NextAuth
 * session cookie to e2e/auth-state.json.  All tests then reuse this
 * storage state so we only pay the Snowflake auth round-trip one time.
 */
import { chromium, FullConfig } from '@playwright/test';
import { TEST_CREDS } from './helpers';

const BACKEND_URL = process.env.BACKEND_BASE_URL || 'http://localhost:8000';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('[global-setup] Logging in via /signin form …');

  // Navigate to signin
  await page.goto(`${baseURL}/signin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[name="account_name"]', { timeout: 30000 });

  // Fill credentials
  await page.locator('input[name="account_name"]').fill(TEST_CREDS.account_name);
  await page.locator('input[name="username"]').fill(TEST_CREDS.username);
  await page.locator('input[name="password"]').fill(TEST_CREDS.password);
  await page.locator('button[type="submit"]').click();

  // Wait for auth to complete
  try {
    await Promise.race([
      page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 60000 }),
      page.waitForFunction(() => {
        return document.cookie.includes('next-auth.session-token') ||
               document.cookie.includes('__Secure-next-auth.session-token');
      }, { timeout: 60000 }),
      page.waitForSelector('[class*="dashboard"], [role="main"], main', { timeout: 60000 }),
    ]);
  } catch {
    console.log('[global-setup] Wait timed out, checking session state...');
  }

  // Verify session — FAIL if no valid auth
  let authenticated = false;

  try {
    const sessionResp = await page.request.get(`${baseURL}/api/auth/session`, { timeout: 15000 });
    const session = await sessionResp.json();
    if (session?.user?.access_token) {
      console.log('[global-setup] Login successful via NextAuth, user:', session.user.username);
      authenticated = true;
    }
  } catch (err) {
    console.log('[global-setup] NextAuth session check failed:', err);
  }

  if (!authenticated) {
    // Fallback: authenticate directly via backend API
    console.log('[global-setup] No NextAuth session, trying direct backend auth...');
    try {
      const backendResp = await page.request.post(`${BACKEND_URL}/signin`, {
        data: {
          account_name: TEST_CREDS.account_name,
          username: TEST_CREDS.username,
          password: TEST_CREDS.password,
        },
        timeout: 30000,
      });
      const backendData = await backendResp.json();
      if (backendData.access_token) {
        await page.evaluate((token: string) => {
          localStorage.setItem('access_token', token);
          localStorage.setItem('snowflake_token', token);
        }, backendData.access_token);
        console.log('[global-setup] Backend auth successful, token stored in localStorage');
        authenticated = true;
      }
    } catch (err) {
      console.error('[global-setup] Backend auth also failed:', err);
    }
  }

  if (!authenticated) {
    await browser.close();
    throw new Error('[global-setup] FATAL: Could not authenticate. Check credentials and server status.');
  }

  console.log('[global-setup] Current URL:', page.url());

  // Persist cookies + localStorage to file
  await context.storageState({ path: 'e2e/auth-state.json' });
  await browser.close();
}

export default globalSetup;
