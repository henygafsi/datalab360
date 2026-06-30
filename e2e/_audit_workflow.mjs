/**
 * Read-only Playwright audit of the /workflow module.
 * Uses saved auth state (HAHA / ACCOUNTADMIN).
 * Does NOT submit any destructive mutations.
 *
 * Pass 1: Project gate panel (workflow list)
 * Pass 2: After clicking a workflow — ETL canvas + WorkflowSmartPanel
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const AUTH_STATE = path.join(__dirname, '.auth/state.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const findings = {
  pages_ok: 0,
  pages_warming: 0,
  pages_error: 0,
  errors5xx: [],
  consoleErrors: [],
  actionButtons: [],
  ungatedActions: [],
  permissionGates: [],
  approvalSurfaces: [],
  transparencyGaps: [],
  uxGaps: [],
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: AUTH_STATE,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

// Global listeners
page.on('pageerror', e => {
  const msg = (e.message || String(e)).slice(0, 200);
  findings.consoleErrors.push(msg);
  console.log('[pageerror]', msg);
});
page.on('response', r => {
  const s = r.status();
  const u = r.url();
  if (s >= 500 && !/\.(png|jpg|svg|woff|ico|woff2)/.test(u)) {
    const entry = `${s} ${u.replace(BASE, '').split('?')[0]}`;
    findings.errors5xx.push(entry);
    console.log('[5xx]', entry);
  }
});
page.on('console', msg => {
  if (msg.type() === 'error') {
    const t = msg.text();
    if (!t.includes('favicon') && !t.includes('net::ERR') && !t.includes('content-security')) {
      console.log('[console.error]', t.slice(0, 200));
    }
  }
});

// ─── PASS 1: Navigate to /workflow ─────────────────────────────────────────
console.log('\n=== PASS 1: /workflow page load ===');
await page.goto(`${BASE}/workflow`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(8000);

const url1 = page.url();
const authed = !url1.includes('/signin');
console.log('URL:', url1);
console.log('Authed:', authed);

const body1 = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
const warming1 = /warming up|cache is initializing|initializing cache|preparing data/i.test(body1);
const hasError1 = /something went wrong|an error occurred while loading|encountered a rendering error/i.test(body1);
console.log('Warming:', warming1, '| Error boundary:', hasError1, '| Body len:', body1.length);

if (!authed) {
  console.error('Not authenticated! Aborting.');
  await ctx.close(); await browser.close(); process.exit(1);
}

if (warming1) findings.pages_warming++;
else if (hasError1) findings.pages_error++;
else findings.pages_ok++;

// Check what's visible: ProjectGatePanel (workflow cards) or ETL builder
const reactFlowCount = await page.locator('.react-flow, [class*="react-flow"]').count();
console.log('ReactFlow canvas on first load:', reactFlowCount);

// Count workflow cards
const workflowCards = await page.locator('button').filter({ hasText: /created|Jun|May|Apr/i }).count();
console.log('Workflow cards visible:', workflowCards);

// ─── PASS 2: Click a workflow card ─────────────────────────────────────────
console.log('\n=== PASS 2: Loading a workflow ===');

// Try clicking the first non-destructive workflow card (first SEED)
const firstCard = page.locator('button').filter({ hasText: /SEED_WF_KPI_REFRESH/i }).first();
const firstCardCount = await firstCard.count();
console.log('SEED_WF_KPI_REFRESH card found:', firstCardCount > 0);

if (firstCardCount > 0) {
  await firstCard.click({ timeout: 5000 }).catch(e => console.log('Click error:', e.message));
  await sleep(10000); // Wait for ETL canvas to fully load
}

const body2 = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
const warming2 = /warming up|cache is initializing|initializing cache/i.test(body2);
const hasError2 = /something went wrong|an error occurred while loading|encountered a rendering error/i.test(body2);
const reactFlowCount2 = await page.locator('.react-flow, [class*="react-flow"]').count();
console.log('Warming:', warming2, '| Error boundary:', hasError2, '| Body len:', body2.length);
console.log('ReactFlow canvas after load:', reactFlowCount2);

if (warming2) findings.pages_warming++;
else if (hasError2) findings.pages_error++;
else findings.pages_ok++;

// ─── Enumerate ALL visible buttons in the builder ─────────────────────────
console.log('\n=== Button enumeration (ETL builder) ===');
const allButtons = await page.locator('button').all();
const buttonDetails = [];
for (const btn of allButtons) {
  try {
    const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
    if (!visible) continue;
    const text = (await btn.innerText({ timeout: 300 }).catch(() => '')).trim().replace(/\n+/g, ' ');
    const ariaLabel = (await btn.getAttribute('aria-label').catch(() => '')) || '';
    const title = (await btn.getAttribute('title').catch(() => '')) || '';
    const disabled = await btn.isDisabled({ timeout: 300 }).catch(() => false);
    const label = text || ariaLabel || title || '(unlabeled)';
    buttonDetails.push({ label: label.slice(0, 80), text: text.slice(0, 60), ariaLabel: ariaLabel.slice(0, 60), title: title.slice(0, 60), disabled });
  } catch { /* skip detached */ }
}
console.log(`Total visible buttons: ${buttonDetails.length}`);

