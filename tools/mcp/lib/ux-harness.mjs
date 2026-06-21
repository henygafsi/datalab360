// ─────────────────────────────────────────────────────────────────────────────
// data360-mcp / lib/ux-harness.mjs
// Persona-aware Playwright runner for the data360-ux MCP server.
//
// WRAP, DO NOT REIMPLEMENT (per mandate): the load-bearing OK/EMPTY/ERROR signal
// collector — `browserClassify()` — is lifted *verbatim* from the real harness
// e2e/ux-audit/render_all.mjs at runtime (text-extracted, then injected into the
// page with page.evaluate). We CANNOT import render_all.mjs as a module (it is a
// top-level script that logs in + runs the whole sweep on import) and we CANNOT
// refactor it to export the function (write-path constraint: this build may only
// create files under tools/mcp/). Text-extraction is therefore the only way to
// reuse the exact harness classifier AND still support non-HAHA personas — which
// render_all can't do (it hardcodes the HAHA login). The extraction is FAIL-LOUD:
// if browserClassify can't be located, we throw rather than silently substitute a
// divergent inline classifier (silent divergence is the exact failure this whole
// approach exists to prevent).
//
// The content-ready wait (render path) mirrors render_all's waitForFunction
// (SKELETON_AREA gate, 20s); the perf path mirrors front_perf.mjs (request→
// requestfinished pairing, content-ready cap, NOT networkidle — the SSE
// cache-stream never idles). front_perf.mjs cannot be shelled out to: it writes
// to a hardcoded /Users/.../jobs/<id>/tmp path and has a hardcoded PAGES list.
//
// Read-only. CLIENT of the running app (APP_BASE) + backend (API_BASE). Holds no
// service-account env. Credentials only via ux_login args or env; never logged.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { APP_BASE, REPO_ROOT, harness, log, redact, scrub } from './client.mjs';

// ── Persona state + screenshot dirs (under tools/mcp/, gitignored) ───────────
const MCP_DIR = path.resolve(REPO_ROOT, 'tools', 'mcp');
export const STATE_DIR = path.join(MCP_DIR, '.state');
export const SHOTS_DIR = path.join(MCP_DIR, '.shots');

/** Filesystem-safe persona id (used for the state file + shot folder names). */
export function safePersona(persona) {
  const p = String(persona || 'default').trim() || 'default';
  return p.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 64);
}
/** Absolute path to a persona's saved Playwright storageState. */
export function statePathFor(persona) {
  return path.join(STATE_DIR, `${safePersona(persona)}.json`);
}
/** Absolute path to a per-persona screenshot for a given route name. */
function shotPathFor(persona, routeName) {
  const dir = path.join(SHOTS_DIR, safePersona(persona));
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(routeName).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'route';
  return path.join(dir, `${safe}.png`);
}

// ── Verbatim classifier extraction from render_all.mjs (FAIL-LOUD, cached) ────
let _classifierSrc = null;
/**
 * Read e2e/ux-audit/render_all.mjs and extract the `function browserClassify()`
 * source verbatim. Throws (never silently substitutes) if it can't be found.
 * Cached after first successful extraction.
 */
export function getClassifierSrc() {
  if (_classifierSrc) return _classifierSrc;
  const file = harness('render_all.mjs');
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`ux-harness: cannot read harness ${file} — ${e.message} (is e2e/ux-audit present?)`);
  }
  _classifierSrc = extractFunctionSource(src, 'browserClassify', file);
  return _classifierSrc;
}

/**
 * Extract a top-level `function <name>() { ... }` body verbatim from JS source by
 * brace-matching, skipping braces inside strings/template-literals and //, /* *​/
 * comments. Throws on not-found or unbalanced braces — caller relies on this to
 * detect divergence from the harness.
 */
