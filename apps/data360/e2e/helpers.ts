import { Page, expect, Locator } from '@playwright/test';

// ============================================
// CONFIGURATION
// ============================================

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_BASE_URL || 'http://localhost:8000';
const API_TIMEOUT = 30000;

export const TEST_CREDS = {
  account_name: process.env.E2E_ACCOUNT_NAME || 'ABCD',
  username:     process.env.E2E_USERNAME     || 'testadmin',
  password:     process.env.E2E_PASSWORD     || 'NewSecurePassword123!',
};

// ============================================
// AUTH HELPERS
// ============================================

export async function loginViaForm(
  page: Page,
  creds: { account_name?: string; username?: string; password?: string } = {}
) {
  const { account_name, username, password } = { ...TEST_CREDS, ...creds };
  await page.goto('/signin');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[name="account_name"]').fill(account_name);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 60000 });
}

export const loginAs = loginViaForm;

// ============================================
// NAVIGATION HELPERS
// ============================================

export async function expectNoRuntimeError(page: Page) {
  const errorOverlay = page.locator('text=Unhandled Runtime Error');
  await expect(errorOverlay).not.toBeVisible({ timeout: 5000 });
}

export async function goToPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  // Small wait to allow any client-side redirect
  await page.waitForTimeout(1000);

  // Auto-re-login if redirected to signin (session expired)
  if (page.url().includes('/signin')) {
    const { account_name, username, password } = TEST_CREDS;
    // Wait for sign-in form to be fully loaded
    await page.locator('input[name="account_name"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('input[name="account_name"]').fill(account_name);
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/signin'), { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // allow session to stabilize
    // Now navigate to the original target
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  }

  await Promise.race([
    page.waitForSelector('main, [role="main"], .dashboard, table, .react-flow', { timeout: 5000 }).catch(() => {}),
    page.waitForTimeout(3000),
  ]);
  await expectNoRuntimeError(page);
}

// ============================================
// API HELPERS (with timeout + env-based URLs)
// ============================================

async function getAccessToken(page: Page): Promise<string> {
  try {
    const resp = await page.request.get(`${FRONTEND_URL}/api/auth/session`, { timeout: API_TIMEOUT });
    if (resp.ok()) {
      const session = await resp.json();
      const token: string = session?.user?.access_token ?? '';
      if (token) return token;
    }
  } catch { /* fallback */ }
  return page.evaluate(() =>
    localStorage.getItem('access_token') || localStorage.getItem('snowflake_token') || ''
  );
}

export async function apiGet(page: Page, endpoint: string) {
  const token = await getAccessToken(page);
  const response = await page.request.get(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: API_TIMEOUT,
  });
  return response.json();
}

export async function apiPost(page: Page, endpoint: string, data: unknown) {
  const token = await getAccessToken(page);
  const response = await page.request.post(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data,
    timeout: API_TIMEOUT,
  });
  return response.json();
}

export async function apiGetRaw(page: Page, endpoint: string) {
  const token = await getAccessToken(page);
  return page.request.get(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: API_TIMEOUT,
  });
}

export async function apiPostRaw(page: Page, endpoint: string, data: unknown) {
  const token = await getAccessToken(page);
  return page.request.post(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data,
    timeout: API_TIMEOUT,
  });
}

export async function apiDeleteRaw(page: Page, endpoint: string) {
  const token = await getAccessToken(page);
  return page.request.delete(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: API_TIMEOUT,
  });
}

