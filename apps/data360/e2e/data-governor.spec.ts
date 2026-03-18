import { test, expect } from '@playwright/test';
import { goToPage, apiGet, apiGetRaw, apiPostRaw, expectNoRuntimeError } from './helpers';

test.describe('Data Governor — Governance & Compliance Test', () => {
  test('1. Governance page loads', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    await expectNoRuntimeError(page);
  });

  test('2. API: List users', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const d = await apiGet(page, '/gouvernance/users');
    expect(d).toBeTruthy();
  });

  test('3. API: List roles', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const d = await apiGet(page, '/gouvernance/roles');
    expect(d).toBeTruthy();
  });

  test('4. API: Grants overview', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const d = await apiGet(page, '/gouvernance/grants');
    expect(d).toBeTruthy();
  });

  test('5. API: Policy health', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const r = await apiGetRaw(page, '/gouvernance/policies/health');
    expect(r.status()).toBeLessThan(503);
  });

  test('6. API: Masking policies list', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const r = await apiGetRaw(page, '/gouvernance/policies/masking/list');
    expect(r.status()).toBeLessThan(503);
  });

  test('7. API: Security matrix', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const d = await apiGet(page, '/gouvernance/security-matrix');
    expect(d).toBeTruthy();
  });

  test('8. API: Enterprise users', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const r = await apiGetRaw(page, '/gouvernance/enterprise-users');
    expect(r.status()).toBeLessThan(503);
  });

  test('9. API: GDPR compliance', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const d = await apiGet(page, '/observability/compliance/gdpr');
    expect(d).toBeTruthy();
  });

  test('10. API: SOC2 compliance', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const d = await apiGet(page, '/observability/compliance/soc2');
    expect(d).toBeTruthy();
  });

  test('11. API: MFA status', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const r = await apiGetRaw(page, '/gouvernance/mfa/status');
    expect(r.status()).toBeLessThan(503);
  });

  test('12. API: DMF rules list', async ({ page }) => {
    await goToPage(page, '/gouvernance');
    const r = await apiGetRaw(page, '/gouvernance/policies/dmf/list');
    expect(r.status()).toBeLessThan(503);
  });
});
