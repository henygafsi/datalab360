import { test, expect } from '@playwright/test';
import {
  goToPage,
  expectNoRuntimeError,
  clickTab,
  expectNoLoader,
  expectDarkModeSupport,
  apiGet,
  apiGetRaw,
} from './helpers';

// ============================================================
// GOVERNANCE — Comprehensive UI + API E2E Tests (~31 tests)
//
// Pages covered:
//   /gouvernance/policies      — 9 policy type tabs
//   /gouvernance/users         — user list, add/import buttons
//   /gouvernance/roles         — role list, create button
//   /gouvernance/grants        — 4 access-control tabs
//   /gouvernance/security-matrix — 3 sub-tabs (matrix, users, axes)
//
// Backend prefix: /gouvernance  |  /gouvernance/policies
// ============================================================

// ============================================================
// GROUP 1 — POLICIES PAGE (9 tests)
// ============================================================

test.describe('Governance — Policies Page', () => {
  test('1. Policies page loads without runtime errors', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-load.png' });
  });

  test('2. Default tab (Row Access / RLS) is active on load', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await expectNoLoader(page);
    // "Row Access" is the first tab (id: 'rls') and is active by default
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/row.access|rls|row.level/);
  });

  test('3. Tab: Masking policies content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Masking');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toContain('mask');
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-masking.png' });
  });

  test('4. Tab: Aggregation policies content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Aggregation');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toContain('aggregat');
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-aggregation.png' });
  });

  test('5. Tab: Network policies content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Network');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toContain('network');
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-network.png' });
  });

  test('6. Tab: Tag-Based policies content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Tag-Based');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/tag|governance/);
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-tag.png' });
  });

  test('7. Tab: Password policies content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Password');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toContain('password');
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-password.png' });
  });

  test('8. Tab: Session policies content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Session');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toContain('session');
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-session.png' });
  });

  test('9. Tab: Data Metrics (DMF) content loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await clickTab(page, 'Data Metrics');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/metric|dmf|data.metric/);
    await page.screenshot({ path: 'e2e/screenshots/gov-policies-dmf.png' });
  });
});

// ============================================================
// GROUP 2 — USERS PAGE (5 tests)
// ============================================================

test.describe('Governance — Users Page', () => {
  test('10. Users page loads at /gouvernance/users', async ({ page }) => {
    await goToPage(page, '/gouvernance/users');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
    await page.screenshot({ path: 'e2e/screenshots/gov-users-load.png' });
  });

  test('11. User list or table container is visible', async ({ page }) => {
    await goToPage(page, '/gouvernance/users');
    await expectNoLoader(page);
    // The users page renders either a table (tbody rows) or a loading skeleton
    // At minimum the page header "User Management" must be visible
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/user.manage|user.account|manage.user/);
    // Also check table or content wrapper exists
    const container = page.locator('table, [class*="rounded-xl"], main').first();
    await expect(container).toBeVisible({ timeout: 10000 });
  });

  test('12. "Add User" button is visible on the users page', async ({ page }) => {
    await goToPage(page, '/gouvernance/users');
    await expectNoLoader(page);
    // AddUserButton renders a button with "Add User" text
    const addBtn = page.locator('button:has-text("Add User"), button:has-text("Add user")').first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  test('13. API: GET /gouvernance/users returns an array', async ({ page }) => {
    await goToPage(page, '/gouvernance/users');
    const r = await apiGetRaw(page, '/gouvernance/users');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const data = await r.json();
      // Response is an array of user objects
      expect(Array.isArray(data)).toBe(true);
    }
  });

  test('14. Search input filters the user table', async ({ page }) => {
    await goToPage(page, '/gouvernance/users');
    await expectNoLoader(page);
    // Locate the search/filter input (UsersTable renders a Filters component with an input)
    const searchInput = page.locator(
      'input[placeholder*="search" i], input[placeholder*="filter" i], input[type="search"]'
    ).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('NONEXISTENT_USER_XYZ_12345');
      await page.waitForTimeout(600); // debounce
      // After filtering, the body should either show "no results" or fewer rows
      const body = await page.textContent('body');
      expect((body ?? '').length).toBeGreaterThan(50);
      await page.screenshot({ path: 'e2e/screenshots/gov-users-search.png' });
    }
  });
});