export function extractFunctionSource(src, name, file = '<source>') {
  const sig = `function ${name}`;
  const at = src.indexOf(sig);
  if (at === -1) throw new Error(`ux-harness: '${sig}' NOT FOUND in ${file} — harness classifier moved/renamed; refusing to substitute a divergent inline classifier`);
  let i = src.indexOf('{', at);
  if (i === -1) throw new Error(`ux-harness: opening brace for '${name}' not found in ${file}`);
  let depth = 0;
  let inStr = null;      // active quote char ' " `
  let inLine = false;    // // comment
  let inBlock = false;   // /* */ comment
  for (; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      if (c === '\\') { i++; continue; } // skip escaped char
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error(`ux-harness: unbalanced braces extracting '${name}' from ${file}`);
}

// ── Content-ready predicates (mirror the harnesses; IIFE strings for evaluate) ─
// Mirrors render_all.mjs's waitForFunction body: only SKELETON-sized busy nodes
// (>=4000 px²) block readiness AND <main> must have >200 chars of real text.
export const RENDER_READY_SRC = `(() => {
  const SKELETON_AREA = 4000;
  const busy = [...document.querySelectorAll('[class*="animate-pulse"],[class*="animate-spin"],[role="status"],[aria-busy="true"]')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.width * r.height >= SKELETON_AREA; });
  if (busy.length) return false;
  const root = document.querySelector('main') || document.body;
  return !!root && root.innerText.trim().length > 200;
})()`;
// Mirrors front_perf.mjs's content-ready (any visible busy node blocks).
export const PERF_READY_SRC = `(() => {
  const busy = document.querySelectorAll('[class*="animate-pulse"],[class*="animate-spin"],[role="status"],[aria-busy="true"]');
  if (busy.length) return false;
  const root = document.querySelector('main') || document.body;
  return !!root && root.innerText.trim().length > 200;
})()`;

// ── Status mapping (mirrors render_all's node-side decision tree) ─────────────
// render_all uses OK/EMPTY/ERROR/AUTH; this server's enum is ok|empty|error|loading.
// auth-bounce folds into `error` but is ALWAYS tagged in the note so a persona
// cell can be read as "saved state expired — re-run ux_login" vs "route broken".
// `loading` = content never became ready within the cap (still spinning).
export function classifyRender({ sig, capped, httpStatus, gotoError }) {
  const notes = [];
  if (gotoError) notes.push(gotoError);
  if (httpStatus != null) notes.push(`http=${httpStatus}`);
  let renderState;
  if (!sig) {
    renderState = 'error'; notes.push('classify-eval-failed');
  } else if (sig.onSignin) {
    renderState = 'error'; notes.push('auth-bounce'); // distinct, intentional label
  } else if (sig.errorOverlay || sig.errorBoundaryText) {
    renderState = 'error'; notes.push(sig.errorOverlay ? 'nextjs-error-overlay' : 'error-boundary-copy');
  } else if (httpStatus != null && httpStatus >= 400) {
    renderState = 'error'; notes.push(`http-${httpStatus}`);
  } else if (sig.dataNodes > 0 && sig.dataNodes > sig.emptyMarkers) {
    renderState = 'ok'; notes.push(`data=${sig.dataNodes}`);
  } else if (capped) {
    renderState = 'loading'; notes.push('content-cap');
  } else if (sig.mainTextLen > 200) {
    renderState = 'empty'; notes.push(`data=${sig.dataNodes} empty=${sig.emptyMarkers}`);
  } else {
    renderState = 'empty'; notes.push(`thin-content len=${sig.mainTextLen}`);
  }
  if (capped && renderState !== 'loading') notes.push('content-cap');
  return { renderState, note: notes.join(';') };
}

// ── Login (FE signin) — mirrors _login-save.mjs / front_perf.mjs robust flow ──
function envCreds() {
  // No hardcoded account/username defaults — a missing value must error at login,
  // not silently assume a specific tenant. Pass via tool args or API_ACCOUNT /
  // API_USERNAME / (DATA360_E2E_PASSWORD|API_PASSWORD) env.
  return {
    account: process.env.API_ACCOUNT || '',
    username: process.env.API_USERNAME || '',
    password: process.env.DATA360_E2E_PASSWORD || process.env.API_PASSWORD || '',
  };
}

/**
 * Drive the FE /signin form with Playwright and land on a dashboard route.
 * Credentials are used in-page only; NEVER logged (only username@account + a
 * masked length are logged via log()/scrub()). Throws on failure.
 */
export async function feSignin(page, { account, username, password }) {
  if (!account || !username || !password) {
    throw new Error('feSignin requires { account, username, password } — pass via ux_login args or env (DATA360_E2E_PASSWORD); no creds hardcoded');
  }
  await page.goto(`${APP_BASE}/signin`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 30000 });
  await page.waitForSelector('input[name="account_name"]', { state: 'visible', timeout: 30000 });
  await page.fill('input[name="account_name"]', account);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.waitForTimeout(300); // let the React signIn handler attach
  await page.click('button[type="submit"]');
  const ok = await page
    .waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    const hint = await page
      .locator('text=/invalid|error|incorrect|failed|credentials/i')
      .first().textContent().catch(() => null);
    throw new Error(`feSignin: still on /signin for ${username}@${account}${hint ? ` — "${redact(hint).slice(0, 60)}"` : ' (check creds / app up)'}`);
  }
  await page.waitForTimeout(1000); // session/localStorage settle
  log(`[ux] signin ok ${scrub({ username, account }).username}@${account} → ${page.url()}`);
}

