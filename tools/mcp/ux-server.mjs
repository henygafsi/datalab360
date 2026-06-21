#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// data360-ux — MCP (stdio) server: live UI render + perf audits per role/persona.
//
// WRAPS the existing harnesses (does NOT reimplement the sweeps):
//   - e2e/ux-audit/render_all.mjs — its `browserClassify()` OK/EMPTY/ERROR signal
//       collector is lifted VERBATIM (text-extracted, injected via page.evaluate)
//       by lib/ux-harness.mjs. We can't import it (top-level sweep script) nor
//       refactor it (write-path constraint) nor shell out for non-HAHA personas
//       (it hardcodes HAHA login) — verbatim reuse is the faithful middle path.
//   - e2e/ux-audit/front_perf.mjs — its perf methodology (request→requestfinished
//       pairing, content-ready cap, NOT networkidle) is mirrored in-process
//       (can't shell out: hardcoded output path + PAGES list).
//
// TOOLS (all READ-ONLY — they navigate + observe, never mutate):
//   - ux_login      FE /signin as a persona; save Playwright storageState to
//                   tools/mcp/.state/<persona>.json (gitignored — carries a token)
//   - render_route  load one route under a persona → {httpStatus, renderState,
//                   consoleErrors[], failedRequests[], screenshotPath}
//   - sweep_routes  matrix over all_routes.json routes × personas → per-cell
//                   {renderState, errors}
//   - page_perf     cold+warm waterfall timings (content-ready, not networkidle)
//   - ping          liveness (no browser) — kept for the backend-independent smoke
//
// CLIENT of the running app (APP_BASE, default http://localhost:3000) + backend
// (API_BASE). Reuses @playwright/test from the monorepo ROOT node_modules.
// Credentials only via ux_login args or env (DATA360_E2E_PASSWORD); never logged.
//
// NOTE: every tool except `ping` launches Playwright and needs the dev app (:3000)
// up. While it's DOWN only boot + tools/list + ping are verifiable; the classifier
// injection + env-login fallback are deferred to an app-up smoke.
// ─────────────────────────────────────────────────────────────────────────────

import { createServer, toolJson, API_BASE, APP_BASE, harness } from './lib/client.mjs';
import { uxLogin, renderRoute, sweepRoutes, pagePerf, STATE_DIR, SHOTS_DIR } from './lib/ux-harness.mjs';

const s = createServer({ name: 'data360-ux', version: '0.1.0' });

// ── ping — liveness (no Playwright). Kept so smoke-list-tools.mjs passes. ─────
s.tool({
  name: 'ping',
  description: 'Liveness check for the data360-ux MCP server. Returns config + resolved harness/state paths (no secrets). Does not launch Playwright.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => toolJson({
    server: 'data360-ux',
    alive: true,
    app_base: APP_BASE,
    api_base: API_BASE,
    state_dir: STATE_DIR,
    shots_dir: SHOTS_DIR,
    harnesses: { render_all: harness('render_all.mjs'), front_perf: harness('front_perf.mjs'), all_routes: harness('all_routes.json') },
  }),
});

// ── ux_login — FE signin → save per-persona storageState ─────────────────────
s.tool({
  name: 'ux_login',
  description: 'Drive the FE /signin form with Playwright as a persona and save its authenticated Playwright storageState to tools/mcp/.state/<persona>.json (gitignored — it carries a session token). Subsequent render_route/sweep_routes/page_perf calls reuse that state for the persona. Read-only w.r.t. the backend (a normal user login). Credentials are used in-page only and never logged.',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string', description: 'account_name for the /signin form (e.g. HAHA)' },
      username: { type: 'string', description: 'username for the /signin form' },
      password: { type: 'string', description: 'password — used in-page only, never logged' },
      persona: { type: 'string', description: 'persona id for the saved state file (default: the username)' },
    },
    required: ['account', 'username', 'password'],
  },
  handler: async ({ account, username, password, persona }) => {
    const r = await uxLogin({ account, username, password, persona });
    // never echo the password back
    return toolJson({ ok: true, persona: r.persona, statePath: r.statePath, landedUrl: r.landedUrl, account: r.account, username: r.username });
  },
});

// ── render_route — one route under one persona ───────────────────────────────
s.tool({
  name: 'render_route',
  description: 'Load APP_BASE + <route> under a persona\'s saved state (falls back to an env-cred login if no state exists), wait for content-ready (render_all.mjs methodology), classify with the harness\'s verbatim browserClassify, screenshot, and return {httpStatus, renderState: ok|empty|error|loading, consoleErrors[], failedRequests[], screenshotPath}. renderState=error with note "auth-bounce" means the persona state expired → re-run ux_login.',
  inputSchema: {
    type: 'object',
    properties: {
      route: { type: 'string', description: 'route path, e.g. "/governance" or "/intelligent?tab=ai-advisor"' },
      persona: { type: 'string', description: 'persona id from ux_login (default: "default" = env creds)' },
    },
    required: ['route'],
  },
  handler: async ({ route, persona }) => toolJson(await renderRoute({ route, persona })),
});

// ── sweep_routes — routes × personas matrix ──────────────────────────────────
s.tool({
  name: 'sweep_routes',
  description: 'Render-audit matrix over routes × personas. Defaults to ALL routes in e2e/ux-audit/all_routes.json and persona ["default"]. Each cell is {route, renderState, errors, note} reusing the verbatim render_all classifier. RUNTIME: routes × personas × up-to-20s/route can be long — pass a routes subset and/or limit, and widen personas deliberately.',
  inputSchema: {
    type: 'object',
    properties: {
      routes: { type: 'array', items: { type: 'string' }, description: 'optional subset — route urls, names, or substrings from all_routes.json (ad-hoc "/path" entries allowed). Default: all routes.' },
      personas: { type: 'array', items: { type: 'string' }, description: 'persona ids from ux_login. Default: ["default"].' },
      limit: { type: 'integer', description: 'optional cap on number of routes (after filtering).' },
    },
  },
  handler: async ({ routes, personas, limit }) => toolJson(await sweepRoutes({ routes, personas, limit })),
});

// ── page_perf — cold+warm waterfall (content-ready, not networkidle) ─────────
s.tool({
  name: 'page_perf',
  description: 'Per-page load timings for one route under a persona using front_perf.mjs methodology: cold + warm visits, page-time = t0→content-ready (capped, NOT networkidle since the SSE cache-stream never idles), and per-endpoint latency via request→requestfinished pairing. Returns {cold_ms, warm_ms, slow_endpoints[], top_endpoints[], err}.',
  inputSchema: {
    type: 'object',
    properties: {
      route: { type: 'string', description: 'route path to measure' },
      persona: { type: 'string', description: 'persona id from ux_login (default: "default")' },
    },
    required: ['route'],
  },
  handler: async ({ route, persona }) => toolJson(await pagePerf({ route, persona })),
});

await s.start();