// Mutating action filter
const mutatingRx = /save|run|execute|deploy|validate|compile|create|new|import|export|duplicate|schedule|approve|rollback|cancel|suspend|resume|generate|delete|remove|add tag|tag|fix|kill|re-run|rerun|submit/i;

const mutating = buttonDetails.filter(b =>
  mutatingRx.test(b.label) || mutatingRx.test(b.ariaLabel) || mutatingRx.test(b.title)
);
console.log(`\nMutating buttons found: ${mutating.length}`);
mutating.forEach(b => {
  const gated = b.disabled ? '[DISABLED/GATED]' : '[ENABLED]';
  console.log(`  ${gated} "${b.label}" | aria="${b.ariaLabel}" | title="${b.title}"`);
});
findings.actionButtons = mutating;

// ─── Permission-gate analysis ──────────────────────────────────────────────
console.log('\n=== Permission gate analysis ===');

// Delete button
const deleteBtn = page.locator('button[aria-label="Delete workflow"]');
const deleteBtnCount = await deleteBtn.count();
if (deleteBtnCount > 0) {
  const isDisabled = await deleteBtn.first().isDisabled().catch(() => null);
  const title = await deleteBtn.first().getAttribute('title').catch(() => '');
  console.log(`Delete workflow: disabled=${isDisabled} title="${title}"`);
  findings.permissionGates.push({
    action: 'delete-workflow',
    gated: true,
    mechanism: 'useCanPerform(workflow,delete)',
    source: 'ETLPipelineBuilder.tsx:3426',
    disabled: isDisabled,
    tooltip: title,
  });
} else {
  console.log('Delete button: not visible (workflow not loaded or no active workflow)');
}

// Import JSON (no RBAC gate, only canvas-empty gate)
const importJsonBtn = page.locator('button[aria-label="Import workflow"]');
if (await importJsonBtn.count() > 0) {
  const disabled = await importJsonBtn.first().isDisabled().catch(() => null);
  console.log(`Import JSON: disabled=${disabled}`);
  if (!disabled) {
    findings.ungatedActions.push({
      action: 'import-json',
      note: 'No RBAC gate — any authenticated user can import a JSON workflow. Only guarded by canvas mount.',
      source: 'ETLPipelineBuilder.tsx:3390',
    });
  }
}

// Export JSON (gated by nodes.length only, not RBAC)
const exportJsonBtn = page.locator('button[aria-label="Export workflow"]');
if (await exportJsonBtn.count() > 0) {
  const disabled = await exportJsonBtn.first().isDisabled().catch(() => null);
  console.log(`Export JSON: disabled=${disabled}`);
  if (!disabled) {
    findings.ungatedActions.push({
      action: 'export-json',
      note: 'No RBAC gate — gated only by nodes.length===0. Any role can export.',
      source: 'ETLPipelineBuilder.tsx:3401',
    });
  }
}

// Duplicate (no RBAC gate)
const dupBtn = page.locator('button[aria-label="Duplicate workflow"]');
if (await dupBtn.count() > 0) {
  const disabled = await dupBtn.first().isDisabled().catch(() => null);
  console.log(`Duplicate: disabled=${disabled}`);
  if (!disabled) {
    findings.ungatedActions.push({
      action: 'duplicate-workflow',
      note: 'No explicit RBAC gate — calls handleDuplicate which saves a copy. canWfCreate is NOT checked here.',
      source: 'ETLPipelineBuilder.tsx:3412',
    });
  }
}

