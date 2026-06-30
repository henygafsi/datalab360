/**
 * Flow: DWH Action Plan tab + DryRunGate audit
 * Screenshots to docs/product-readiness-audit/screens/dwh-plan-dryrun/
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const SCREEN_DIR = path.join(REPO, 'docs/product-readiness-audit/screens/dwh-plan-dryrun');
const AUTH_STATE = path.join(REPO, 'e2e/.auth/state.json');

await mkdir(SCREEN_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: AUTH_STATE,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('response', (resp) => {
  if (resp.status() >= 500) errors.push(`${resp.status()} ${resp.url()}`);
});

let step = 0;
async function shot(label) {
  step++;
  const file = path.join(SCREEN_DIR, `${String(step).padStart(2, '0')}_${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[shot] ${file}`);
  return file;
}

// ── Step 1: Navigate to account-overview?tab=dwh-plan ────────────────────────
console.log('\n--- Step 1: navigate to /account-overview?tab=dwh-plan ---');
await page.goto('http://localhost:3000/account-overview?tab=dwh-plan', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForTimeout(3000);
await shot('account-overview-dwh-plan-landing');

// ── Step 2: Wait for DWH plan content to load (no spinner) ───────────────────
console.log('\n--- Step 2: wait for DWH plan content ---');
try {
  // wait for the pillar section or error/retry
  await page.waitForSelector(
    'h2:has-text("DWH Action Plan"), [class*="animate-pulse"], button:has-text("Retry")',
    { timeout: 15000 },
  );
} catch {
  console.log('  (timeout waiting for DWH plan heading — continuing)');
}
await page.waitForTimeout(2000);
await shot('dwh-plan-loaded');

// ── Step 3: Check if DryRunGate buttons are present ──────────────────────────
console.log('\n--- Step 3: detect DryRunGate buttons ---');
const dryRunBtn = await page.$('button:has-text("Dry-run gratuit")');
const realRunBtn = await page.$('button:has-text("réel")');
const costBadge = await page.$('[title="Coût estimé du run réel"]');
console.log(`  DryRunGate "Dry-run gratuit" btn: ${dryRunBtn ? 'FOUND' : 'NOT FOUND'}`);
console.log(`  DryRunGate real-run btn: ${realRunBtn ? 'FOUND' : 'NOT FOUND'}`);
console.log(`  Cost badge: ${costBadge ? 'FOUND' : 'NOT FOUND'}`);

// ── Step 4: Scroll down to see all pillars and CTAs ──────────────────────────
console.log('\n--- Step 4: scroll to see pillars ---');
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(500);
await shot('dwh-plan-pillars');

await page.evaluate(() => window.scrollTo(0, 800));
await page.waitForTimeout(500);
await shot('dwh-plan-pillars-lower');

await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(500);
await shot('dwh-plan-bottom');

// ── Step 5: Inspect all CTAs on the page ─────────────────────────────────────
console.log('\n--- Step 5: inspect CTAs on dwh-plan tab ---');
const ctaLinks = await page.$$eval('a[href]', (links) =>
  links.map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href') }))
    .filter((l) => l.href && l.href !== '#' && !l.href.startsWith('http'))
);
console.log('  CTA links found on page:', JSON.stringify(ctaLinks, null, 2));

const ctaButtons = await page.$$eval('button', (btns) =>
  btns.map((b) => b.textContent?.trim()).filter(Boolean)
);
console.log('  Buttons on page:', JSON.stringify(ctaButtons));

// ── Step 6: Try clicking a CTA if one exists (workflow or audit) ─────────────
const allCtaAnchors = await page.$$('a.inline-flex');
if (allCtaAnchors.length > 0) {
  console.log(`\n--- Step 6: click first CTA anchor (${allCtaAnchors.length} found) ---`);
  // Scroll to first and screenshot before clicking
  await allCtaAnchors[0].scrollIntoViewIfNeeded();
  await shot('cta-visible-before-click');
  const ctaText = await allCtaAnchors[0].textContent();
  const ctaHref = await allCtaAnchors[0].getAttribute('href');
  console.log(`  First CTA: "${ctaText?.trim()}" → ${ctaHref}`);
} else {
  console.log('\n--- Step 6: no inline-flex CTA anchors found on dwh-plan tab ---');
}

// ── Step 7: Navigate to explore-design to find DryRunGate in ingestion flow ──
console.log('\n--- Step 7: navigate to explore-design for IngestionDryRun ---');
await page.goto('http://localhost:3000/explore-design', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForTimeout(3000);
await shot('explore-design-landing');

// ── Step 8: Check for dry-run button in explore-design ───────────────────────
console.log('\n--- Step 8: detect dry-run UI in explore-design ---');
const edDryRunBtn = await page.$('button:has-text("Dry Run"), button:has-text("dry-run"), button:has-text("Dry run"), button:has-text("Ingestion Dry Run")');
console.log(`  Dry-run button in explore-design: ${edDryRunBtn ? 'FOUND' : 'NOT FOUND'}`);

// ── Step 9: Check workflow for WizardPreflightPanel / DryRun ─────────────────
console.log('\n--- Step 9: navigate to workflow for dry-run wizard ---');
await page.goto('http://localhost:3000/workflow', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForTimeout(3000);
await shot('workflow-landing');

const workflowDryRunBtn = await page.$('button:has-text("dry-run"), button:has-text("Dry Run"), button:has-text("Preflight")');
console.log(`  Dry-run/preflight button in workflow: ${workflowDryRunBtn ? 'FOUND' : 'NOT FOUND'}`);

// ── Step 10: back to account-overview, confirm no DryRunGate is wired ────────
console.log('\n--- Step 10: back to account-overview, confirm DryRunGate absence ---');
await page.goto('http://localhost:3000/account-overview?tab=dwh-plan', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
await page.waitForTimeout(3000);

// Final screenshot
await page.evaluate(() => window.scrollTo(0, 0));
await shot('final-dwh-plan-overview');

console.log('\n=== Console errors captured ===');
if (errors.length === 0) {
  console.log('  None');
} else {
  errors.forEach((e) => console.log('  ERR:', e));
}

await browser.close();
console.log('\nDone. Screenshots in:', SCREEN_DIR);
