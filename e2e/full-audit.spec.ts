import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SIGNIN_ACCOUNT = process.env.TEST_ACCOUNT || 'ESPRIT';
const SIGNIN_USER = process.env.TEST_USER || 'aymen';
const SIGNIN_PASS = process.env.TEST_PASS || 'Aymenzouari58604483!';
const REG_ORG = 'HAHA';
const REG_USER = 'HAHA';
const REG_EMAIL = 'HAHA@HAHA.tn';
const REG_PASS = 'NewSecurePassword123!';

const PAGES = [
  '/account-overview',
  '/gouvernance',
  '/data-quality',
  '/observability',
  '/explore-design',
  '/workflow',
  '/intelligent',
];

const ACC_OV_TABS = [
  'Dashboard', 'Modules', 'Projects & AI', 'Snowflake Explorer',
  'Security & Audit', 'Cost & Performance', 'Platform Activity',
];

type Captured = { context: string; type: 'api' | 'console'; status?: number; method?: string; url?: string; text?: string };
const captured: Captured[] = [];
let currentCtx = 'init';

function attachListeners(page: Page) {
  page.removeAllListeners('response');
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('response', async resp => {
    const s = resp.status();
    const url = resp.url();
    if (s >= 400 && (url.includes('api.datalab360.io') || url.includes('/api-proxy/') || url.includes('/api/'))) {
      let body = '';
      try { body = (await resp.text()).slice(0, 200); } catch {}
      captured.push({ context: currentCtx, type: 'api', status: s, method: resp.request().method(), url: url.replace(BASE, ''), text: body });
    }
  });
  page.on('console', m => {
    if (m.type() === 'error') captured.push({ context: currentCtx, type: 'console', text: m.text().slice(0, 250) });
  });
  page.on('pageerror', e => captured.push({ context: currentCtx, type: 'console', text: 'pageerror: ' + e.message }));
}

async function tryFill(page: Page, sels: string[], val: string) {
  for (const s of sels) { const el = page.locator(s).first(); if (await el.count() > 0) { await el.fill(val); return s; } }
  return null;
}

test('FULL AUDIT: register → signin → all pages → all tabs', async ({ page }) => {
  test.setTimeout(360_000);
  attachListeners(page);

  // ─── 1. REGISTER attempt
  currentCtx = 'register';
  console.log('\n━━━ REGISTER ━━━');
  await page.goto(`${BASE}/auth/sign-up-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/audit-01-register-form.png', fullPage: true });

  await tryFill(page, ['input[name="organisation_name"]', 'input[name="organization_name"]', 'input[name="organization"]', 'input[placeholder*="organisation" i]', 'input[placeholder*="organization" i]'], REG_ORG);
  await tryFill(page, ['input[name="username"]', 'input[name="user"]'], REG_USER);
  await tryFill(page, ['input[name="email"]', 'input[type="email"]'], REG_EMAIL);
  // password fields are at least 2 in register
  const pwds = page.locator('input[type="password"]');
  const pwdCount = await pwds.count();
  for (let i = 0; i < pwdCount; i++) await pwds.nth(i).fill(REG_PASS);
  await page.screenshot({ path: '/tmp/audit-02-register-filled.png', fullPage: true });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(8000);
  console.log('register URL after submit:', page.url());
  await page.screenshot({ path: '/tmp/audit-03-register-after.png', fullPage: true });

  // ─── 2. SIGNIN with valid creds
  currentCtx = 'signin';
  console.log('\n━━━ SIGNIN ━━━');
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await tryFill(page, ['input[name="account"]', 'input[name="account_name"]', 'input[name="accountName"]', 'input[placeholder*="account" i]'], SIGNIN_ACCOUNT);
  await tryFill(page, ['input[name="username"]', 'input[name="email"]'], SIGNIN_USER);
  await tryFill(page, ['input[name="password"]', 'input[type="password"]'], SIGNIN_PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.toString().includes('/signin'), { timeout: 60_000 });
  await page.waitForTimeout(2500);
  console.log('post-signin URL:', page.url());

  // ─── 3. NAVIGATE all pages
  for (const path of PAGES) {
    currentCtx = `page${path}`;
    console.log(`\n━━━ PAGE ${path} ━━━`);
    const t0 = Date.now();
    const r = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(e => null);
    await page.waitForTimeout(2500);
    const renderMs = Date.now() - t0;
    const finalUrl = page.url();
    const fname = `/tmp/audit-page-${path.replace(/\//g, '_')}.png`;
    await page.screenshot({ path: fname, fullPage: true }).catch(() => {});
    console.log(`  status=${r?.status()} render=${renderMs}ms final=${finalUrl}`);
  }

  // ─── 4. ACCOUNT-OVERVIEW TABS
  await page.goto(`${BASE}/account-overview`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // Dismiss onboarding modal if present (Skip / Close / X buttons)
  for (const sel of ['button:has-text("Skip")', 'button:has-text("Skip Tour")', 'button:has-text("Close")', 'button[aria-label="Close"]', 'button:has-text("Got it")']) {
    const b = page.locator(sel).first();
    if (await b.count() > 0 && await b.isVisible()) { await b.click(); await page.waitForTimeout(800); console.log('Dismissed modal:', sel); break; }
  }
  // Force-press Escape too
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1000);

  for (const tabLabel of ACC_OV_TABS) {
    currentCtx = `tab:${tabLabel}`;
    console.log(`\n━━━ TAB ${tabLabel} ━━━`);
    const t0 = Date.now();
    const btn = page.locator(`[role="tab"]:has-text("${tabLabel}")`).first();
    if (await btn.count() === 0) { console.log('  ⚠ tab not found'); continue; }
    await btn.click({ force: true }).catch(e => console.log('  click err:', e.message.slice(0, 80)));
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log(`  rendered in ${Date.now() - t0}ms`);
    const fname = `/tmp/audit-tab-${tabLabel.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.screenshot({ path: fname, fullPage: true });
  }

  // ─── 5. REPORT
  console.log('\n\n========== ERROR REPORT ==========');
  const byCtx: Record<string, { api: Captured[]; console: Captured[] }> = {};
  for (const c of captured) {
    byCtx[c.context] ||= { api: [], console: [] };
    byCtx[c.context][c.type].push(c);
  }
  for (const [ctx, e] of Object.entries(byCtx)) {
    if (e.api.length || e.console.length) {
      console.log(`\n[${ctx}] ${e.api.length} api errors, ${e.console.length} console`);
      e.api.slice(0, 5).forEach(x => console.log(`  API ${x.status} ${x.method} ${x.url} ${(x.text||'').slice(0,100)}`));
      const seen = new Set();
      e.console.slice(0, 8).forEach(x => { if (!seen.has(x.text!.slice(0,80))) { seen.add(x.text!.slice(0,80)); console.log(`  CON ${x.text}`); } });
    }
  }
  const fs = require('fs');
  fs.writeFileSync('/tmp/audit-report.json', JSON.stringify(captured, null, 2));
  console.log(`\nTotal captured: ${captured.length}`);
});
