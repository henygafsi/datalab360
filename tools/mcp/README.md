# data360-mcp — three MCP servers wrapping the Data360 audit harnesses

Three local [Model Context Protocol](https://modelcontextprotocol.io) servers (stdio
transport) that expose the existing Data360 audit machinery — real backend endpoints
and the Playwright sweeps in `e2e/ux-audit/` — as MCP tools Claude Code can call.

**They are CLIENTS of the running backend/app.** They hold no service-account (SVC)
env. They authenticate the same way the app does: `POST ${API_BASE}/user/login/`.

> Status: scaffold. Each server currently registers only a placeholder `ping` tool.
> The real tools (catalogs below) are added by the implement agents, one server file
> each. `lib/client.mjs` is shared and already done — do not fork it.

## Servers

| Server | File | Wraps | Base URLs |
|---|---|---|---|
| `data360-health` | `health-server.mjs` | Backend API + Redis-cache health endpoints (`/admin/api-health`, `/admin/server-metrics`, `/command-center/cache-metrics`) | `API_BASE` (default `http://127.0.0.1:8000`) |
| `data360-ux` | `ux-server.mjs` | Playwright sweeps `e2e/ux-audit/render_all.mjs` + `front_perf.mjs` | `APP_BASE` (`http://localhost:3000`) + `API_BASE` |
| `data360-roles` | `roles-server.mjs` | Cross-role RBAC persona matrix (vault `_RBAC_TEST_MATRIX.md`) | `API_BASE` |

### data360-health — tool catalog (implemented)