// Save (gated by canWfEdit)
const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
if (await saveBtn.count() > 0) {
  const disabled = await saveBtn.isDisabled().catch(() => null);
  console.log(`Save: disabled=${disabled}`);
  findings.permissionGates.push({ action: 'save', gated: true, mechanism: 'canEdit=useCanPerform(workflow,edit)', source: 'WorkflowSmartPanel' });
}

// Run (gated by canWfExecute)
const runBtn = page.locator('button').filter({ hasText: /^run$/i }).first();
if (await runBtn.count() > 0) {
  const disabled = await runBtn.isDisabled().catch(() => null);
  console.log(`Run: disabled=${disabled}`);
  findings.permissionGates.push({ action: 'run', gated: true, mechanism: 'canExecute=useCanPerform(workflow,execute)', source: 'WorkflowSmartPanel' });
}

// ─── Approval/grant surfaces ───────────────────────────────────────────────
console.log('\n=== Approval/grant surfaces ===');

// Submit section
const submitSection = await page.locator('button').filter({ hasText: /validate|submit|approve|deploy/i }).count();
console.log('Submit/Approve/Deploy buttons:', submitSection);

// Look for approval hero banner (RunApprovalStatusHero)
const approvalHero = await page.locator('[class*="approval"], [class*="Approval"]').count();
console.log('Approval hero/banner count:', approvalHero);

// ManageAccessButton
const manageAccessBtn = await page.locator('text=Manage access').count();
console.log('Manage Access button visible:', manageAccessBtn > 0);
if (manageAccessBtn > 0) {
  findings.approvalSurfaces.push('ManageAccessButton (module=workflow, page=workflow) — access management per-module');
}

// Contributor management (WorkflowSmartPanel governance section)
const contributorSection = await page.locator('text=contributor').count() +
  await page.locator('text=Contributor').count();
console.log('Contributor section visible:', contributorSection);

// ─── Transparency gaps ─────────────────────────────────────────────────────
console.log('\n=== Transparency gaps ===');

// Check if denied actions show clear "why" tooltips
// Import/Export/Duplicate have no RBAC gate — these are transparency gaps
findings.transparencyGaps.push(
  'Import JSON (Upload button): no RBAC gate, no confirmation dialog — any role can silently overwrite the canvas',
  'Duplicate workflow: no explicit useCanPerform(workflow,create) check before calling the create API',
  'Tag add/remove: gated via isReadOnly prop only, not explicit useCanPerform — a write-restricted user sees a non-disabled "Add tag" button until isReadOnly resolves',
);

// ─── Vendor name leaks in visible text ────────────────────────────────────
console.log('\n=== Vendor name scan ===');
const visibleText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
const vendorRx = /\b(Snowflake|Cortex|Kimi)\b/gi;
let m;
while ((m = vendorRx.exec(visibleText)) !== null) {
  const ctx2 = visibleText.slice(Math.max(0, m.index - 40), m.index + 80).replace(/\n/g, ' ').trim();
  console.log(`  Vendor: "${m[0]}" context: ${ctx2}`);
  findings.uxGaps.push(`Vendor name leak in UI: "${m[0]}" — ${ctx2}`);
}
if (!findings.uxGaps.some(g => g.includes('Vendor'))) {
  console.log('No vendor name leaks in visible body text');
}

// ─── 4-state UX check ─────────────────────────────────────────────────────
console.log('\n=== 4-state (loading/empty/error/real) UX check ===');

// Check for skeleton placeholders
const skeletons = await page.locator('[class*="skeleton"], [class*="animate-pulse"]').count();
console.log('Skeleton count:', skeletons);

// Check canvas empty state
const emptyState = await page.locator('text=Drop a block').count() +
  await page.locator('text=drag').count() +
  await page.locator('text=No blocks').count();
console.log('Canvas empty-state text visible:', emptyState);

// Check if canvas has nodes (real data)
const canvasNodes = await page.locator('.react-flow__node').count();
console.log('Canvas nodes:', canvasNodes);
if (canvasNodes > 0) {
  console.log('-> Canvas has real workflow blocks');
  findings.pages_ok++;
} else {
  console.log('-> Canvas empty (new workflow or failed load)');
  if (!warming2 && !hasError2) {
    findings.uxGaps.push('Canvas is empty after selecting SEED_WF_KPI_REFRESH — possible backend load failure or empty workflow');
  }
}

