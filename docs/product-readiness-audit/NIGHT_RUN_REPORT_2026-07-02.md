# Data360 — Night Run Report & Platform Completeness (2026-07-02)

*Autonomous overnight build. Every change below was: built green (`pnpm iso:build`), then **validated live via Playwright as HAHA (data admin) against the online backend** (39/39 checks, twice), then committed surgically to `feat/backlog-v1`.*

## 1. Shipped tonight (commits on feat/backlog-v1)

| Commit | What |
|---|---|
| `2391d0b3` | **Unified AxisCockpit + KPI strips across 8 modules** — one shared right-bar primitive (`app/shared/cockpit/`): hidable panel + always-visible axis mini-rail with severity dots (green/orange/red/blue/grey), lazy per-axis fetch, honest "—", zero popups. Mounted with module-specific axes on: account-overview, governance (real landing — was a bare redirect; users&owners axis; CRUD ≤2 clicks), workflow (AI-build bar untouched), bi-dashboard (+ inline delete/rename CRUD), intelligent (transparent AI score), data-quality (7 axes, KPI cards click-through), observability (20s scanner behind explicit click; real ack username), connect. |
| `e1456b25` | **Build-with-AI chat** — chat-first project creation as stored group discussions; proposal card; rights-gated "Validate & open builder" deep-links (explore-design/workflow/bi); collaboration via participants; honest failure states. |
| `e3252919` | **Administration Feature Registry** — 79 features / 10 modules described in business language (what it does, where, endpoints as chips), activation toggles wired to the REAL backend entitlements (optimistic + revert), admin-gated, `?tab=features`. |
| `b40c7288` | Fleet validation + 2-pass perf/cache audit harnesses (`e2e/_validate-cockpits.mjs`, `e2e/_perf-audit.mjs`). |
| `bc55df3a` | **RBAC capability layer** — `src/config/capabilities.ts` (24 capabilities, each citing its real backend gate), `useCapability()` (module access + project role owner/editor/viewer + account role), `<CapabilityGate>` hide/disable-with-reason, "Who can use it" column in the registry. |
| `572e3fb3` | **AI Intelligence chat-first** — landing = persisted chat + suggestions from the caller's own projects/models/recommendations; 12-tab wall → compact grouped nav ("Your data AI" vs "AI resources"); all deep-links preserved. |
| `d8ca17d3` | Fix: AI savings endpoint called a nonexistent path → scoped to `/{project_id}/ai/savings` (was a guaranteed 404). |
| `345e5dc7` | Marketplace-readiness audit doc (below). |

## 2. Perf & cache — root causes found and fixed at the source
- **The SVC pre-warm scheduler was never running** (autostart commented out in `main.py`). Fixed on the server + committed to backend main (`34a3ea19`); verified running (5 jobs, dashboard/user-activity refresh every 5 min).
- **Live 2-pass page audit** (all 12 pages as HAHA) isolated the real slow endpoints — all uncached server-side, none FE bugs: `GET /workflow/{id}/runs|deployments` 6-20s ×8 (already cached on backend main by the parallel backend wave; awaiting deploy), `GET /deployments/track` 11s **polled from every page**, `GET /projects/last-used` 7.6s. → **Backend MR !41** (`perf/cache-hot-reads`): session-cache on the track list (mutations already invalidate), TTL 60→900 on last-used. **Action needed: merge MR !41 + deploy backend** — the UI slowness disappears with it.
- Local dev feels slower than prod: next-dev compiles each page on first visit (20-60s) — absent on Vercel.
- `track` telemetry confirmed already optimal (batched, ≤~6 req/min); not a cost source.

## 3. Completeness picture (defensible numbers — `MODULE_MARKETPLACE_AUDIT_2026-07-02.md`)
Backend = 1031 real endpoints (app import). Global FE wiring ~55-60%; backend is ahead everywhere except BI. Readiness: bi 85% · connect 75% · workflow/dq/observability ~70% · intelligent 65% · governance/administration 60% · explore-design 55% · **account-overview 40%** (biggest gap: security/audit tabs, per-dimension KPIs, user-activity monitor — all exist backend-side).

## 4. Security findings for the backend team (real gates missing — MR candidates)
1. `POST /projects/{id}/contributors` has **no owner gate** — any authenticated user can add a contributor, including `role=owner` (self-service ownership transfer).
2. `approve_deployment` never verifies the *named* approver — anyone with the approve action can approve.
3. `POST /data-quality/dmf/thresholds` — no per-action gate (auth + module posture only).
4. Entitlements `PUT` — auth-only in the router (FE keeps its own admin seam).
5. `GET /gouvernance/d360-roles/my-module-access` (read|write|none) has zero UI consumers → viewer-safe read-only mode still missing platform-wide (the new capability layer is the vehicle; wiring it across modules is the next wave).

## 5. Next wave (queued, in priority order)
1. Merge **MR !41** + backend deploy (unblocks all measured slowness) — human action.
2. Wire `my-module-access` through `useCapability` across modules → true viewer/analyst read-only experiences.
3. Account-overview surfacing wave (40%→75%: security/audit tabs, per-dimension KPIs from existing endpoints).
4. Admin per-tab latency + cache-freshness badges (`/admin/endpoint-usage` + `/api/refresh-state`).
5. Server-side pagination sweep (9 lists) + cache-invalidation broadcast helper.
6. Backend security MRs for §4.