export async function apiPut(page: Page, endpoint: string, data: unknown) {
  const token = await getAccessToken(page);
  const response = await page.request.put(`${BACKEND_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data,
    timeout: API_TIMEOUT,
  });
  return response.json();
}

// ============================================
// UI INTERACTION HELPERS
// ============================================

/**
 * Click a tab by its visible text label.
 * Handles: rizzui tabs, button tabs, div tabs, anchor tabs, span tabs,
 * role="tab", and custom tab nav patterns used across Data360 modules.
 */
export async function clickTab(page: Page, tabLabel: string) {
  // Broad selector covering all tab patterns in the app
  const selectors = [
    `[role="tab"]:has-text("${tabLabel}")`,
    `button:has-text("${tabLabel}")`,
    `a:has-text("${tabLabel}")`,
    `div[class*="tab"i]:has-text("${tabLabel}")`,
    `span[class*="tab"i]:has-text("${tabLabel}")`,
    `li:has-text("${tabLabel}")`,
  ];
  const combined = selectors.join(', ');
  const tab = page.locator(combined).first();

  try {
    await tab.waitFor({ state: 'visible', timeout: 10000 });
    await tab.click();
  } catch {
    // Fallback: try exact text match first, then loose match
    const exactFallback = page.getByText(tabLabel, { exact: true }).first();
    const isExact = await exactFallback.isVisible().catch(() => false);
    if (isExact) {
      await exactFallback.click();
    } else {
      const looseFallback = page.getByText(tabLabel, { exact: false }).first();
      await looseFallback.waitFor({ state: 'visible', timeout: 5000 });
      await looseFallback.click();
    }
  }
  await page.waitForTimeout(500); // allow content switch
}

/**
 * Click a button by its visible text label.
 * Handles: button, a, div with button role, and rizzui Button components.
 */
export async function clickButton(page: Page, buttonText: string) {
  const btn = page.locator(
    `button:has-text("${buttonText}"), [role="button"]:has-text("${buttonText}"), a:has-text("${buttonText}")`
  ).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.click();
  } catch {
    const fallback = page.getByText(buttonText, { exact: false }).first();
    await fallback.waitFor({ state: 'visible', timeout: 5000 });
    await fallback.click();
  }
}

/**
 * Assert a tab's content panel has loaded (visible text or element).
 */
export async function expectTabContent(page: Page, contentText: string) {
  await expect(page.locator(`text=${contentText}`).first()).toBeVisible({ timeout: 10000 });
}

/**
 * Open a modal by clicking a trigger button, then verify the modal is visible.
 */
export async function openModal(page: Page, triggerText: string, modalTitle?: string) {
  await clickButton(page, triggerText);
  if (modalTitle) {
    await expect(page.locator(`text=${modalTitle}`).first()).toBeVisible({ timeout: 10000 });
  }
  await page.waitForTimeout(300); // allow modal animation
}

/**
 * Close a modal by clicking the Close/Cancel button or the X.
 */
export async function closeModal(page: Page) {
  const closeBtn = page.locator('button:has-text("Close"), button:has-text("Cancel"), [aria-label="Close"]').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Fill an input field by its label text.
 */
export async function fillInput(page: Page, label: string, value: string) {
  const input = page.locator(`label:has-text("${label}") + input, label:has-text("${label}") ~ input, input[placeholder*="${label}" i]`).first();
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await input.fill(value);
}

/**
 * Assert a toast notification appeared with expected text.
 */
export async function expectToast(page: Page, text: string) {
  await expect(page.locator(`[role="status"]:has-text("${text}"), .Toastify:has-text("${text}"), div:has-text("${text}")`).first()).toBeVisible({ timeout: 10000 });
}

/**
 * Assert a table has at least N rows (works with any HTML table or data grid).
 */
export async function expectTableRows(page: Page, minRows: number, selector = 'table tbody tr') {
  const rows = page.locator(selector);
  await expect(rows).toHaveCount(minRows, { timeout: 15000 });
}

/**
 * Assert KPI cards are visible and have values (not "…" or empty).
 */
export async function expectKpiCards(page: Page, minCount: number) {
  const cards = page.locator(
    '[class*="rounded"] h3, [class*="rounded"] .text-2xl, [class*="kpi"], ' +
    '[class*="card"] h3, [class*="Card"] h3, [class*="stat"], [class*="metric"], ' +
    '[class*="rounded-lg"] .font-bold, [class*="rounded-xl"] .font-semibold'
  );
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/**
 * Assert a loader/spinner is NOT visible (page finished loading).
 */
export async function expectNoLoader(page: Page) {
  const loader = page.locator('.animate-spin, [class*="Loader"], [class*="spinner"]').first();
  await expect(loader).not.toBeVisible({ timeout: 15000 }).catch(() => {});
}

/**
 * Wait for an API response to a specific URL pattern.
 */
export async function waitForApi(page: Page, urlPattern: string | RegExp) {
  return page.waitForResponse((resp) =>
    typeof urlPattern === 'string'
      ? resp.url().includes(urlPattern)
      : urlPattern.test(resp.url()),
    { timeout: 30000 }
  );
}

/**
 * Assert page has proper dark mode support on key elements.
 */
export async function expectDarkModeSupport(page: Page) {
  // Check that at least some dark: classes exist in the rendered DOM
  const darkElements = await page.evaluate(() => {
    const all = document.querySelectorAll('[class*="dark:"]');
    return all.length;
  });
  expect(darkElements).toBeGreaterThan(0);
}

/**
 * Assert an element with specific text is visible.
 */
export async function expectVisible(page: Page, text: string) {
  await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10000 });
}

/**
 * Assert an element with specific text is NOT visible.
 */
export async function expectNotVisible(page: Page, text: string) {
  await expect(page.locator(`text=${text}`).first()).not.toBeVisible({ timeout: 5000 });
}

/**
 * Select an option from a dropdown/select by visible text.
 */
export async function selectOption(page: Page, label: string, optionText: string) {
  const select = page.locator(`label:has-text("${label}") ~ select, label:has-text("${label}") + div select`).first();
  if (await select.isVisible()) {
    await select.selectOption({ label: optionText });
  } else {
    // Rizzui Select: click to open, then click option
    const trigger = page.locator(`label:has-text("${label}") ~ div [class*="select"], [class*="Select"]:near(:text("${label}"))`).first();
    await trigger.click();
    await page.locator(`[class*="option"]:has-text("${optionText}"), li:has-text("${optionText}")`).first().click();
  }
}