Read / probe:
- `ping` — liveness, no backend call (the smoke test depends on this).
- `health_login` — `login()` via the shared lib → `{ role, account, username, items }`. Token is **redacted** to a masked hint, never returned/logged. Caches the persona so later probes can omit creds.
- `probe_endpoint` — **generic** `GET|POST|… <path>` via `apiFetch` → `{ status, ms, ok, body, error }`. This is the un-opinionated escape hatch for hitting the **in-flux** `/admin/cache/*` warm·invalidate and `/admin/api-health/*` persist routes **without hardcoding their shapes**.
- `run_health_matrix` — runs a **curated READ-ONLY GET subset** across the major modules → `{ total, ok, "4xx", "5xx", net_errors, ms:{avg,max}, perEndpoint[] }`. Optional `{ modules }` filter. This is **not** the full browser-side FE api-health sweep (that runs service fns through `apiClient` and isn't callable offline) — it's a safe GET subset of paths confirmed in `src/lib/api-contracts.ts`.
- `cache_metrics` — `GET /command-center/cache-metrics`; extracts `key_counts_by_prefix` (d360/shared/session) + hit ratio, **and always returns the full `body`** (so a shape mismatch degrades to "data present, extraction missed").
- `svc_health` — `GET /admin/cache/service-account/health`
- `svc_registry` — `GET /admin/cache/svc-registry`
- `server_metrics` — `GET /admin/cache/server-metrics`
- `endpoint_timings` — `GET /admin/cache/endpoint-usage` (slowest / most-called; `top_n` hint)

Mutation — **DESTRUCTIVE**, each requires `confirm:true` (auto-enforced by the factory). Request **bodies are caller-supplied, never hardcoded**:
- `cache_warm` — `POST /admin/cache/warm` (override `path`); body e.g. `{ account, page?, module?, per_role? }`.
- `cache_invalidate` — `POST /admin/cache/invalidate-surface` (override `path`); body e.g. `{ account, page?, module?, shared_fns?, dry_run? }` (set `dry_run:true` to preview).

> **Forward-contract caveat.** The named `svc_health` / `svc_registry` / `server_metrics` / `endpoint_timings` paths (`/admin/cache/service-account/health`, `/svc-registry`, `/server-metrics`, `/endpoint-usage`) are forward contracts the cache-fix workflow is still finalizing — they **differ from** the current `src/lib/api-contracts.ts` `admin.cache.*` set (`/admin/cache/svc-health`, `/coverage`, `/warm-status`) and may `404/501` until deployed. For any route shape still in flux, use `probe_endpoint` — e.g. `probe_endpoint({ method:'POST', path:'/admin/api-health/runs', body:{…} })`. Every convenience tool returns the full `body` so nothing is silently dropped.

### data360-ux — tool catalog (to implement)
- `render_audit` — run `render_all.mjs` (honors `RENDER_LIMIT`/`RENDER_ONLY`); return the `render_all.json` summary (ok/empty/error/auth)
- `perf_audit` — run `front_perf.mjs`; return per-page cold/warm ms + slow endpoints
- `route_list` — read `e2e/ux-audit/all_routes.json` (the sweep's route source)

The harnesses read `DATA360_E2E_PASSWORD` from env — pass it through, never log it.
Use `harness(file)` from the lib for absolute harness paths.

### data360-roles — tool catalog (to implement)
Read-only assertions:
- `persona_login` — `login()` per persona (token cached **per persona**)
- `my_permissions` — `GET /gouvernance/d360-roles/my-permissions` (resolved allow-set)
- `rbac_matrix` — assert each persona's allow-set == intended set + disjointness
- `data_access_isolation` — `GET /common/databases` (+`/tables`) per persona — RBAC-scoped diff

Destructive (each requires `confirm:true` — provisioning mutates the Snowflake account, reversible):
- `provision_personas` — `create_service_user` + `assign_role` + `POST d360-roles` + `PUT .../permissions` + `POST gui-permissions`
- `teardown_personas` — `drop-users-batch` + `drop-roles-batch` + delete d360/gui rows
- `warm_role_cache` / `invalidate_role_cache` — `@account_role_cache` slots

## Shared library — `lib/client.mjs` (single source of truth)

All three servers import this. It enforces the cross-cutting invariants so the
3 disjoint server files cannot drift:

- **One auth path** — `login({account, username, password})` → `POST ${API_BASE}/user/login/`
  body `{account_name, username, password}` → caches the token **per persona** in an
  in-memory `Map` (`getCachedSession`/`clearSession`). `apiFetch(method, path, {token, body, params})`
  for everything else; returns `{status, ms, ok, body, error}` and never throws on HTTP status.
- **Credential hygiene** — creds come from tool args or env only, never hardcoded.
  `redact()` / `scrub()` / `maskToken()` mask any token/password before it is logged.
- **stderr-only logging** — `log()` writes to **stderr**. stdout is the JSON-RPC
  transport; writing to it corrupts the protocol. Never `console.log` in a server.
- **`createServer({name, version})`** → `.tool({name, description, inputSchema, destructive, handler})`
  then `.start()`. `inputSchema` is **plain JSON-Schema** (no zod dependency). The
  factory wires `ListTools`/`CallTool`, catches handler errors (→ `{isError:true}`),
  and enforces the **destructive gate**: a tool with `destructive:true` is auto-
  refused unless the caller passes `{confirm:true}` (a `confirm` boolean is auto-
  added to its schema). Return results with `toolText(...)` / `toolJson(...)`.
- `harness(file)` → absolute path into `e2e/ux-audit/`. `REPO_ROOT`, `API_BASE`, `APP_BASE` exported.

### Implement-agent quickstart
```js
import { createServer, apiFetch, login, toolJson } from './lib/client.mjs';
const s = createServer({ name: 'data360-health', version: '0.1.0' });
s.tool({
  name: 'cache_metrics',
  description: 'GET /command-center/cache-metrics — Redis key counts by prefix.',
  inputSchema: { type: 'object', properties: { account: {type:'string'}, username:{type:'string'}, password:{type:'string'} }, required:['account','username','password'] },
  handler: async ({ account, username, password }) => {
    const { token } = await login({ account, username, password });
    const r = await apiFetch('GET', '/command-center/cache-metrics', { token });
    return toolJson({ status: r.status, ms: r.ms, key_counts: r.body?.cache?.key_counts_by_prefix });
  },
});
s.tool({ name:'cache_invalidate', destructive:true, description:'Evict cache keys.', handler: async (a)=> { /* confirm:true already enforced */ } });
await s.start();
```

## Install / run

```bash
# Install the SDK ONLY (cwd = tools/mcp). NEVER run bare `npm install` — that would
# pull a duplicate @playwright/test and download browsers. Playwright is a
# peerDependency provided by the monorepo root node_modules (v1.58.2, browsers
# already installed) and resolves upward at runtime.
npm install @modelcontextprotocol/sdk@^1.29.0   # run with cwd=tools/mcp

# Backend-independent smoke (boots all 3 over stdio, lists tools, calls ping):
node smoke-list-tools.mjs        # or: npm run smoke

# Run one server directly (it speaks JSON-RPC on stdin/stdout):
node health-server.mjs           # diagnostics go to stderr
```

### Confirmed runtime facts (verified on this machine)
- Node **v24.12.0**, ESM, global `fetch` (no axios/node-fetch).
- `@modelcontextprotocol/sdk` **1.29.0**. Exact ESM import paths used by all servers:
  - `@modelcontextprotocol/sdk/server/index.js` → `Server`
  - `@modelcontextprotocol/sdk/server/stdio.js` → `StdioServerTransport`
  - `@modelcontextprotocol/sdk/types.js` → `ListToolsRequestSchema`, `CallToolRequestSchema`
  - (smoke client) `@modelcontextprotocol/sdk/client/index.js` → `Client`; `.../client/stdio.js` → `StdioClientTransport`
- `@playwright/test` **1.58.2** resolves upward from `tools/mcp` to the repo-root `node_modules` (browsers already present) — used only by `ux-server.mjs`.

## Approving in Claude Code

The servers are registered in the repo-root `.mcp.json` (project-scoped MCP config):

```json
{ "mcpServers": { "data360-health": { "command":"node", "args":["…/tools/mcp/health-server.mjs"], "env":{"API_BASE":"http://127.0.0.1:8000"} }, … } }
```

- **Project `.mcp.json` servers require user approval** and activate on approval /
  at the **next session** — they do **not** turn on mid-session. After this scaffold
  lands, restart Claude Code (or re-open the project) and approve the three
  `data360-*` servers when prompted. Inspect/manage them with the `/mcp` command.
- `.mcp.json` carries **only base URLs** — no credentials. `login()` takes creds as
  tool args or reads `API_ACCOUNT`/`API_USERNAME`/`API_PASSWORD` from env at call time.

## Current verifiability (backend DOWN)

The backend (`:8000`) and dev app (`:3000`) are down, so only **boot + `tools/list` +
`ping`** are verifiable now (all pass — see `smoke-list-tools.mjs`). Functional tool
calls (probes, sweeps, the RBAC matrix) are deferred to a **backend-up smoke** once
the user launches the backend (`CACHE_READ_ALLOW_USER_FALLBACK=1`) and dev server.
