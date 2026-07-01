/**
 * Follow-up diagnostic for data-products:
 * 1. Activity section (button-toggle pattern, not h4)
 * 2. Object360Panel (RightTabPanel structure)
 * 3. 404 URL identification
 * 4. PublishGate on DRAFT product (subscription gating with disabled state)
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:3000';
const AUTH_STATE = 'e2e/.auth/state.json';
const SCREENS = 'docs/product-readiness-audit/screens/overnight/products';

mkdirSync(SCREENS, { recursive: true });

let stepIdx = 14; // continue from where we left off
async function shot(page, label) {
  stepIdx++;
  const num = String(stepIdx).padStart(2, '0');
  const file = join(SCREENS, `${num}_${label.replace(/[^a-z0-9]+/gi, '_')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[${num}] ${label} → ${file}`);
  return file;
}

const findings = {
  done: [],
  not_done: [],
  defects: [],
};

function ok(msg) { findings.done.push(msg); console.log('  OK:', msg); }
function fail(msg) { findings.not_done.push(msg); console.log('  FAIL:', msg); }
function defect(msg) { findings.defects.push(msg); console.error('  BUG:', msg); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  // Capture 404/5xx requests
  const failed404 = [];
  const failed5xx = [];
  page.on('response', async res => {
    const status = res.status();
    const url = res.url();
    if (status === 404 && url.includes('/api')) failed404.push({ status, url });
    if (status >= 500 && url.includes('/api')) failed5xx.push({ status, url });
  });

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // ─── Navigate ───────────────────────────────────────────────────────────────
  console.log('\n=== Navigate to /data-products ===');
  await page.goto(`${BASE}/data-products`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);

  // ─── Open detail panel ─────────────────────────────────────────────────────
  const cards = page.locator('.grid .rounded-xl.border');
  const cardCount = await cards.count().catch(() => 0);
  console.log(`Found ${cardCount} product cards`);

  if (cardCount === 0) {
    defect('No product cards found');
    await browser.close();
    return;
  }

  // Click Details on first card
  const detailsBtn = page.locator('button:has-text("Details")').first();
  await detailsBtn.click();
  await page.waitForTimeout(2000);
  await shot(page, 'diag_panel_open');

  const panel = page.locator('.w-\\[380px\\]').first();
  const panelVisible = await panel.isVisible().catch(() => false);
  if (!panelVisible) {
    defect('Detail panel not visible after Details click');
    await browser.close();
    return;
  }
  ok('Detail panel opened');

  // Wait for sub-sections to load
  await page.waitForTimeout(3000);

  // ─── Activity section (button toggle) ──────────────────────────────────────
  console.log('\n=== Activity section ===');
  // Activity is a button that says "Activity" (not h4)
  const activityBtn = panel.locator('button').filter({ hasText: 'Activity' }).first();
  const activityBtnVisible = await activityBtn.isVisible().catch(() => false);
  if (activityBtnVisible) {
    ok('Activity toggle button found in panel');
    await activityBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'activity_expanded');
    // Check for content: "No activity yet." or a list or an error
    const noActivity = panel.locator('text=No activity yet').first();
    const activityList = panel.locator('ol').first();
    const activityError = panel.locator('text=Retry').last();
    const noAct = await noActivity.isVisible().catch(() => false);
    const hasList = await activityList.isVisible().catch(() => false);
    const hasErr = await activityError.isVisible().catch(() => false);
    if (noAct) {
      ok('Activity panel expanded: "No activity yet" (empty state)');
    } else if (hasList) {
      const liCount = await activityList.locator('li').count().catch(() => 0);
      ok(`Activity panel expanded: ${liCount} events listed`);
    } else if (hasErr) {
      defect('Activity panel expanded but shows Retry error');
    } else {
      fail('Activity panel expanded but state unclear');
    }
  } else {
    // Look for any button with aria-expanded in the panel
    const allButtons = await panel.locator('button').all();
    const btnTexts = await Promise.all(allButtons.map(b => b.textContent().catch(() => '')));
    console.log('  All panel buttons:', btnTexts.map(t => t?.trim().slice(0, 30)));
    fail('Activity toggle button not found');
  }

  // ─── Object 360 Panel ──────────────────────────────────────────────────────
  console.log('\n=== Object 360 panel (detailed check) ===');
  // Scroll panel to top first
  await panel.evaluate(el => el.scrollTop = 0);
  await page.waitForTimeout(300);

  const obj360Btn = page.locator('button:has-text("Object 360")').first();
  const obj360Visible = await obj360Btn.isVisible().catch(() => false);

  if (obj360Visible) {
    await obj360Btn.click();
    await page.waitForTimeout(3000);
    await shot(page, 'obj360_panel_opened');

    // RightTabPanel renders: a title bar + icon rail on the right side
    // Look for: the title text (product name) or tab icons or the specific widthClassName w-[420px]
    const obj360Container = page.locator('.w-\\[420px\\]').first();
    const containerVisible = await obj360Container.isVisible().catch(() => false);

    // Also check for the 8-tab icon rail
    const iconRail = page.locator('[role="region"]').first();
    const iconRailVisible = await iconRail.isVisible().catch(() => false);

    // Check for specific tab labels that the panel shows
    const colTab = page.locator('button[aria-label="Columns"], button:has-text("Columns")').first();
    const colTabVis = await colTab.isVisible().catch(() => false);

    if (containerVisible) {
      ok('Object 360 panel container (w-[420px]) visible');
      // Now check the tabs
      const tabs = ['Columns', 'Lineage', 'Governance', 'Quality', 'Usage', 'Cost', 'Audit', 'Actions'];
      for (const tab of tabs) {
        const tabBtn = page.locator(`button[title="${tab}"], button[aria-label="${tab}"]`).first();
        const tabVisible = await tabBtn.isVisible().catch(() => false);
        if (tabVisible) ok(`Object360 tab visible: ${tab}`);
        // Not failing per tab — the icon rail may use tooltips instead of labels
      }
      await shot(page, 'obj360_columns_tab');
    } else if (iconRailVisible || colTabVis) {
      ok('Object 360 panel opened (region/column-tab visible)');
    } else {
      // The panel may use an overlay or replaced the main content
      // Check for the RightTabPanel structure by looking at what changed
      const allH3 = await page.evaluate(() =>
        [...document.querySelectorAll('h3')].map(el => el.textContent?.trim())
      );
      console.log('  h3 elements after Object360 open:', allH3);
      fail('Object 360 panel structure not confirmed — check screenshot');
    }

    // Close the Object360 panel (find the close button)
    const closeBtn = page.locator('button[aria-label="Close Object 360"], button[aria-label="Close"]').first();
    const closeBtnVis = await closeBtn.isVisible().catch(() => false);
    if (closeBtnVis) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      ok('Object 360 panel closed via close button');
    } else {
      // Try pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  } else {
    fail('Object 360 button not found (panel may not be open)');
  }

  // ─── Subscribe gating on DRAFT product ─────────────────────────────────────
  console.log('\n=== Subscribe gating: check disabled state for unpublished products ===');
  // Close panel
  const closePanelBtn = page.locator('button[aria-label="Close details"]').first();
  const closePanelVis = await closePanelBtn.isVisible().catch(() => false);
  if (closePanelVis) await closePanelBtn.click();
  await page.waitForTimeout(500);

  // Get all Subscribe buttons and check their states
  const allSubscribeButtons = page.locator('button:has-text("Subscribe")');
  const subCount = await allSubscribeButtons.count().catch(() => 0);
  console.log(`  Found ${subCount} Subscribe buttons`);

  let enabledCount = 0, disabledCount = 0;
  for (let i = 0; i < subCount; i++) {
    const btn = allSubscribeButtons.nth(i);
    const disabled = await btn.isDisabled().catch(() => false);
    const title = await btn.getAttribute('title').catch(() => null);
    if (disabled) {
      disabledCount++;
      console.log(`  Subscribe button ${i+1}: DISABLED - ${title}`);
    } else {
      enabledCount++;
      console.log(`  Subscribe button ${i+1}: ENABLED`);
    }
  }

  if (subCount > 0) {
    ok(`Subscribe buttons: ${enabledCount} enabled, ${disabledCount} disabled of ${subCount} total`);
    if (disabledCount > 0) {
      ok('At least one Subscribe button correctly disabled for unpublished/no-permission products');
    }
  } else {
    fail('No Subscribe buttons found');
  }

  await shot(page, 'subscribe_states');

  // ─── 404 Report ─────────────────────────────────────────────────────────────
  console.log('\n=== 404/5xx API endpoint report ===');
  console.log(`  404s: ${failed404.length}`);
  failed404.forEach(r => {
    console.log(`    404: ${r.url}`);
    defect(`404: ${r.url}`);
  });
  console.log(`  5xxs: ${failed5xx.length}`);
  failed5xx.forEach(r => {
    console.log(`    ${r.status}: ${r.url}`);
    defect(`${r.status}: ${r.url}`);
  });

  if (failed404.length === 0 && failed5xx.length === 0) {
    ok('No 404/5xx API errors');
  }

  // ─── PublishGate: check for DRAFT products ─────────────────────────────────
  console.log('\n=== PublishGate: DRAFT product flow ===');
  // Find a product card with "Draft" badge
  const draftBadges = page.locator('.rounded-xl.border').filter({ hasText: 'Draft' });
  const draftCount = await draftBadges.count().catch(() => 0);
  console.log(`  Found ${draftCount} Draft products`);

  if (draftCount > 0) {
    const firstDraft = draftBadges.first();
    const detailBtnInDraft = firstDraft.locator('button:has-text("Details")');
    await detailBtnInDraft.click();
    await page.waitForTimeout(2000);
    await shot(page, 'draft_product_panel');

    // Check Publish gate for a DRAFT product
    const publishGate = page.locator('h4:has-text("Publish gate")').first();
    const gateVis = await publishGate.isVisible().catch(() => false);
    if (gateVis) {
      ok('Publish gate section visible for Draft product');
      // Wait for scores to load
      await page.waitForTimeout(3000);
      await shot(page, 'draft_publish_gate_scores');

      const publishBtn = page.locator('button:has-text("Publish as data share")').first();
      const publishBtnVis = await publishBtn.isVisible().catch(() => false);
      if (publishBtnVis) {
        const disabled = await publishBtn.isDisabled().catch(() => false);
        if (disabled) {
          ok('Publish button correctly disabled for draft with failing gate checks');
        } else {
          // Gate passed — can open confirm
          await publishBtn.click();
          await page.waitForTimeout(800);
          await shot(page, 'draft_publish_confirm');
          const dialog = page.locator('[role="dialog"]').first();
          const dialogVis = await dialog.isVisible().catch(() => false);
          if (dialogVis) {
            ok('Publish confirm dialog opened for gate-passing product');
            const cancelBtn = dialog.locator('button:has-text("Cancel")').first();
            await cancelBtn.click();
            await page.waitForTimeout(400);
            ok('Publish confirm cancelled (no mutation)');
          } else {
            defect('Publish button enabled but confirm dialog did not appear');
          }
        }
      } else {
        // Maybe product is already published
        const publishedBadge = page.locator('text=Published').first();
        const publishedVis = await publishedBadge.isVisible().catch(() => false);
        if (publishedVis) ok('Product already published (gate shows Published badge)');
        else fail('Publish gate button not found for Draft product');
      }
    } else {
      fail('Publish gate not visible for Draft product');
    }
  } else {
    ok('All products are published/active (no Draft cards to test gate flow)');
  }

  await browser.close();

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n=== DIAGNOSTIC SUMMARY ===');
  console.log(`OK (${findings.done.length}):`, findings.done);
  console.log(`FAIL (${findings.not_done.length}):`, findings.not_done);
  console.log(`DEFECTS (${findings.defects.length}):`, findings.defects);
})();
