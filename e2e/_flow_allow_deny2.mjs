import { chromium } from '@playwright/test';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const AUTH_STATE = 'e2e/.auth/state.json';
const SCREEN_DIR = 'docs/product-readiness-audit/screens/allow-deny-flow';

let stepIdx = 100;
async function shot(page, label) {
  stepIdx++;
  const num = String(stepIdx).padStart(3, '0');
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = path.join(SCREEN_DIR, `${num}_${safe}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[screenshot] ${file}`);
  return file;
}

const worked = [];
const failed = [];
const defects = [];

async function goto(page, url) {
  // Use domcontentloaded to avoid SSE networkidle timeout
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  const errors500 = [];
  page.on('response', resp => {
    if (resp.status() >= 500) errors500.push(`${resp.status()} ${resp.url().slice(0,120)}`);
  });

  // ── A. Access Requests tab (approval inbox) ──
  await goto(page, `${BASE_URL}/administration/access-center`);
  await shot(page, 'A1_access_center_fresh');

  // Click the "Access Requests" sub-tab
  const accessReqTab = await page.$('button:has-text("Access Requests"), [role="tab"]:has-text("Access Requests")');
  if (accessReqTab) {
    await accessReqTab.click();
    await page.waitForTimeout(2000);
    await shot(page, 'A2_access_requests_tab');
    worked.push('Opened Access Requests tab');

    // Check content
    const items = await page.$$('tr, [class*="request-row"], [class*="inbox-item"]');
    console.log(`[info] Access request rows: ${items.length}`);
    if (items.length === 0) {
      defects.push('Access Requests tab appears empty — no pending approvals visible');
    }
  } else {
    failed.push('Access Requests sub-tab not found');
  }

  // ── B. Roles & Permissions tab — select a role to see deny matrix ──
  const rolesPermTab = await page.$('[role="tab"]:has-text("Roles & Permissions"), button:has-text("Roles & Permissions")');
  if (rolesPermTab) {
    await rolesPermTab.click();
    await page.waitForTimeout(1500);
    await shot(page, 'B1_roles_permissions_tab');
    worked.push('Opened Roles & Permissions tab');

    // Select Data Steward role from dropdown
    const roleSelect = await page.$('button:has-text("Data Steward"), [class*="role-select"], select');
    if (roleSelect) {
      await roleSelect.click();
      await page.waitForTimeout(1000);
      await shot(page, 'B2_role_selector_open');
    }

    // Scroll down to see the deny rows in the matrix
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(800);
    await shot(page, 'B3_deny_matrix_rows');

    // Look for deny indicators
    const denyBadges = await page.$$('[class*="deny"], [style*="red"], span:has-text("deny"), span:has-text("denied")');
    console.log(`[info] Deny badges in role matrix: ${denyBadges.length}`);

    // Click on a deny cell to see if there's an explanation
    if (denyBadges.length > 0) {
      await denyBadges[0].hover();
      await page.waitForTimeout(600);
      await shot(page, 'B4_deny_hover_tooltip');

      // Check for tooltip content
      const tooltip = await page.$('[role="tooltip"], [class*="tooltip"]');
      if (tooltip) {
        const text = await tooltip.textContent();
        console.log(`[info] Deny tooltip text: ${text}`);
        worked.push(`Deny tooltip visible: "${text?.slice(0,100)}"`);
      } else {
        defects.push('Deny cell has no tooltip/explanation — user cannot see WHY action is denied');
      }
    }
  } else {
    failed.push('Roles & Permissions tab not found');
  }

  // ── C. Governance grants — Edit Modules modal ──
  await goto(page, `${BASE_URL}/governance/grants`);
  await shot(page, 'C1_governance_grants');

  // Click "Edit Modules" button for first role
  const editModBtn = await page.$('button:has-text("Edit Modules")');
  if (editModBtn) {
    await editModBtn.click();
    await page.waitForTimeout(2000);
    await shot(page, 'C2_edit_modules_modal');
    worked.push('Opened Edit Modules modal on grants page');

    // Look for allow/deny toggles inside the modal
    const modal = await page.$('[role="dialog"], [class*="modal"], [class*="Dialog"]');
    if (modal) {
      worked.push('Modal/dialog confirmed open');
      const toggles = await modal.$$('[role="switch"], input[type="checkbox"], [class*="toggle"]');
      console.log(`[info] Toggles in modal: ${toggles.length}`);

      await shot(page, 'C3_modal_content');

      // Close the modal
      const cancelBtn = await page.$('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"], [aria-label="close"]');
      if (cancelBtn) {
        await cancelBtn.click();
        await page.waitForTimeout(800);
        worked.push('Cancelled Edit Modules modal');
        await shot(page, 'C4_modal_cancelled');
      } else {
        // Try Escape key
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        worked.push('Dismissed modal via Escape');
        await shot(page, 'C4_modal_escaped');
      }
    } else {
      defects.push('Edit Modules clicked but no modal/dialog element found — may be inline editing');
    }
  } else {
    failed.push('Edit Modules button not found on grants page');
  }

  // ── D. Grant Matrix tab ──
  const grantMatrixTab = await page.$('[role="tab"]:has-text("Grant Matrix"), button:has-text("Grant Matrix")');
  if (grantMatrixTab) {
    await grantMatrixTab.click();
    await page.waitForTimeout(2000);
    await shot(page, 'D1_grant_matrix_tab');
    worked.push('Opened Grant Matrix tab');

    // Scroll to see full matrix
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(600);
    await shot(page, 'D2_grant_matrix_scrolled');
  }

  // ── E. RBAC tab ──
  const rbacTab = await page.$('[role="tab"]:has-text("RBAC"), button:has-text("RBAC")');
  if (rbacTab) {
    await rbacTab.click();
    await page.waitForTimeout(2000);
    await shot(page, 'E1_rbac_tab');
    worked.push('Opened RBAC tab');
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(600);
    await shot(page, 'E2_rbac_scrolled');
  }

  // ── F. Security Matrix — check all three tabs ──
  await goto(page, `${BASE_URL}/governance/security-matrix`);
  await shot(page, 'F1_security_matrix_landing');

  // Enterprise Users tab
  const euTab = await page.$('[role="tab"]:has-text("Enterprise Users")');
  if (euTab) {
    await euTab.click();
    await page.waitForTimeout(2000);
    await shot(page, 'F2_enterprise_users_tab');
    worked.push('Opened Enterprise Users tab on security matrix');
  }

  // Security Axes tab
  const saTab = await page.$('[role="tab"]:has-text("Security Axes")');
  if (saTab) {
    await saTab.click();
    await page.waitForTimeout(2000);
    await shot(page, 'F3_security_axes_tab');
    worked.push('Opened Security Axes tab on security matrix');
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(600);
    await shot(page, 'F4_security_axes_scrolled');
  }

  // ── G. Access Center — Provisioning tab ──
  await goto(page, `${BASE_URL}/administration/access-center`);
  const provTab = await page.$('[role="tab"]:has-text("Provisioning")');
  if (provTab) {
    await provTab.click();
    await page.waitForTimeout(2000);
    await shot(page, 'G1_provisioning_tab');
    worked.push('Opened Provisioning tab');
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(600);
    await shot(page, 'G2_provisioning_scrolled');
  }

  // ── H. Check RoleGrantsPanel for deny explanation transparency ──
  // Admin panel role grants
  await goto(page, `${BASE_URL}/admin/platform-settings`);
  await shot(page, 'H1_admin_platform_settings');
  worked.push('Visited admin platform settings');

  // ── I. Summary of 500 errors ──
  console.log(`\n[info] 500 errors encountered: ${errors500.length}`);
  errors500.forEach(e => console.log(`  ${e}`));

  await browser.close();

  console.log('\n=== WORKED ===');
  worked.forEach(w => console.log(' +', w));
  console.log('\n=== FAILED ===');
  failed.forEach(f => console.log(' -', f));
  console.log('\n=== DEFECTS ===');
  defects.forEach(d => console.log(' !', d));
  console.log('\n=== 500s ===');
  errors500.forEach(e => console.log(' 5xx:', e));
})();