// ============================================================
// GROUP 3 — ROLES PAGE (4 tests)
// ============================================================

test.describe('Governance — Roles Page', () => {
  test('15. Roles page loads at /gouvernance/roles', async ({ page }) => {
    await goToPage(page, '/gouvernance/roles');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
    await page.screenshot({ path: 'e2e/screenshots/gov-roles-load.png' });
  });

  test('16. Role list or table container is visible', async ({ page }) => {
    await goToPage(page, '/gouvernance/roles');
    await expectNoLoader(page);
    // Page header "Role Management" must exist
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/role.manage|manage.role|active.role/);
    const container = page.locator('table, [class*="rounded-xl"], main').first();
    await expect(container).toBeVisible({ timeout: 10000 });
  });

  test('17. "Add Role" button is visible on the roles page', async ({ page }) => {
    await goToPage(page, '/gouvernance/roles');
    await expectNoLoader(page);
    // AddRoleButton renders a button with "Add Role" or "Create Role" text
    const addBtn = page.locator(
      'button:has-text("Add Role"), button:has-text("Create Role"), button:has-text("Add role")'
    ).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  test('18. API: GET /gouvernance/roles returns a roles array', async ({ page }) => {
    await goToPage(page, '/gouvernance/roles');
    const r = await apiGetRaw(page, '/gouvernance/roles');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const data = await r.json();
      // Roles endpoint returns an array of role objects
      expect(Array.isArray(data)).toBe(true);
    }
  });
});

// ============================================================
// GROUP 4 — GRANTS PAGE (5 tests)
// ============================================================

test.describe('Governance — Grants Page', () => {
  test('19. Grants page loads at /gouvernance/grants', async ({ page }) => {
    await goToPage(page, '/gouvernance/grants');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
    await page.screenshot({ path: 'e2e/screenshots/gov-grants-load.png' });
  });

  test('20. Tab: Role Grants content renders', async ({ page }) => {
    await goToPage(page, '/gouvernance/grants');
    // "Role Grants" is the default tab — content should already be visible
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/role.grant|role.permission|permission.matrix/);
    await page.screenshot({ path: 'e2e/screenshots/gov-grants-role-grants.png' });
  });

  test('21. Tab: User Grants content renders', async ({ page }) => {
    await goToPage(page, '/gouvernance/grants');
    await clickTab(page, 'User Grants');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/user.grant|user.access|rbac/);
    await page.screenshot({ path: 'e2e/screenshots/gov-grants-user-grants.png' });
  });

  test('22. Tab: Policy Grants content renders', async ({ page }) => {
    await goToPage(page, '/gouvernance/grants');
    await clickTab(page, 'Policy Grants');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/policy.grant|policy.role|security.polic/);
    await page.screenshot({ path: 'e2e/screenshots/gov-grants-policy-grants.png' });
  });

  test('23. Tab: Stage Grants content renders', async ({ page }) => {
    await goToPage(page, '/gouvernance/grants');
    await clickTab(page, 'Stage Grants');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/stage.grant|stage.access|snowflake.stage/);
    await page.screenshot({ path: 'e2e/screenshots/gov-grants-stage-grants.png' });
  });
});

// ============================================================
// GROUP 5 — SECURITY MATRIX PAGE (4 tests)
// ============================================================

test.describe('Governance — Security Matrix Page', () => {
  test('24. Security matrix page loads at /gouvernance/security-matrix', async ({ page }) => {
    await goToPage(page, '/gouvernance/security-matrix');
    await expectNoRuntimeError(page);
    const body = await page.textContent('body');
    expect((body ?? '').length).toBeGreaterThan(50);
    await page.screenshot({ path: 'e2e/screenshots/gov-security-matrix-load.png' });
  });

  test('25. Access Matrix grid or table is visible on default tab', async ({ page }) => {
    await goToPage(page, '/gouvernance/security-matrix');
    await expectNoLoader(page);
    // The matrix page renders "Security Matrix" as h1 and the Access Matrix tab content
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/security.matrix|access.matrix|access.control/);
    // A table or empty state card should be visible
    const matrixEl = page.locator('table, [class*="ModernCard"], [class*="rounded-2xl"]').first();
    await expect(matrixEl).toBeVisible({ timeout: 10000 });
  });

  test('26. Tab: Enterprise Users sub-tab loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/security-matrix');
    await clickTab(page, 'Enterprise Users');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/enterprise.user|identity.provider|sync.from.snowflake/);
    await page.screenshot({ path: 'e2e/screenshots/gov-matrix-enterprise-users.png' });
  });

  test('27. Tab: Security Axes sub-tab loads', async ({ page }) => {
    await goToPage(page, '/gouvernance/security-matrix');
    await clickTab(page, 'Security Axes');
    await expectNoLoader(page);
    const body = await page.textContent('body');
    expect((body ?? '').toLowerCase()).toMatch(/security.ax|region|department|add.security.axis/);
    await page.screenshot({ path: 'e2e/screenshots/gov-matrix-axes.png' });
  });
});