// ── Persona context resolution ───────────────────────────────────────────────
// A persona's auth = a saved storageState file at .state/<persona>.json. If it
// exists we load it; otherwise we fall back to an env-cred FE signin (and persist
// the state for reuse). NOTE: a PRESENT-but-STALE state file (session ~55min) is
// NOT a missing file, so it won't trigger this fallback — it surfaces downstream
// as renderState:error note:auth-bounce, i.e. "re-run ux_login".
async function openPersonaContext(browser, persona) {
  const statePath = statePathFor(persona);
  const ctxOpts = { viewport: { width: 1440, height: 900 } };
  if (fs.existsSync(statePath)) {
    const ctx = await browser.newContext({ ...ctxOpts, storageState: statePath });
    return { ctx, page: await ctx.newPage(), source: 'state' };
  }
  // No saved state → env-cred signin fallback so render/sweep/perf are usable
  // even if ux_login wasn't called first (mirrors how the harnesses self-login).
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await feSignin(page, envCreds());
  fs.mkdirSync(STATE_DIR, { recursive: true });
  await ctx.storageState({ path: statePath });
  return { ctx, page, source: 'env-login' };
}

// ── URL / route helpers ──────────────────────────────────────────────────────
/** Normalize a route to a leading-slash app path (accepts "/x", "x", "x?tab=y"). */
export function normRoute(route) {
  let r = String(route || '').trim();
  if (!r) throw new Error('route is required');
  if (!r.startsWith('/')) r = '/' + r;
  return r;
}
/** Short, secret-free label for a request URL (strips base + query). */
function shortUrl(u) {
  try {
    const url = new URL(u);
    let p = url.pathname;
    const proxy = p.indexOf('/api-proxy/');
    if (proxy !== -1) p = p.slice(proxy + '/api-proxy/'.length);
    return redact(p).slice(0, 64);
  } catch {
    return redact(String(u)).slice(0, 64);
  }
}
/** Derive the all_routes.json-style name for a route url (for screenshots). */
function routeName(route) {
  return normRoute(route).replace(/^\//, '').replace(/[/?=&]/g, '-') || 'home';
}

// ── Single-route render (the core probe shared by render_route + sweep) ───────
/**
 * Navigate `page` to `route`, wait content-ready (render_all methodology), run the
 * verbatim browserClassify, screenshot, and collect console errors + failed
 * requests. Returns the render_route result shape.
 */
export async function renderOnePage(page, route, persona) {
  const r = normRoute(route);
  const classifierSrc = getClassifierSrc(); // FAIL-LOUD if harness moved
  const consoleErrors = [];
  const failedRequests = [];
  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(redact(m.text()).slice(0, 200)); };
  const onPageErr = (e) => { consoleErrors.push('pageerror:' + redact(e.message || String(e)).slice(0, 200)); };
  const onFail = (req) => {
    const f = req.failure();
    failedRequests.push({ url: shortUrl(req.url()), method: req.method(), error: f ? f.errorText : 'failed' });
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageErr);
  page.on('requestfailed', onFail);

  let httpStatus = null;
  let gotoError = null;
  try {
    const resp = await page.goto(`${APP_BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    httpStatus = resp ? resp.status() : null;
  } catch (e) {
    gotoError = 'nav:' + redact(e.message).slice(0, 50);
  }

  // content-ready (render_all methodology); capped===true means never became ready
  const capped = await page
    .waitForFunction(RENDER_READY_SRC, { timeout: 20000 })
    .then(() => false)
    .catch(() => true);
  await page.waitForTimeout(800); // settle late KPI/table fills before sampling

  const sig = await page.evaluate(`(${classifierSrc})()`).catch(() => null);
  const { renderState, note } = classifyRender({ sig, capped, httpStatus, gotoError });

  const screenshotPath = shotPathFor(persona, routeName(r));
  await page.screenshot({ path: screenshotPath }).catch(() => {});

  page.off('console', onConsole);
  page.off('pageerror', onPageErr);
  page.off('requestfailed', onFail);

  return {
    route: r,
    httpStatus,
    renderState,
    note,
    consoleErrors: consoleErrors.slice(0, 20),
    failedRequests: failedRequests.slice(0, 20),
    screenshotPath,
  };
}

// ── Public entry points used by the tools ────────────────────────────────────

/** ux_login: FE signin for a persona; save storageState; return {persona,...}. */
export async function uxLogin({ account, username, password, persona }) {
  const pid = safePersona(persona || username);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await feSignin(page, { account, username, password });
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const statePath = statePathFor(pid);
    await ctx.storageState({ path: statePath });
    const landedUrl = page.url();
    await ctx.close();
    return { persona: pid, statePath, landedUrl, account, username };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** render_route: one route under one persona's state. */
export async function renderRoute({ route, persona = 'default' }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page, source } = await openPersonaContext(browser, persona);
    try {
      const res = await renderOnePage(page, route, persona);
      return { persona: safePersona(persona), authSource: source, ...res };
    } finally {
      await ctx.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

/** sweep_routes: matrix over routes × personas → per-cell {renderState, errors}. */
export async function sweepRoutes({ routes, personas = ['default'], limit }) {
  const all = loadAllRoutes();
  let selected = all;
  if (Array.isArray(routes) && routes.length) {
    // accept route urls OR names OR substrings
    selected = all.filter((rt) => routes.some((q) => rt.url === q || rt.name === q || rt.url.includes(q) || rt.name.includes(q)));
    // also allow ad-hoc routes not in all_routes.json (still sweepable)
    for (const q of routes) {
      if (!all.some((rt) => rt.url === q || rt.name === q || rt.url.includes(q) || rt.name.includes(q)) && q.startsWith('/')) {
        selected.push({ url: q, name: routeName(q) });
      }
    }
  }
  if (limit && Number.isInteger(limit)) selected = selected.slice(0, limit);

  const personaList = (Array.isArray(personas) && personas.length ? personas : ['default']).map(safePersona);
  const browser = await chromium.launch({ headless: true });
  const cells = {};
  const summary = {};
  try {
    for (const persona of personaList) {
      let ctx, page, source;
      try {
        ({ ctx, page, source } = await openPersonaContext(browser, persona));
      } catch (e) {
        // whole persona unauthenticated — record one error cell row, continue
        cells[persona] = selected.map((rt) => ({ route: rt.url, renderState: 'error', errors: 1, note: 'persona-auth-failed:' + redact(e.message).slice(0, 60) }));
        summary[persona] = { ok: 0, empty: 0, loading: 0, error: selected.length, authSource: 'none' };
        continue;
      }
      const row = [];
      const counts = { ok: 0, empty: 0, loading: 0, error: 0, authSource: source };
      try {
        for (const rt of selected) {
          const res = await renderOnePage(page, rt.url, persona);
          counts[res.renderState] = (counts[res.renderState] || 0) + 1;
          row.push({
            route: rt.url,
            renderState: res.renderState,
            errors: res.consoleErrors.length + res.failedRequests.length,
            note: res.note,
          });
        }
      } finally {
        await ctx.close().catch(() => {});
      }
      cells[persona] = row;
      summary[persona] = counts;
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { personas: personaList, routeCount: selected.length, summary, cells };
}

/** page_perf: cold+warm waterfall (front_perf methodology) for one route. */
export async function pagePerf({ route, persona = 'default' }) {
  const r = normRoute(route);
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page, source } = await openPersonaContext(browser, persona);
    try {
      const cold = await perfVisit(page, r);
      const warm = await perfVisit(page, r); // 2nd visit: dev-compiled + cache warm
      const screenshotPath = shotPathFor(persona, routeName(r) + '-perf');
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      const slowEps = warm.endpoints.filter((e) => e.ms > 1500);
      return {
        persona: safePersona(persona),
        authSource: source,
        route: r,
        cold_ms: cold.ms,
        warm_ms: warm.ms,
        capped: cold.capped || warm.capped,
        slow_endpoints: slowEps,
        top_endpoints: warm.endpoints.slice(0, 8),
        err: cold.err || warm.err || null,
        screenshotPath,
      };
    } finally {
      await ctx.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

// front_perf.mjs visit(): page-time = t0→content-ready (capped 25s, NOT
// networkidle); per-endpoint latency = manual request→requestfinished pairing
// keyed on the request OBJECT (the SSE cache-stream never finishes → excluded).
async function perfVisit(page, route) {
  const eps = [];
  const starts = new Map();
  const onReq = (req) => { if (req.url().includes('/api-proxy/')) starts.set(req, Date.now()); };
  const onFin = (req) => {
    const s = starts.get(req);
    if (s != null) { eps.push({ path: shortUrl(req.url()), ms: Date.now() - s }); starts.delete(req); }
  };
  const onFail = (req) => { starts.delete(req); };
  page.on('request', onReq);
  page.on('requestfinished', onFin);
  page.on('requestfailed', onFail);

  const t0 = Date.now();
  let err = '';
  try {
    await page.goto(`${APP_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } catch (e) {
    err = 'nav:' + redact(e.message).slice(0, 60);
  }
  const capped = await page
    .waitForFunction(PERF_READY_SRC, { timeout: 25000 })
    .then(() => false)
    .catch(() => true);
  const ms = Date.now() - t0;

  page.off('request', onReq);
  page.off('requestfinished', onFin);
  page.off('requestfailed', onFail);

  const body = await page.content().catch(() => '');
  if (/ChunkLoadError|Unhandled Runtime Error|Application error/i.test(body)) err = (err ? err + ';' : '') + 'CHUNK/RUNTIME-ERROR';
  if (capped) err = (err ? err + ';' : '') + 'CONTENT-CAP-25s';

  eps.sort((a, b) => b.ms - a.ms);
  return { ms, endpoints: eps, capped, err: err || null };
}

// ── all_routes.json loader (the sweep's route source) ────────────────────────
let _routes = null;
export function loadAllRoutes() {
  if (_routes) return _routes;
  const file = harness('all_routes.json');
  _routes = JSON.parse(fs.readFileSync(file, 'utf8')).routes;
  return _routes;
}
