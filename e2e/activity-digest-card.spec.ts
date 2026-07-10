import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(10 * 60_000);
test('account-overview platform-activity lane shows the Activity digest card', async ({ page }) => {
  page.on('response', (r) => {
    if (r.url().includes('/org-accounts/platform-activity')) {
      console.log('NET:', r.status(), r.url().replace(/^https?:\/\/[^/]+/, ''));
    }
  });
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  await page.goto('/account-overview');
  // Open the Platform Activity lane (tab-mounted; the digest self-loads there).
  await page.getByText('Platform Activity', { exact: true }).first().click({ timeout: 120_000 });

  const card = page.getByTestId('activity-digest-card');
  // Cold Cortex inference can take ~20s (cached 900s server-side) — wait it out.
  await expect(card).toBeVisible({ timeout: 240_000 });
  await expect(card).toContainText(/Activity digest · last \d+h/);
  await expect(card).toContainText(/Basis — what COCO read/i);

  const text = await card.innerText();
  console.log('DIGEST_TEXT:', text.replace(/\n/g, ' | ').slice(0, 600));
  // Either a real narrative or the honest degrade line — never a fake one.
  expect(text).toMatch(/NEXT:|brief|Digest unavailable/i);
  // No error boundary anywhere on the page.
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/results/activity-digest-card.png', fullPage: false });
});