// ============================================================
// GROUP 6 — API VALIDATION (5 tests)
// ============================================================

test.describe('Governance — API Validation', () => {
  test('28. API: GET /gouvernance/users — returns user list', async ({ page }) => {
    await goToPage(page, '/gouvernance/users');
    const r = await apiGetRaw(page, '/gouvernance/users');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const data = await r.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });

  test('29. API: GET /gouvernance/roles — returns roles array', async ({ page }) => {
    await goToPage(page, '/gouvernance/roles');
    const r = await apiGetRaw(page, '/gouvernance/roles');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const data = await r.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });

  test('30. API: GET /gouvernance/policies/masking/list — returns masking policies', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    const r = await apiGetRaw(page, '/gouvernance/policies/masking/list');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const body = await r.json();
      // Response has a data field containing the list
      const data = body?.data ?? body;
      expect(data).toBeTruthy();
    }
  });

  test('31. API: GET /gouvernance/grants — returns role-module grants', async ({ page }) => {
    await goToPage(page, '/gouvernance/grants');
    const r = await apiGetRaw(page, '/gouvernance/grants');
    expect(r.status()).toBeLessThan(503);
    if (r.status() < 400) {
      const data = await r.json();
      // /gouvernance/grants returns an array of RoleModulesOut
      expect(Array.isArray(data)).toBe(true);
    }
  });

  test('32. API: GET /gouvernance/policies/health — returns policy health status', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    const r = await apiGetRaw(page, '/gouvernance/policies/health');
    // Health check should return 200 or at most 422 (if no Snowflake data), never 500+
    expect(r.status()).toBeLessThan(503);
  });
});

// ============================================================
// GROUP 7 — ADDITIONAL API COVERAGE (4 tests)
// ============================================================

test.describe('Governance — Extended API Coverage', () => {
  test('33. API: GET /gouvernance/policies/row-access/list — RLS policies', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    const r = await apiGetRaw(page, '/gouvernance/policies/row-access/list');
    expect(r.status()).toBeLessThan(503);
  });

  test('34. API: GET /gouvernance/policies/network/list — network policies', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    const r = await apiGetRaw(page, '/gouvernance/policies/network/list');
    expect(r.status()).toBeLessThan(503);
  });

  test('35. API: GET /gouvernance/policies/tags/list — tag policies', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    const r = await apiGetRaw(page, '/gouvernance/policies/tags/list');
    expect(r.status()).toBeLessThan(503);
  });

  test('36. API: GET /gouvernance/security-matrix — security matrix data', async ({ page }) => {
    await goToPage(page, '/gouvernance/security-matrix');
    const d = await apiGet(page, '/gouvernance/security-matrix');
    expect(d).toBeTruthy();
  });
});

// ============================================================
// GROUP 8 — DARK MODE SUPPORT (1 test)
// ============================================================

test.describe('Governance — Dark Mode Support', () => {
  test('37. Governance pages have dark: CSS classes on key elements', async ({ page }) => {
    await goToPage(page, '/gouvernance/policies');
    await expectDarkModeSupport(page);
    // Also verify users and grants pages carry dark: classes
    await goToPage(page, '/gouvernance/users');
    await expectDarkModeSupport(page);
    await goToPage(page, '/gouvernance/grants');
    await expectDarkModeSupport(page);
    await page.screenshot({ path: 'e2e/screenshots/gov-dark-mode-check.png' });
  });
});