// ─── Dark mode check ──────────────────────────────────────────────────────
const darkModeElements = await page.locator('[class*="dark:bg"], [class*="dark:text"]').count();
console.log('\nDark mode class count:', darkModeElements, darkModeElements > 50 ? '(supported)' : '(sparse)');
if (darkModeElements < 50) {
  findings.uxGaps.push('Dark mode coverage may be sparse — fewer than 50 dark: utility classes detected on the workflow page');
}

// ─── Cross-module navigation links ────────────────────────────────────────
const footerLinks = await page.locator('a[href="/explore-design"], a[href="/data-quality"], a[href="/bi-dashboard"]').count();
console.log('\nCross-module footer links:', footerLinks, '(expected 3)');
if (footerLinks < 3) {
  findings.uxGaps.push('Cross-module footer links missing or partially rendered');
}

// ─── Check ADN header badge (health summary) ──────────────────────────────
const adnBadge = await page.locator('[class*="adn"], [class*="Adn"], text=ADN').count();
console.log('ADN badge visible:', adnBadge > 0);

// ─── WorkflowSmartPanel rail sections ─────────────────────────────────────
console.log('\n=== WorkflowSmartPanel rail ===');
// The right panel should have icon-rail buttons for: Changes, Submit, Deploy, Block, AI, Results, Runs, SQL, Schedule, Usage, Cost, Governance
const railIconBtns = await page.locator('button[title]').all();
const railFound = [];
for (const rb of railIconBtns) {
  const t = await rb.getAttribute('title').catch(() => '');
  if (t) railFound.push(t);
}
console.log('Titled buttons (rail):', railFound);

// ─── Dev tools page ────────────────────────────────────────────────────────
console.log('\n=== PASS 3: /workflow/dev-tools ===');
await page.goto(`${BASE}/workflow/dev-tools`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await sleep(5000);
const url3 = page.url();
const body3 = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
const authed3 = !url3.includes('/signin');
const warming3 = /warming|initializing/i.test(body3);
const hasError3 = /something went wrong|an error occurred/i.test(body3);
console.log('dev-tools authed:', authed3, '| warming:', warming3, '| error:', hasError3, '| len:', body3.length);
console.log('dev-tools body preview:', body3.slice(0, 200));
if (authed3 && !warming3 && !hasError3) findings.pages_ok++;
else if (warming3) findings.pages_warming++;
else if (hasError3) findings.pages_error++;
else findings.pages_ok++;

// ─── Final summary ────────────────────────────────────────────────────────
console.log('\n\n========== AUDIT SUMMARY ==========');
console.log('pages_ok:', findings.pages_ok);
console.log('pages_warming:', findings.pages_warming);
console.log('pages_error:', findings.pages_error);
console.log('5xx errors:', findings.errors5xx.length);
console.log('Console errors:', findings.consoleErrors.length);
console.log('Action buttons found:', findings.actionButtons.length);
console.log('Ungated actions:', findings.ungatedActions.length);
console.log('Permission gates:', findings.permissionGates.length);
console.log('Approval surfaces:', findings.approvalSurfaces.length);
console.log('Transparency gaps:', findings.transparencyGaps.length);
console.log('UX gaps:', findings.uxGaps.length);

console.log('\n--- 5xx errors ---');
findings.errors5xx.forEach(e => console.log(' ', e));

console.log('\n--- Console errors ---');
findings.consoleErrors.forEach(e => console.log(' ', e));

console.log('\n--- Ungated actions ---');
findings.ungatedActions.forEach(a => console.log(' ', JSON.stringify(a)));

console.log('\n--- Permission gates ---');
findings.permissionGates.forEach(g => console.log(' ', JSON.stringify(g)));

console.log('\n--- Approval surfaces ---');
findings.approvalSurfaces.forEach(a => console.log(' ', a));

console.log('\n--- Transparency gaps ---');
findings.transparencyGaps.forEach(g => console.log(' ', g));

console.log('\n--- UX gaps ---');
findings.uxGaps.forEach(g => console.log(' ', g));

console.log('\n--- All mutating buttons ---');
findings.actionButtons.forEach(b => {
  console.log(`  [${b.disabled ? 'DISABLED' : 'ENABLED '}] "${b.label}"`);
});

await ctx.close();
await browser.close();
