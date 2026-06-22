#!/usr/bin/env node
/**
 * Next.js page runtime audit for Data360.
 *
 * Discovers app-router pages, signs in with DATA360_E2E_* credentials when
 * provided, visits each route, and writes JSON/Markdown reports plus screenshots
 * for failing pages. It is intentionally black-box: page crash, Next overlay,
 * HTTP 5xx, blank shell, and console/page errors are surfaced as CI artifacts.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'apps', 'data360', 'src', 'app');
const OUT = process.env.PAGE_AUDIT_OUT || 'reports/page-audit';
const BASE = (process.env.PAGE_AUDIT_BASE_URL || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const WAIT_MS = Number(process.env.PAGE_AUDIT_WAIT_MS || 2500);
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name === 'page.tsx') acc.push(full);
  }
  return acc;
}

function routeFromPage(file) {
  const rel = relative(APP_DIR, file).split(sep);
  rel.pop();
  const parts = rel.filter((part) => part && !/^\(.+\)$/.test(part));
  const route = '/' + parts.join('/');
  return route === '/page' ? '/' : route.replace(/\/page$/, '') || '/';
}

function discoveredRoutes() {
  const explicit = (process.env.PAGE_AUDIT_ROUTES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  return [...new Set(walk(APP_DIR).map(routeFromPage))]
    .filter((route) => !route.includes('['))
    .sort((a, b) => a.localeCompare(b));
}

function requiredEnv(name) {
  const value = process.env[name] || '';
  return value.trim();
}

async function signIn(page) {
  const account = requiredEnv('DATA360_E2E_ACCOUNT');
  const username = requiredEnv('DATA360_E2E_USER');
  const password = requiredEnv('DATA360_E2E_PASSWORD');
  if (!account || !username || !password) {
    return { attempted: false, ok: false, reason: 'DATA360_E2E_* credentials not provided' };
  }

  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  try {
    await page.locator('input[name="account_name"]').fill(account, { timeout: 20_000 });
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    // Click the submit button — pressing Enter does NOT submit this react-hook-form
    // (the custom Input components don't propagate Enter to form submit), which
    // previously left the audit stuck on /signin and falsely "passing" signin shells.
    await page.locator('button[type="submit"]').first().click().catch(async () => {
      await page.locator('input[name="password"]').press('Enter').catch(() => {});
    });
    const ok = await page
      .waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    return { attempted: true, ok, reason: ok ? '' : 'still on signin after submit' };
  } catch (error) {
    return { attempted: true, ok: false, reason: String(error?.message || error).slice(0, 300) };
  }
}

async function hasErrorOverlay(page) {
  return page.evaluate(() => {
    if (document.querySelector('nextjs-portal')) return true;
    const title = (document.title || '').trim();
    if (/^(404|500|Application error|Internal Server Error)/i.test(title)) return true;
    const h1 = document.querySelector('h1');
    const text = document.body?.innerText || '';
    if (h1 && /Application error|Something went wrong|Unhandled Runtime Error|could not be found/i.test(h1.textContent || '') && text.length < 1000) {
      return true;
    }
    return false;
  }).catch(() => true);
}

async function auditRoute(browser, route, viewport, loginState) {
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedApi = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on('pageerror', (err) => pageErrors.push(String(err?.message || err).slice(0, 400)));
  page.on('response', async (res) => {
    const url = res.url();
    if (!/\/api-proxy\/|\/api\//.test(url)) return;
    if (/\/api\/auth\//.test(url)) return;
    if (res.status() < 400) return;
    failedApi.push({ status: res.status(), method: res.request().method(), url: url.replace(BASE, '').slice(0, 240) });
  });

  if (loginState?.cookies?.length || loginState?.origins?.length) {
    await ctx.addCookies(loginState.cookies || []).catch(() => {});
  }

  const started = Date.now();
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(WAIT_MS);
  const status = response?.status?.() || 0;
  const finalUrl = page.url().replace(BASE, '');
  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  const overlay = await hasErrorOverlay(page);
  const interactive = await page.locator('button:visible, a:visible, input:visible, [role="button"]:visible').count().catch(() => 0);
  const redirectedToSignin = finalUrl.startsWith('/signin');
  const pass =
    status > 0 &&
    status < 400 &&
    !overlay &&
    bodyText.length > 200 &&
    pageErrors.length === 0 &&
    !redirectedToSignin;

  let screenshot = '';
  if (!pass) {
    const safe = `${viewport.name}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}.png`;
    screenshot = join(OUT, safe);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  }

  await ctx.close();
  return {
    route,
    viewport: viewport.name,
    status,
    finalUrl,
    bodyLength: bodyText.length,
    interactive,
    overlay,
    redirectedToSignin,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    failedApi,
    sampleConsoleErrors: consoleErrors.slice(0, 5),
    samplePageErrors: pageErrors.slice(0, 5),
    durationMs: Date.now() - started,
    pass,
    screenshot,
  };
}

async function main() {
  const routes = discoveredRoutes();
  const browser = await chromium.launch({ headless: true });
  const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const loginPage = await loginCtx.newPage();
  const login = await signIn(loginPage);
  const state = login.ok ? await loginCtx.storageState() : null;
  await loginCtx.close();

  const results = [];
  for (const route of routes) {
    for (const viewport of VIEWPORTS) {
      const result = await auditRoute(browser, route, viewport, state);
      results.push(result);
      console.log(`${result.pass ? 'PASS' : 'FAIL'} ${viewport.name} ${route} status=${result.status} body=${result.bodyLength} final=${result.finalUrl}`);
    }
  }
  await browser.close();

  const summary = {
    baseUrl: BASE,
    login,
    routes: routes.length,
    checks: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
  };
  const report = { summary, results };
  writeFileSync(join(OUT, 'page-audit.json'), JSON.stringify(report, null, 2));

  const md = [
    '# Page Audit',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| routes | ${summary.routes} |`,
    `| checks | ${summary.checks} |`,
    `| passed | ${summary.passed} |`,
    `| failed | ${summary.failed} |`,
    `| login attempted | ${login.attempted ? 'yes' : 'no'} |`,
    `| login ok | ${login.ok ? 'yes' : 'no'} |`,
    '',
    '## Failures',
    '',
    '| Viewport | Status | Route | Final URL | Signals |',
    '|---|---:|---|---|---|',
    ...results
      .filter((r) => !r.pass)
      .map((r) => `| ${r.viewport} | ${r.status} | \`${r.route}\` | \`${r.finalUrl}\` | overlay=${r.overlay}, signin=${r.redirectedToSignin}, pageErrors=${r.pageErrorCount}, consoleErrors=${r.consoleErrorCount}, api4xx5xx=${r.failedApi.length} |`),
  ].join('\n');
  writeFileSync(join(OUT, 'page-audit.md'), md);

  if (!login.ok) {
    console.error(`Page audit login failed: ${login.reason}`);
    process.exit(1);
  }
  process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
