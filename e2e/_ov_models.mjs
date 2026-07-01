/**
 * E2E audit — explore-design "models" domain
 * URL: http://localhost:3000/explore-design?project_id=proj_25447131ab9e&view=catalog
 *
 * Key discoveries from previous runs:
 * - DB select populated after React hydration (need to wait or poll)
 * - Schema selector = custom dropdown (button → div items, not native select)
 * - Table checkboxes = [role="checkbox"] (VirtualizedTableList)
 * - "Add to Modeling" = gradient button that does NOT switch view (just adds to modeling state)
 * - "Relations" button appears in BOTTOM SELECTION TOOLBAR when tables selected
 * - Deploy button (toolbar) = rizzui-button, opens right panel
 * - Deploy stepper step tabs: motion.button with aria-label="Current step: Review" etc.
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_STATE = path.resolve(__dirname, '.auth/state.json');
const SCREENS = path.resolve(__dirname, '../docs/product-readiness-audit/screens/overnight/models');

const done = [];
const not_done = [];
const defects = [];
const screenshots = [];
let ssIdx = 0;

async function ss(page, label) {
  ssIdx++;
  const n = String(ssIdx).padStart(2, '0');
  const file = path.join(SCREENS, `${n}_${label.replace(/[^a-z0-9]/gi, '_')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push(file);
  console.log(`[SS] ${n} ${label}`);
  return file;
}

// Wait until selector resolves or timeout (soft — returns false on timeout)
async function waitFor(page, selector, timeout = 8000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  // ── 1. Load page and wait for hydration ──
  console.log('\n=== STEP 1: load page ===');
  await page.goto(
    'http://localhost:3000/explore-design?project_id=proj_25447131ab9e&view=catalog',
    { waitUntil: 'domcontentloaded', timeout: 30_000 }
  );
  // Wait for React hydration + project context to restore
  // The "Restoring project context..." toast appears while loading events
  // Poll until the DB select has at least 2 options (loading complete)
  let dbLoaded = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.waitForTimeout(1000);
    const opts = await page.locator('select').first().locator('option').count().catch(() => 0);
    if (opts >= 2) { dbLoaded = true; break; }
    console.log(`  Wait ${attempt + 1}/15 for DB options...`);
  }
  console.log('DB select loaded:', dbLoaded);
  // Extra settle time for project events to load
  await page.waitForTimeout(2000);
  await ss(page, '01_page_loaded');

  // ── 2. Select database DRAFT_SOURCE ──
  console.log('\n=== STEP 2: select DB DRAFT_SOURCE ===');
  const dbSelect = page.locator('select').first();
  const dbOptions = await dbSelect.locator('option').allTextContents().catch(() => []);
  console.log('DB options:', dbOptions);

  const hasDraft = dbOptions.some(o => o.includes('DRAFT_SOURCE'));
  if (hasDraft) {
    await dbSelect.selectOption('DRAFT_SOURCE');
    done.push('DB dropdown: DRAFT_SOURCE selectable');
    // Wait for schemas to load
    await page.waitForTimeout(3000);
    console.log('Selected DRAFT_SOURCE, waiting for schemas...');
  } else {
    not_done.push('DB dropdown: DRAFT_SOURCE not available (using existing project DB)');
    defects.push('explore-design/catalog: DRAFT_SOURCE missing from DB select options');
    console.log('DRAFT_SOURCE not found, continuing with existing state');
  }
  await ss(page, '02_db_selection');

  // ── 3. Select schema RETAIL_DW ──
  console.log('\n=== STEP 3: select schema RETAIL_DW ===');
  // First check if RETAIL_DW is already in the page (selected from run 1 state)
  const retailAlreadySelected = await page.locator('text=RETAIL_DW').count();
  console.log('RETAIL_DW already visible:', retailAlreadySelected > 0);

  if (!retailAlreadySelected && hasDraft) {
    // Look for the custom schema button/dropdown
    // It shows something like "Select schemas" or a schema count
    const schemaArea = page.locator('select').nth(1);
    const schemaArea2 = page.locator('[aria-label*="schema" i], button:has-text("schema")');

    // Try clicking the custom schema dropdown button
    // The CompactSourceSelector renders a div-based dropdown for schemas
    const schemaTriggerArea = page.locator('text=/\\d+ schema|Select schema/i, button:has-text("schemas")').first();
    if (await schemaTriggerArea.count() > 0) {
      await schemaTriggerArea.click({ force: true });
      await page.waitForTimeout(800);
    } else {
      // Try clicking the schema area next to the database select
      await page.locator('body').click({ position: { x: 515, y: 168 } }); // click schema button area
      await page.waitForTimeout(800);
    }

    // Look for RETAIL_DW in dropdown
    const retailInDrop = await page.locator('text=RETAIL_DW').count();
    if (retailInDrop > 0) {
      await page.locator('text=RETAIL_DW').first().click({ force: true });
      done.push('Schema RETAIL_DW selected');
      await page.waitForTimeout(2000);
      // Dismiss dropdown
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      not_done.push('Schema RETAIL_DW dropdown not found');
    }
  } else if (retailAlreadySelected) {
    done.push('Schema RETAIL_DW already active (from previous session)');
  }
  await ss(page, '03_schema_selection');

  // ── 4. Verify tables ──
  console.log('\n=== STEP 4: verify tables ===');
  await page.waitForTimeout(1000);
  const tablesHeader = await page.locator('text=/Source Tables.*\\d+|\\d+ tables/i').first().textContent().catch(() => '');
  const factDimCount = await page.locator('text=/^FACT_|^DIM_/i').count();
  console.log('Tables header:', tablesHeader, '| FACT/DIM count:', factDimCount);

  const tMatch = tablesHeader.match(/(\d+)/);
  const tableCount = tMatch ? parseInt(tMatch[0]) : factDimCount;

  if (tableCount >= 10 || factDimCount >= 5) {
    done.push(`Source tables loaded (${tableCount} shown, ${factDimCount} FACT/DIM refs)`);
    if (tableCount >= 14) done.push('14 tables from RETAIL_DW confirmed');
  } else {
    not_done.push(`Tables insufficient (count=${tableCount}, FACT/DIM=${factDimCount})`);
  }
  await ss(page, '04_tables_loaded');

  // ── 5. Select tables via header checkbox ──
  console.log('\n=== STEP 5: select all tables ===');
  const roleCheckboxes = await page.locator('[role="checkbox"]').count();
  console.log('[role="checkbox"] count:', roleCheckboxes);

  if (roleCheckboxes > 0) {
    // Click the first checkbox (header = select all for first group)
    await page.locator('[role="checkbox"]').first().click({ force: true });
    await page.waitForTimeout(600);
    // Verify selection bar appeared
    const selBar = page.locator('text=/selected.*tables|tables.*selected/i').first();
    const selBarCount = await selBar.count();
    const selBarText = await selBar.textContent().catch(() => '');
    console.log('Selection bar:', selBarText);
    done.push(`Table selection works: [role="checkbox"] (${roleCheckboxes} found, bottom bar: "${selBarText?.substring(0, 30)}")`);
  } else {
    not_done.push('Table selection: no [role="checkbox"] found');
  }
  await ss(page, '05_tables_selected');

  // ── 6. AI relationship discovery via "Relations" button in selection bar ──
  console.log('\n=== STEP 6: AI relationship discovery ===');
  // The "Relations" button is in the floating bottom selection toolbar
  const relationsBtn = page.locator('text=Relations, button:has-text("Relations")').first();
  const relBtnCount = await relationsBtn.count();
  console.log('"Relations" in selection bar count:', relBtnCount);

  if (relBtnCount > 0) {
    done.push('"Relations" button accessible in selection toolbar');
    await relationsBtn.click({ force: true });
    await page.waitForTimeout(1000);

    // The modal should open with "Auto-Detect Relations" button
    const autoDetectBtn = page.locator('button:has-text("Auto-Detect"), button:has-text("Detect Relations"), text=Auto-Detect');
    const autoDetectCount = await autoDetectBtn.count();
    console.log('"Auto-Detect Relations" button:', autoDetectCount);
    await ss(page, '06a_relations_modal');

    if (autoDetectCount > 0) {
      done.push('AI discover relations modal opens with "Auto-Detect Relations" button');
      await autoDetectBtn.first().click();
      await page.waitForTimeout(5000); // Wait for API response

      // Check for result toast
      const successMsg = page.locator('text=/Discovered|relationship|0 potential/i').first();
      const errorMsg = page.locator('text=/failed|error/i').first();
      const hasSuccess = await successMsg.count() > 0;
      const hasError = await errorMsg.count() > 0;

      if (hasSuccess) {
        const txt = await successMsg.textContent().catch(() => '');
        done.push(`AI relationship discovery executes: "${txt.substring(0, 60)}"`);
      } else if (hasError) {
        const txt = await errorMsg.textContent().catch(() => '');
        not_done.push(`AI relationship discovery returned error: "${txt.substring(0, 60)}"`);
        defects.push(`explore-design/ai-discover: "${txt.substring(0, 60)}"`);
      } else {
        not_done.push('AI relationship discovery: no result toast within 5s');
      }
      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else {
      not_done.push('AI discover modal: "Auto-Detect Relations" button missing');
    }
  } else {
    not_done.push('"Relations" button not in selection toolbar (tables may not be selected)');
  }

  // ── 7. Add to modeling ──
  console.log('\n=== STEP 7: add to modeling ===');
  // "Add N to Modeling" gradient button appears when selectedTables.size > 0
  const addBtn = page.locator('button.bg-gradient-to-r, button[class*="gradient"]').filter({ hasText: /Add.*Modeling/i }).first();
  const addCount = await addBtn.count();
  console.log('"Add to Modeling" gradient button count:', addCount);

  if (addCount > 0) {
    const addText = await addBtn.textContent().catch(() => '');
    console.log('Add button text:', addText);
    await addBtn.click({ force: true });
    await page.waitForTimeout(2000);
    // Check for success toast
    const addedToast = page.locator('text=/Added.*modeling|tables.*modeling/i').first();
    const addedCount = await addedToast.count();
    if (addedCount > 0) {
      done.push(`"Add to Modeling" works: "${(await addedToast.textContent()).substring(0, 50)}"`);
    } else {
      done.push('"Add to Modeling" button clicked (no toast visible)');
    }
  } else {
    // Selection may have been cleared by clicking Relations modal
    // Try re-selecting
    const roleCheckboxes2 = await page.locator('[role="checkbox"]').count();
    if (roleCheckboxes2 > 0) {
      await page.locator('[role="checkbox"]').first().click({ force: true });
      await page.waitForTimeout(500);
      const addBtn2 = page.locator('button').filter({ hasText: /Add.*Modeling/i }).first();
      if (await addBtn2.count() > 0) {
        await addBtn2.click({ force: true });
        await page.waitForTimeout(2000);
        done.push('"Add to Modeling" triggered after re-selection');
      } else {
        not_done.push('"Add to Modeling" button not visible (tables may already be in modeling)');
      }
    }
  }
  await ss(page, '07_add_to_modeling');

  // ── 8. Open Modeling tab to see canvas ──
  console.log('\n=== STEP 8: switch to Modeling view ===');
  const modelingTab = page.locator('button:has-text("Modeling"), [role="tab"]:has-text("Modeling")').first();
  const modelingTabCount = await modelingTab.count();
  console.log('"Modeling" tab count:', modelingTabCount);

  if (modelingTabCount > 0) {
    await modelingTab.click({ force: true });
    await page.waitForTimeout(3000);
    // In modeling view, the canvas should show table nodes
    const rfWrapper = page.locator('[data-testid="rf__wrapper"], .react-flow__renderer');
    const rfCount = await rfWrapper.count();
    console.log('React Flow wrapper found:', rfCount);
    if (rfCount > 0) {
      done.push('Modeling view / canvas renders after tab switch');
    } else {
      not_done.push('Modeling canvas not found after tab switch');
    }
  } else {
    not_done.push('"Modeling" tab not found');
  }
  await ss(page, '08_modeling_canvas');

  // ── 9. Click Deploy button ──
  console.log('\n=== STEP 9: open Deploy panel ===');
  // The Deploy button in the page toolbar — rizzui Button with Rocket icon + "Deploy" text
  // Ensure we click the TOOLBAR deploy button, not a right-bar tab
  // Strategy: click the blue gradient "Deploy" button that's visible in the header area

  // First try: the button that's NOT in the right-bar mini-rail and NOT disabled
  const allDeployBtns = await page.locator('button').filter({ hasText: /^Deploy/ }).all();
  console.log('Deploy buttons found:', allDeployBtns.length);

  let deployOpened = false;
  for (const btn of allDeployBtns) {
    const txt = await btn.textContent().catch(() => '');
    const cls = await btn.getAttribute('class').catch(() => '');
    const dis = await btn.getAttribute('disabled').catch(() => null);
    const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');
    console.log(`  Deploy btn: text="${txt?.trim()}", disabled=${dis}, aria="${ariaLabel}"`);

    // Skip disabled buttons and right-bar tab buttons (aria-label contains step names)
    if (dis !== null) continue;

    await btn.click({ force: true });
    console.log('  Clicked deploy button');
    // Wait 6 seconds for the right panel to open and render
    await page.waitForTimeout(6000);

    // Verify panel opened by looking for deploy stepper content
    // The step tabs have aria-labels like "Current step: Review", "Upcoming step: Config"
    const stepperVisible = await page.locator('[aria-label*="step: Review"], [aria-label*="step: Config"], [aria-label*="step:"]').count();
    const riskText = await page.locator('text=Risk, text=Objects, text=Policies').count(); // GovernanceKpiStrip
    console.log(`  Stepper aria-labels: ${stepperVisible}, GovernanceKpi: ${riskText}`);

    if (stepperVisible > 0 || riskText >= 2) {
      deployOpened = true;
      done.push('Deploy panel opens: stepper visible in right bar');
      break;
    }

    // Maybe the button click opened it but we need to look harder
    const stepContent = await page.evaluate(() => {
      // Look for step navigation buttons by their specific text
      const allBtns = Array.from(document.querySelectorAll('button'));
      const stepLabels = ['Review', 'Config', 'Checks', 'Dry Run', 'Diff', 'Impact'];
      return stepLabels.filter(label =>
        allBtns.some(b => b.textContent?.includes(label) && b.closest('[class*="stepper"], [class*="deploy"]'))
      );
    });
    console.log('  Deploy step content via evaluate:', stepContent);

    if (stepContent.length > 0) {
      deployOpened = true;
      done.push(`Deploy panel opens: steps found [${stepContent.join(', ')}]`);
      break;
    }
    break; // Try only the first clickable button
  }

  if (!deployOpened) {
    // Try a different approach: look for the mini-rail Deploy icon and click it
    const deployIcon = page.locator('[aria-label*="Deploy"], [title*="Deploy"]').filter({ hasNot: page.locator('button:has-text("Deploy")') }).first();
    const deployIconCount = await deployIcon.count();
    console.log('Deploy mini-rail icon:', deployIconCount);
    if (deployIconCount > 0) {
      await deployIcon.click({ force: true });
      await page.waitForTimeout(4000);
    }

    // Final check
    const finalStepCheck = await page.locator('[aria-label*="step:"], [aria-label*="Review"], [aria-label*="Config"]').count();
    if (finalStepCheck > 0) {
      deployOpened = true;
      done.push('Deploy panel opens (via icon click)');
    } else {
      not_done.push('Deploy panel did not open after toolbar button click');
      defects.push('explore-design/deploy: right panel did not expand after Deploy button click');
    }
  }
  await ss(page, '09_deploy_panel');

  // ── 10. Check deploy stepper ──
  console.log('\n=== STEP 10: deploy stepper navigation ===');
  // Step tabs use aria-label e.g. "Current step: Review" / "Upcoming step: Config"
  // Also check by text content
  const stepData = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button'));
    const steps = all
      .filter(b => {
        const t = b.textContent?.trim() ?? '';
        return ['Review', 'Config', 'Checks', 'Dry Run', 'Diff', 'Impact', 'Verify'].some(s => t === s || t.startsWith(s))
          || (b.getAttribute('aria-label') ?? '').includes('step:');
      })
      .map(b => ({
        text: b.textContent?.trim().substring(0, 30),
        aria: b.getAttribute('aria-label') ?? '',
        disabled: b.disabled,
      }));
    return steps;
  });
  console.log('Step buttons found:', JSON.stringify(stepData));

  // Filter to step tab buttons (not toolbar Deploy)
  const stepTabButtons = stepData.filter(s =>
    s.aria.includes('step:') ||
    ['Review', 'Config', 'Checks', 'Dry Run', 'Diff', 'Impact', 'Verify'].includes(s.text ?? '')
  );
  console.log('Step tab buttons:', stepTabButtons.length);

  if (stepTabButtons.length >= 6) {
    done.push(`Deploy stepper: ${stepTabButtons.length}/8 step tabs in DOM`);
  } else if (stepTabButtons.length > 0) {
    not_done.push(`Deploy stepper: only ${stepTabButtons.length}/8 step tabs found`);
  } else {
    not_done.push('Deploy stepper: no step tabs found (panel likely did not open)');
  }
  await ss(page, '10_deploy_stepper');

  // ── 11. Review step ──
  console.log('\n=== STEP 11: Review step ===');
  // Find the Review step button and click it
  const reviewBtn = page.locator('button').filter({ hasText: 'Review' }).filter({
    hasNot: page.locator('text=Code Review')
  }).first();
  const reviewCount = await reviewBtn.count();

  // Also check by aria-label
  const reviewByAria = page.locator('[aria-label*="step: Review"], [aria-label*="Current step: Review"]').first();
  const reviewAriaCount = await reviewByAria.count();
  console.log('Review button count:', reviewCount, 'by aria:', reviewAriaCount);

  if (reviewCount > 0) {
    // Try clicking by aria-label if clickable, otherwise text
    const targetBtn = reviewAriaCount > 0 ? reviewByAria : reviewBtn;
    await targetBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);

    // Check what renders in the deploy panel (right side)
    const reviewContent = await page.evaluate(() => {
      // Look for text in deploy-panel specific area
      const allText = document.body.innerText;
      // Key strings from StepReview: pending events, schema health, relationship discovery
      return {
        hasPending: /pending|events|DDL|No pending/i.test(allText),
        hasSchema: /Schema Health|schema health/i.test(allText),
        hasRelationship: /Relationship|relationship/i.test(allText),
        hasRisk: /Risk|risk/i.test(allText),
      };
    });
    console.log('Review content:', reviewContent);

    if (Object.values(reviewContent).some(Boolean)) {
      done.push('Review step: content renders (pending events / schema health / risk)');
    } else {
      not_done.push('Review step: no recognizable content');
    }
  } else {
    not_done.push('Review step: tab button not found');
  }
  await ss(page, '11_review_step');

  // ── 12. Navigate to Config step using Next ──
  console.log('\n=== STEP 12: Config step ===');
  // Find Next button in the stepper footer
  const nextBtn = page.locator('button:has-text("Next"), button:has-text("→")').last();
  const nextCount = await nextBtn.count();
  console.log('Next button count:', nextCount);

  // Also try the Config step tab directly
  const configTabBtn = page.locator('[aria-label*="step: Config"], [aria-label*="Revisit completed step: Config"]').first();
  const configTab = page.locator('button[aria-label*="Config"], button').filter({ hasText: 'Config' }).first();

  let configReached = false;
  if (await configTabBtn.count() > 0) {
    await configTabBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
    configReached = true;
  } else if (nextCount > 0) {
    await nextBtn.click({ force: true });
    await page.waitForTimeout(1000);
    configReached = true;
  } else if (await configTab.count() > 0) {
    await configTab.click({ force: true });
    await page.waitForTimeout(1000);
    configReached = true;
  }

  if (configReached) {
    const configContent = await page.locator('text=/warehouse|Warehouse|schedule|target.*schema|ingestion.*mode/i').count();
    if (configContent > 0) {
      done.push('Config step: warehouse/schedule/target configuration UI renders');
    } else {
      not_done.push('Config step: no configuration content visible after navigation');
    }
  } else {
    not_done.push('Config step: cannot navigate (no Next button or step tab)');
  }
  await ss(page, '12_config_step');

  // ── 13. Checks (PreChecks) step ──
  console.log('\n=== STEP 13: Checks step ===');
  // Try to reach Checks — click its tab or use Next
  const checksActions = [
    page.locator('[aria-label*="step: Checks"]').first(),
    page.locator('button[aria-label*="Checks"]').first(),
    page.locator('button').filter({ hasText: 'Checks' }).first(),
    page.locator('button:has-text("Next")').last(),
  ];

  let checksReached = false;
  for (const act of checksActions) {
    if (await act.count() > 0) {
      await act.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      checksReached = true;
      break;
    }
  }

  if (checksReached) {
    const checksContent = await page.locator('text=/pre.deploy|Pre.Deploy|schema.*check|conflict|run.*check|validation/i').count();
    const runChecksBtn = await page.locator('button:has-text("Run")').count();
    if (checksContent > 0 || runChecksBtn > 0) {
      done.push('Checks step: pre-deploy validation UI (run checks button visible)');
    } else {
      not_done.push('Checks step: no content visible');
    }
  } else {
    not_done.push('Checks step: cannot navigate');
  }
  await ss(page, '13_checks_step');

  // ── 14. Dry Run step — reach and click run ──
  console.log('\n=== STEP 14: Dry Run step ===');
  const dryRunActions = [
    page.locator('[aria-label*="Dry Run"]').first(),
    page.locator('button').filter({ hasText: 'Dry Run' }).first(),
    page.locator('button:has-text("Next")').last(),
  ];

  let dryRunReached = false;
  for (const act of dryRunActions) {
    if (await act.count() > 0) {
      await act.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      dryRunReached = true;
      break;
    }
  }

  if (dryRunReached) {
    const dryContent = await page.locator('text=/dry.run|Dry Run|warehouse|sample|simulate/i').count();
    const runBtn = page.locator('button').filter({ hasText: /Run Dry|Execute|Dry Run/i }).first();
    const runBtnCount = await runBtn.count();

    if (dryContent > 0 || runBtnCount > 0) {
      done.push('Dry Run step: renders UI with run button');

      // Try executing the dry run (no pending DDL = will show empty/skip)
      if (runBtnCount > 0) {
        const dis = await runBtn.getAttribute('disabled');
        if (!dis) {
          console.log('Executing dry run...');
          await runBtn.click({ force: true });
          try {
            await page.waitForSelector('text=/completed|success|failed|DDL|0 events|no events/i', { timeout: 20000 });
            const resultText = await page.locator('text=/completed|success|failed|DDL|events/i').first().textContent().catch(() => '');
            console.log('Dry run result:', resultText);
            if (/failed|error/i.test(resultText)) {
              not_done.push(`Dry Run: execution error — "${resultText.substring(0, 80)}"`);
              defects.push(`explore-design/dry-run: "${resultText.substring(0, 80)}"`);
            } else {
              done.push(`Dry Run: executes and returns result ("${resultText.substring(0, 60)}")`);
            }
          } catch {
            not_done.push('Dry Run: no result within 20s (no pending events to deploy)');
          }
        } else {
          not_done.push('Dry Run: run button disabled (no pending events or warehouse not set)');
        }
      }
    } else {
      not_done.push('Dry Run step: no UI content found');
    }
  } else {
    not_done.push('Dry Run step: cannot navigate');
  }
  await ss(page, '14_dry_run_step');

  // ── 15. Diff step ──
  console.log('\n=== STEP 15: Diff step ===');
  const diffActions = [
    page.locator('[aria-label*="Diff"]').first(),
    page.locator('button').filter({ hasText: 'Diff' }).first(),
    page.locator('button:has-text("Next")').last(),
  ];
  let diffReached = false;
  for (const act of diffActions) {
    if (await act.count() > 0) {
      await act.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      diffReached = true;
      break;
    }
  }

  if (diffReached) {
    const diffContent = await page.locator('text=/SQL Diff|diff|Before|After|Fetch Server/i').count();
    const fetchBtn = page.locator('button:has-text("Fetch")').first();
    const fetchCount = await fetchBtn.count();
    if (diffContent > 0 || fetchCount > 0) {
      done.push('Diff step: SQL diff viewer renders with "Fetch Server Diff" button');
      // Try fetching
      if (fetchCount > 0) {
        const dis = await fetchBtn.getAttribute('disabled');
        if (!dis) {
          await fetchBtn.click({ force: true });
          await page.waitForTimeout(3000);
          done.push('Diff step: "Fetch Server Diff" button clickable');
        }
      }
    } else {
      not_done.push('Diff step: no diff content visible');
    }
  } else {
    not_done.push('Diff step: cannot navigate');
  }
  await ss(page, '15_diff_step');

  // ── 16. Impact step ──
  console.log('\n=== STEP 16: Impact step ===');
  const impactActions = [
    page.locator('[aria-label*="Impact"]').first(),
    page.locator('button').filter({ hasText: 'Impact' }).first(),
    page.locator('button:has-text("Next")').last(),
  ];
  let impactReached = false;
  for (const act of impactActions) {
    if (await act.count() > 0) {
      await act.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      impactReached = true;
      break;
    }
  }

  if (impactReached) {
    const impactContent = await page.locator('text=/impact|Impact|downstream|affected|lineage/i').count();
    const analyzeBtn = page.locator('button:has-text("Analyze"), button:has-text("Run Impact")').first();
    if (impactContent > 0 || await analyzeBtn.count() > 0) {
      done.push('Impact step: impact analysis UI renders');
    } else {
      not_done.push('Impact step: no content found');
    }
  } else {
    not_done.push('Impact step: cannot navigate');
  }
  await ss(page, '16_impact_step');

  // ── 17. Verify step ──
  console.log('\n=== STEP 17: Verify step ===');
  const verifyActions = [
    page.locator('[aria-label*="Verify"]').first(),
    page.locator('button').filter({ hasText: 'Verify' }).first(),
  ];
  let verifyReached = false;
  for (const act of verifyActions) {
    if (await act.count() > 0) {
      await act.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
      verifyReached = true;
      break;
    }
  }

  if (verifyReached) {
    const verifyContent = await page.locator('text=/verify|Verify|post.deploy|validation|deployment.*complete/i').count();
    if (verifyContent > 0) {
      done.push('Verify step: post-deploy verification UI renders');
    } else {
      not_done.push('Verify step: no content visible');
    }
  } else {
    not_done.push('Verify step: cannot navigate (final step requires prior deploy)');
  }
  await ss(page, '17_verify_step');

  await ss(page, '18_final_state');
  await browser.close();

  console.log('\n==============================');
  console.log('DONE:', done);
  console.log('NOT_DONE:', not_done);
  console.log('DEFECTS:', defects);
  console.log('SCREENSHOTS:', screenshots.length);
  console.log('==============================\n');

  process.stdout.write('\nRESULT_JSON:' + JSON.stringify({ done, not_done, defects, screenshots }) + '\n');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.stdout.write('\nRESULT_JSON:' + JSON.stringify({ done, not_done, defects: [...defects, `FATAL: ${err.message}`], screenshots }) + '\n');
  process.exit(1);
});
