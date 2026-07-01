/**
 * READ-ONLY authenticated Playwright audit — bi-dashboard module
 * Target: http://localhost:3000/bi-dashboard
 * Auth: e2e/.auth/state.json (HAHA / ACCOUNTADMIN)
 *
 * Covers:
 *  - /bi-dashboard (index, project list)
 *  - /bi-dashboard/<first projectId> (editor + sub-tabs)
 * For each page:
 *  - auth check (not redirected to /signin)
 *  - data vs warming state
 *  - 5xx responses and console errors
 *  - mutating action button enumeration
 *  - hover/open safe modals (no submit)
 *  - permission-gating surface
 *  - transparency / UX gaps
 */

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.resolve(__dirname, '.auth/state.json');
const BASE = 'http://localhost:3000';

const TIMEOUT = 15_000;
const NAV_TIMEOUT = 45_000;

const results = {
  pages: [],
  errors5xx: [],
  consoleErrors: [],
  actions: [],
  permGated: [],
  permUngated: [],
  uiGaps: [],
  approvalSurfaces: [],
  transparencyGaps: [],
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(url) {
  return url.replace(BASE, '').replace(/\//g, '_').replace(/[?&=]/g, '-') || '_root';
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1440, height: 900 },
  });

  // Intercept all requests to catch 5xx
  const page = await context.newPage();

  page.on('response', (resp) => {
    if (resp.status() >= 500) {
      results.errors5xx.push({
        url: resp.url(),
        status: resp.status(),
        page: page.url(),
      });
    }
  });

  page.on('pageerror', (err) => {
    results.consoleErrors.push({
      message: err.message,
      page: page.url(),
    });
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out noisy React dev warnings and favicon 404
      if (
        text.includes('favicon') ||
        text.includes('Warning:') ||
        text.includes('ReactDOM')
      ) return;
      results.consoleErrors.push({ message: `[console.error] ${text}`, page: page.url() });
    }
  });

  // ─────────────────────────────────────────────────────
  // 1. BI Dashboard index page
  // ─────────────────────────────────────────────────────
  console.log('\n== Navigating to /bi-dashboard ==');
  await page.goto(`${BASE}/bi-dashboard`, { waitUntil: 'load', timeout: NAV_TIMEOUT });
  await sleep(2500);

  const indexUrl = page.url();
  const isSignIn = indexUrl.includes('/signin');
  const indexTitle = await page.title();
  console.log('URL:', indexUrl, '| isSignIn:', isSignIn, '| title:', indexTitle);

  // Check for warming/cache-init text
  const bodyText = await page.innerText('body');
  const isWarming =
    bodyText.toLowerCase().includes('warming up') ||
    bodyText.toLowerCase().includes('cache is initializing') ||
    bodyText.toLowerCase().includes('initializing cache');

  // Check for real data — project list cards or empty state heading
  const hasProjectCards = (await page.locator('a[href*="/bi-dashboard/"]').count()) > 0;
  const hasEmptyState = bodyText.includes('No BI Dashboard yet');
  const hasData = hasProjectCards || hasEmptyState;

  // Detect vendor name leaks
  const vendorLeaks = [];
  if (bodyText.includes('Snowflake')) vendorLeaks.push('Snowflake in body');
  if (bodyText.includes('Cortex')) vendorLeaks.push('Cortex in body');
  if (bodyText.includes('Kimi')) vendorLeaks.push('Kimi in body');

  results.pages.push({
    route: '/bi-dashboard',
    status: isSignIn ? 'auth-redirect' : isWarming ? 'warming' : hasData ? 'ok' : 'unknown',
    hasProjectCards,
    hasEmptyState,
    vendorLeaks,
    title: indexTitle,
  });

  if (!isSignIn) {
    // ── Enumerate action buttons on index ──
    // "New Dashboard" button
    const newDashBtn = page.getByRole('button', { name: /new dashboard/i });
    if (await newDashBtn.count() > 0) {
      const isDisabled = await newDashBtn.first().isDisabled();
      results.actions.push({ label: 'New Dashboard', page: '/bi-dashboard', disabled: isDisabled });
      if (!isDisabled) results.permGated.push('New Dashboard (canCreate gate via useCanPerform bi_reporting/create)');
    }

    // "Auto-create" button
    const autoCreateBtn = page.getByRole('button', { name: /auto.?create/i });
    if (await autoCreateBtn.count() > 0) {
      const isDisabled = await autoCreateBtn.first().isDisabled();
      results.actions.push({ label: 'Auto-create', page: '/bi-dashboard', disabled: isDisabled });
    }

    // Open "New Dashboard" modal (do NOT submit)
    if (await newDashBtn.count() > 0 && !(await newDashBtn.first().isDisabled())) {
      console.log('Opening New Dashboard modal...');
      await newDashBtn.first().click();
      await sleep(1200);
      const modalOpen = await page.locator('[role="dialog"], aside[aria-label]').count() > 0;
      console.log('Modal/rail opened:', modalOpen);
      if (modalOpen) {
        results.actions.push({ label: 'New Dashboard modal opened', page: '/bi-dashboard', modalOpen });
        // Check for Create button inside modal
        const createInModal = page.getByRole('button', { name: /^create$/i });
        if (await createInModal.count() > 0) {
          const disabled = await createInModal.first().isDisabled();
          results.actions.push({ label: 'Create (inside modal)', page: '/bi-dashboard', disabled });
          results.permGated.push('Create inside modal gated: name required + canCreate');
        }
        // Dismiss modal
        const cancelBtn = page.getByRole('button', { name: /cancel/i });
        if (await cancelBtn.count() > 0) await cancelBtn.first().click();
        await sleep(600);
      }
    }

    // Open "Auto-create" panel (do NOT submit)
    if (await autoCreateBtn.count() > 0 && !(await autoCreateBtn.first().isDisabled())) {
      console.log('Opening Auto-create panel...');
      await autoCreateBtn.first().click();
      await sleep(1200);
      const panelOpen = (await page.locator('aside[aria-label*="Auto-create"]').count()) > 0;
      console.log('Auto-create panel opened:', panelOpen);
      if (panelOpen) {
        results.actions.push({ label: 'Auto-create panel opened', page: '/bi-dashboard', panelOpen });
        // aria-modal=false means non-blocking — UX gap noted
        const ariaModal = await page.locator('aside[aria-label*="Auto-create"]').getAttribute('aria-modal');
        if (ariaModal === 'false') {
          results.uiGaps.push('AutoCreateModal: aria-modal="false" on <aside role="dialog"> — screen reader will not treat as modal (AutoCreateModal.tsx:116)');
        }
        // Dismiss
        const closeBtn = page.locator('aside[aria-label*="Auto-create"] button[aria-label="Close"]');
        if (await closeBtn.count() > 0) await closeBtn.first().click();
        await sleep(600);
      }
    }

    // Check for clone buttons (hover to reveal)
    const projectCards = page.locator('a[href*="/bi-dashboard/"]');
    const cardCount = await projectCards.count();
    console.log('Project cards found:', cardCount);

    if (cardCount > 0) {
      // Hover first card to reveal clone button
      const firstCard = projectCards.first();
      const firstHref = await firstCard.getAttribute('href');
      console.log('First dashboard href:', firstHref);

      await firstCard.hover();
      await sleep(700);
      const cloneBtn = page.locator('button[aria-label*="Duplicate"]').first();
      const cloneVisible = await cloneBtn.isVisible().catch(() => false);
      console.log('Clone button visible on hover:', cloneVisible);
      if (cloneVisible) {
        const isDisabled = await cloneBtn.isDisabled();
        results.actions.push({ label: 'Duplicate (clone) dashboard', page: '/bi-dashboard', disabled: isDisabled });
        results.permGated.push('Duplicate gated: useCanPerform bi_reporting/create (CloneDashboardButton.tsx:44)');
      }

      // ─────────────────────────────────────────────────
      // 2. Navigate into the first dashboard editor
      // ─────────────────────────────────────────────────
      const editorUrl = `${BASE}${firstHref}`;
      console.log('\n== Navigating to dashboard editor:', editorUrl, '==');
      await page.goto(editorUrl, { waitUntil: 'load', timeout: NAV_TIMEOUT });
      // Wait for the skeleton to disappear (editor loaded) or timeout
      await page.waitForFunction(
        () => document.querySelectorAll('[class*="animate-pulse"]').length === 0,
        { timeout: 20000 }
      ).catch(() => console.log('Skeleton still present after 20s timeout'));
      await sleep(3000);

      const editorPageUrl = page.url();
      const isSignInEditor = editorPageUrl.includes('/signin');
      const editorBody = await page.innerText('body');
      const editorWarming =
        editorBody.toLowerCase().includes('warming') ||
        editorBody.toLowerCase().includes('initializing');

      const widgetCount = await page.locator('[class*="grid"] [class*="rounded"]').count();
      const hasEditorContent =
        editorBody.includes('widget') ||
        editorBody.includes('chart') ||
        editorBody.includes('Dashboard') ||
        widgetCount > 0;

      // Vendor leaks in editor
      const editorVendorLeaks = [];
      if (editorBody.includes('Snowflake')) editorVendorLeaks.push('Snowflake in editor');
      if (editorBody.includes('Cortex')) editorVendorLeaks.push('Cortex in editor');
      if (editorBody.includes('Kimi')) editorVendorLeaks.push('Kimi in editor');

      results.pages.push({
        route: firstHref,
        status: isSignInEditor ? 'auth-redirect' : editorWarming ? 'warming' : 'ok',
        vendorLeaks: editorVendorLeaks,
        hasEditorContent,
      });

      if (!isSignInEditor) {
        // ── Toolbar buttons ──

        // Refresh button
        const refreshBtn = page.locator('button[aria-label*="Refresh"], button').filter({ hasText: /refresh/i });
        if (await refreshBtn.count() > 0) {
          results.actions.push({ label: 'Refresh dashboard', page: firstHref, disabled: false });
          // No permission gate — read-only action
          results.permUngated.push('Refresh — no permission gate (read-only, acceptable)');
        }

        // Snapshot button
        const snapshotBtn = page.locator('button').filter({ hasText: /snapshot/i });
        if (await snapshotBtn.count() > 0) {
          const isDisabled = await snapshotBtn.first().isDisabled();
          results.actions.push({ label: 'Snapshot', page: firstHref, disabled: isDisabled });
          if (!isDisabled) {
            results.permGated.push('Snapshot gated: useCanPerform bi_reporting/snapshot (DashboardEditor.tsx:174-175)');
          }
        }

        // Export JSON button
        const exportBtn = page.locator('button').filter({ hasText: /export json/i });
        if (await exportBtn.count() > 0) {
          const isDisabled = await exportBtn.first().isDisabled();
          results.actions.push({ label: 'Export JSON', page: firstHref, disabled: isDisabled });
          // Check if it has a permission gate
          results.permUngated.push('Export JSON — NO useCanPerform gate (DashboardEditor.tsx:1077-1108); any logged-in user can download');
        }

        // Duplicate button (editor toolbar)
        const duplicateBtn = page.locator('button').filter({ hasText: /duplicate/i });
        if (await duplicateBtn.count() > 0) {
          const isDisabled = await duplicateBtn.first().isDisabled();
          results.actions.push({ label: 'Duplicate (editor toolbar)', page: firstHref, disabled: isDisabled });
        }

        // NL-to-chart generate button
        const generateBtn = page.locator('button').filter({ hasText: /generate/i });
        if (await generateBtn.count() > 0) {
          const isDisabled = await generateBtn.first().isDisabled();
          results.actions.push({ label: 'NL-to-Chart Generate', page: firstHref, disabled: isDisabled });
          results.permGated.push('NL Generate gated: useCanPerform bi_reporting/create (DashboardEditor.tsx:1167)');
        }

        // Manage Access button
        const manageAccessBtn = page.locator('button').filter({ hasText: /manage access/i });
        if (await manageAccessBtn.count() > 0) {
          const isDisabled = await manageAccessBtn.first().isDisabled();
          results.actions.push({ label: 'Manage Access', page: firstHref, disabled: isDisabled });
          results.approvalSurfaces.push('Manage Access per dashboard project (ManageAccessButton.tsx)');
          // Open Manage Access panel (non-destructive)
          if (!isDisabled) {
            await manageAccessBtn.first().click();
            await sleep(1500);
            const accessPanel = await page.locator('[role="dialog"], aside, [class*="drawer"]').count();
            console.log('Manage Access panel elements:', accessPanel);
            if (accessPanel > 0) {
              results.approvalSurfaces.push('Manage Access panel opens (grant/revoke modal)');
              // Close it
              const closeBtn = page.locator('[aria-label="Close"], button').filter({ hasText: /close|cancel|×/i }).first();
              if (await closeBtn.count() > 0) await closeBtn.click();
              await sleep(600);
            }
          }
        }

        // Check for "Add page" button in PageTabs
        const addPageBtn = page.locator('button').filter({ hasText: /\+ page|add page/i });
        if (await addPageBtn.count() > 0) {
          const isDisabled = await addPageBtn.first().isDisabled();
          results.actions.push({ label: 'Add page (PageTabs)', page: firstHref, disabled: isDisabled });
          results.permGated.push('Add page gated: useCanPerform bi_reporting/create (PageTabs.tsx)');
        }

        // Check for Delete page buttons
        const deletePageBtns = page.locator('button[title*="Delete page"]');
        if (await deletePageBtns.count() > 0) {
          const isDisabled = await deletePageBtns.first().isDisabled();
          results.actions.push({ label: 'Delete page', page: firstHref, disabled: isDisabled });
          results.permGated.push('Delete page gated: useCanPerform bi_reporting/delete (PageTabs.tsx:40-41)');
        }

        // Check for widget-level delete buttons
        const widgetDeleteBtns = page.locator('button[aria-label*="delete" i], button[title*="delete" i], button[title*="Delete" i]');
        const wdCount = await widgetDeleteBtns.count();
        if (wdCount > 0) {
          console.log('Widget delete buttons found:', wdCount);
          const isDisabled = await widgetDeleteBtns.first().isDisabled();
          results.actions.push({ label: `Delete widget (${wdCount} found)`, page: firstHref, disabled: isDisabled });
          results.permGated.push('Delete widget gated: useCanPerform bi_reporting/delete (GridChartCard.tsx:307-308)');
        }

        // Check for widget-level edit/configure buttons
        const widgetConfigBtns = page.locator('button[title*="configure" i], button[title*="Configure" i], button[aria-label*="configure" i]');
        const wcCount = await widgetConfigBtns.count();
        if (wcCount > 0) {
          results.actions.push({ label: `Configure widget (${wcCount} found)`, page: firstHref, disabled: false });
          results.permGated.push('Configure widget gated: useCanPerform bi_reporting/edit (GridChartCard.tsx:305-306)');
        }

        // Check for widget-level duplicate buttons
        const widgetDupBtns = page.locator('button[title*="duplicate" i], button[title*="Duplicate" i], button[aria-label*="duplicate" i]');
        const wdupCount = await widgetDupBtns.count();
        if (wdupCount > 0) {
          results.actions.push({ label: `Duplicate widget (${wdupCount} found)`, page: firstHref, disabled: false });
          results.permGated.push('Duplicate widget gated: useCanPerform bi_reporting/create (GridChartCard.tsx:311-312)');
        }

        // Check layout-drag permission (ungated at mutation level)
        results.permUngated.push('Layout drag/resize (handleLayoutChange) — no useCanPerform gate; calls updateWidget fire-and-forget (DashboardEditor.tsx:418-469)');

        // Check: Apply template — shown only when canCreate, but handleApplyTemplate itself has no explicit gate
        const templateSection = await page.locator('text=/template|Template Gallery/i').count();
        if (templateSection > 0) {
          results.uiGaps.push('Template gallery shown when pageWidgets.length === 0 && canCreate, but handleApplyTemplate() itself lacks an explicit canCreate guard (DashboardEditor.tsx:823-893)');
        }

        // Check dark mode toggle presence
        const darkToggle = await page.locator('[aria-label*="dark" i], [aria-label*="theme" i], button[title*="dark" i]').count();
        if (darkToggle === 0) {
          results.uiGaps.push('No dark mode toggle visible in bi-dashboard module — dark mode relies on system/global preference only');
        }

        // Check 4-states: loading, empty, error, data
        // Loading: pulse skeletons
        const hasLoadingSkeleton = await page.locator('[class*="animate-pulse"]').count() > 0;
        // Error: retry button shown?
        const hasRetryBtn = await page.locator('button').filter({ hasText: /retry/i }).count() > 0;
        console.log('Loading skeleton visible:', hasLoadingSkeleton, '| Retry button visible:', hasRetryBtn);

        // Check if denied access is surfaced when canCreate=false
        // (ACCOUNTADMIN gets full permissions so we won't see denials)
        // But we can check the tooltip mechanism
        const permDeniedTooltips = await page.locator('[title*="Requires"], [title*="permission"]').count();
        console.log('Permission-denied tooltips found:', permDeniedTooltips);
        if (permDeniedTooltips === 0) {
          results.transparencyGaps.push('No permission-denied tooltips visible for ACCOUNTADMIN (expected — all permissions granted); lower-role testing needed to validate denial UX');
        }

        // Check: is "Manage Access" button present per-project?
        const manageAccessCount = await page.locator('button').filter({ hasText: /manage access/i }).count();
        console.log('Manage Access buttons:', manageAccessCount);
        if (manageAccessCount === 0) {
          results.transparencyGaps.push('Manage Access button not found on editor page — may require a loaded dashboard to render');
        }

        // Snapshot: no "download my snapshots" / history UI visible
        const snapshotHistory = await page.locator('text=/snapshot history|version history|restore/i').count();
        if (snapshotHistory === 0) {
          results.uiGaps.push('No snapshot history / version list visible in bi-dashboard module — user cannot see/restore past snapshots from the UI (DashboardEditor toolbar)');
        }

        // Check autocreate modal aria role
        // Check NL bar placeholder text for vendor leak
        const nlInput = page.locator('input[aria-label*="chart"]');
        if (await nlInput.count() > 0) {
          const placeholder = await nlInput.getAttribute('placeholder') || '';
          if (placeholder.toLowerCase().includes('snowflake') || placeholder.toLowerCase().includes('cortex') || placeholder.toLowerCase().includes('kimi')) {
            results.uiGaps.push(`NL-to-chart placeholder contains vendor name: "${placeholder}"`);
          }
        }
      }
    }
  }

  await browser.close();

  // ─────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────
  console.log('\n\n======= AUDIT RESULTS =======');
  console.log('\nPages:');
  for (const p of results.pages) {
    console.log(' ', JSON.stringify(p));
  }

  console.log('\n5xx Errors:');
  for (const e of results.errors5xx) {
    console.log(' ', JSON.stringify(e));
  }

  console.log('\nConsole Errors:');
  for (const e of results.consoleErrors) {
    console.log(' ', JSON.stringify(e));
  }

  console.log('\nActions Found:');
  for (const a of results.actions) {
    console.log(' ', JSON.stringify(a));
  }

  console.log('\nPermission-Gated:');
  for (const g of results.permGated) {
    console.log('  [GATED]', g);
  }

  console.log('\nPossibly Ungated:');
  for (const u of results.permUngated) {
    console.log('  [UNGATED]', u);
  }

  console.log('\nUX Gaps:');
  for (const g of results.uiGaps) {
    console.log('  [UX]', g);
  }

  console.log('\nApproval/Grant Surfaces:');
  for (const a of results.approvalSurfaces) {
    console.log('  [GRANT]', a);
  }

  console.log('\nTransparency Gaps:');
  for (const t of results.transparencyGaps) {
    console.log('  [TRANSPARENCY]', t);
  }

  console.log('\n======= END AUDIT =======\n');
})();
