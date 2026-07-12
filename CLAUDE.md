# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a **pnpm Turborepo monorepo** with one active app:

- `apps/data360/` — the main Next.js 14 (App Router) frontend for the Data360 platform
- `packages/data360-core/` — shared components, hooks, utils, config (imported as `core` workspace alias)
- `packages/config-tailwind/` — shared Tailwind config
- `packages/config-typescript/` — shared TS config
- `e2e/` — Playwright end-to-end tests (Chromium, targeting `localhost:3000`)

The primary working directory for all feature work is `apps/data360/`.

## Commands

Run from the repo root (Turborepo delegates to each package):

```bash
# Dev server for the data360 app
pnpm iso:dev          # or: cd apps/data360 && pnpm dev

# Build
pnpm iso:build

# Lint
pnpm iso:lint

# Playwright e2e (requires running dev server first)
npx playwright test --project=demo-video

# Run a single e2e spec
npx playwright test e2e/workflow-e2e/

# Check route manifest consistency
cd apps/data360 && pnpm check:routes
```

No unit-test runner is configured. Playwright is the only test harness.

## Key Architecture

### Data flow

```
UI component
  → service (apps/data360/src/app/services/<module>/)
  → apiClient (src/lib/api-client.ts)  ← adds auth headers, caches session
  → /api-proxy/* rewrite (client-side) or direct to NEXT_PUBLIC_API_URL (SSR)
  → FastAPI backend (api.datalab360.io)
```

- **`src/lib/api-client.ts`** — Axios instance with JWT auth injection + 401 handling. Always use this instead of raw `axios` or `fetch` for authenticated calls.
- **`src/lib/api-contracts.ts`** — The single source of truth for backend endpoint paths (`API.*`). Every new backend call must add an entry here. The legacy `API_CONTRACTS` object (absolute URLs via `getUrl()`) is kept for back-compat but prefer `API` + `apiClient`.
- **`src/config/database.config.ts`** — `API_CONFIG.BASE_URL` + database/schema constants. Client-side calls use `/api-proxy`, SSR uses the raw env URL.

### Auth

- NextAuth v4 with JWT strategy + CredentialsProvider (username/password → Snowflake token)
- Session carries `access_token`, `account_name`, `username`, `role`, `items`
- Token lifetime: 55 min (Snowflake) / 8h session max-age
- `src/lib/auth.ts` wraps `getServerSession` for SSR; `useAuth` hook reads JWT from localStorage on the client (falls back to `/api/auth/session`)
- Middleware at `src/middleware.ts` protects all dashboard routes

### RBAC (two systems)

1. **Module-level** (`src/config/modules.ts`): `MODULES` array maps module IDs (sidebar) to backend `apiName` strings. `useAuth()` fetches `/user/me/modules` for non-admin roles.
2. **Action-level** (`src/hooks/useCanPerform.ts`): calls `GET /gouvernance/d360-roles/my-permissions` to get per-module/action allow-set. Fail-open on hard errors. Invalidate with `invalidateMyPermissions()` after permission edits. Use `useCanPerform(module, action)` to gate any mutating button.

Admin roles `['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN']` bypass module gating and get all modules.

### State management

- **Jotai** for all shared client state (atoms in hooks, no global store file)
- `useProjectContext(module)` — persists the active project per module in localStorage, syncs to backend. All project-aware pages use this; do not introduce popup project selectors.
- `atomWithStorage` for cross-refresh persistence

### Routing

- All pages live under `apps/data360/src/app/(dashboard)/`
- New Data360 module pages go in their own directory: `(dashboard)/<module>/page.tsx`
- Multi-tab modules (e.g. `intelligent`, `observability`) use URL query params (`?tab=<id>`) — do **not** use Suspense panels inside a single page component
- `src/config/routes.ts` is the typed route registry — add new routes there
- Routes deleted from navigation are documented in `(dashboard)/_DROPPED.md`; their `routes.ts` keys are intentionally kept to avoid TS errors in retained shared components

### Cache invalidation

`useCacheInvalidation` (`src/hooks/useCacheInvalidation.ts`) opens an SSE connection to the backend and receives cache-key invalidation events. Components that fetch data should subscribe to relevant `CACHE_KEYS` constants and call React Query's `invalidateQueries` (or equivalent) in the `onInvalidate` callback.

### Actionable-insights layer

`src/app/shared/insights/` provides the detect→notify→act CTA primitive:
- `InsightActionButton` — the single gated button component (confirm + toast + bell + 404/501-disables-itself)
- `useActionGate.ts` — state machine (`ready` / `running` / `done` / `error` / `unavailable`)
- A 404 or 501 from the backend automatically marks the action `unavailable` — no redeploy needed when a route goes live

### Brand / copy rules

- **Never** show "Kimi", "Snowflake", or "Cortex" in customer-facing copy. Use neutral terms ("AI", "data warehouse", "analytics engine"). Vendor names are only allowed in architecture/admin views.
- Module display names (shown in UI) must come from `MODULES[].name` in `src/config/modules.ts`, never hardcoded strings.

## Environment Variables

Required in `.env.local` for local dev:

```
NEXT_PUBLIC_API_URL=http://api.datalab360.io   # proxied via /api-proxy on the client
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<any string locally>
SKIP_ENV_VALIDATION=1                          # optional, skips t3-env validation
```

`NEXT_PUBLIC_PRIMARY_DB` defaults to `CP_DATA360` and is used in `database.config.ts`.

## Conventions

- **No direct `axios`/`fetch` for authenticated calls** — always go through `apiClient`
- **No hardcoded endpoint strings** — all paths live in `src/lib/api-contracts.ts` under `API.*`
- **Test locally before pushing** — run `pnpm iso:build` and the relevant Playwright spec; no merge without passing build
- **Branch**: feature work goes to `feat/backlog-v1` (pre-approved push target); never push directly to `main`/`dev` without explicit approval
- **Commits**: conventional commit format (`feat(module):`, `fix(module):`, `chore:`)
- Event tracking: use `useTrackEvent` for page views, tab switches, and feature clicks — fire-and-forget to `POST /api/data360/track`

## Documentation — the vault is the source of truth

All documentation lives in `docs/` — an Obsidian vault section (open the parent `data360_pro/` folder in Obsidian for the full cross-repo graph, backend notes included). Start at `docs/Frontend-Home.md`.

- **Rule: every feature PR updates the matching note in the same commit** — routes/components in the relevant `docs/FE-*.md`, architecture changes in `docs/Frontend-Architecture.md`.
- Notes carry YAML frontmatter tags (taxonomy in backend `docs/Tags.md`); CI blocks on `scripts/ci/validate_wiki.py` via `.github/workflows/docs-validate.yml`.
- Do not create ad-hoc `.md` audit reports in `docs/`, `e2e/`, or `reports/` — durable knowledge goes in the vault notes.
