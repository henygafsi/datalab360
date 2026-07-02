# Explore & Design — Redesign Spec (data+AI-centric right-bar)

*2026-07-01. Grounded in a live audit of the current code + the backend 1019-op inventory (mapped as HAHA/ACCOUNTADMIN). Companion mockups: `docs/product-readiness-audit/mockups/` (13 views).*

## 0. Philosophy (the separation contract)
- **Canvas = build visually.** ERD modeling only. No git language.
- **Right-bar = understand · validate · govern · release.** Everything analytical/governance/release lives here.
- **Deploy button = shortcut to the Release tab.** It never opens a popup; it opens/switches the right-bar to Release.
- **Zero popup, zero rupture.** All detail is a docked right-bar or an inline panel — never a page-blocking modal.
- **Approval = required *named* people / product admins** (not a bare "approve" button).
- **AI = a live change-analyst** that updates tab colors + KPIs and interviews each change.
- **Action homes (no duplication):** Delete = table action · Submit-for-approval = Release▸Approval · Rollback = Release▸Recovery · Deploy = Release only · Quality = visible everywhere, detailed in Readiness · Governance = own tab + release gate · Cost = an impact signal, not a separate workflow.

## 1. Right-bar behavior (state machine)
| Trigger | Result |
|---|---|
| Right-bar closed, click **Deploy** | open right-bar → **Release** tab active |
| Right-bar open on another tab, click **Deploy** | switch to **Release** |
| Click empty canvas (no node selected) | close floating menus + close right-bar |
| A table is **selected** | right-bar = **Table details / actions** |
| Nothing selected | right-bar = **Project Overview / health / deploy readiness** |

Right-bar is **hidable** with a persistent **mini vertical rail** (7 axis icons) visible when closed. Each closed tab keeps a **color indicator**: 🟢 OK · 🟠 warning · 🔴 blocker · 🔵 changes/pending · ⚪ not configured/not run.

## 2. The 7 axes → backend endpoints (WIRED / STUB=live-but-marked-gap / UNWIRED)
Mirror the existing `useCatalogSmartBar.ts` pattern (parallel fetch + **SSE cache-invalidation**, no polling).

**Overview** — `GET /command-center/overview-kpis`, `/projects/{id}/rollup`, `/projects/{id}/scores`, `/module-health`, `/gouvernance/compliance/score`, `/catalog/overview`+`/scores` (all WIRED). *Unwired:* `POST /explore-design/{id}/ai/schema-health`.

**Ingestion** — `GET /data-quality/freshness-metrics`, `/ingestion-metrics`, `/command-center/pipelines`, `/explore-design/{id}/ingestion/runs`, `/explore-design/tasks|streams`, `/observability/alerts` (WIRED). *Unwired:* `/command-center/pipe-usage`, `/explore-design/{id}/ingestion/watermark`.

**Data Quality** — `GET /data-quality/snapshot` (STUB→live, one-shot fan-out of all 9 dims), `/quality-summary`, `/schema-quality`, `/uniqueness-metrics`, `/completeness-metrics`, `/dmf-results|dmf/breaches|dmf/catalog`, `/trend-analysis`, `/anomalies` (STUB→live). *Unwired:* `POST /explore-design/{id}/quality-gates/run`.

**Governance** — `GET /catalog/tables/{db}/{s}/{t}/governance`, `/gouvernance/policies(+health,my-scope)`, `/security-matrix`, `/access-review/summary`, `/data-quality/security-posture`, `POST /policies/masking/preview`+`/row-access/simulate`, `/catalog/recommendations` (WIRED). *Unwired:* `POST /gouvernance/policies/pii-scan`, `/explore-design/{id}/ai/classify-columns`. *Lazy-load (SLOW):* `/api/platform/object-permission-matrix` (14s).

**Impact & Cost** — `POST /explore-design/{id}/impact-analysis/enhanced`, `GET /deployment-readiness` (has cost), `/catalog/objects/{id}/360`, `/command-center/cost-breakdown`, `/observability/cost/warehouse-usage`, `/data-quality/cost-metrics`, `/bi-dashboard/{id}/cost` (WIRED). *Unwired:* `POST /explore-design/{id}/ai/warehouse-sizing`.

**Release** — `GET/POST /explore-design/{id}/deployments`, `/{d}/approve|reject|execute`, `/deployment-readiness`, `/conflict-check`, `/post-verify`, `/recent-deployment-errors` (WIRED). *Unwired (the rollback/recovery + scheduled-deploy spine):* `/deployments/track/*` (start/step/complete/approve/reject/execute/**rollback**), `/pre-deploy-checks`, `/dry-run`, `/full-dry-run`, `/schedules`, `/scheduled-deployments/{id}/*`.

**History + AI** — `GET /projects/{id}/events` (WIRED; today live-polled 20s by HistoryRail → switch to SSE), `/catalog/objects/{fqn}/history`, `/catalog/events`, `/command-center/activity-feed`, `/explore-design/{id}/ddl-actions`, `/explore-design/versions` (WIRED). *Unwired (the AI change-analyst + deltas):* `/explore-design/{id}/ai/savings`, `/command-center/snowflake-insights`, `/cortex/conversations`, `/explore-design/projects/{id}/erd` (save/version), `/versions/{from}/compare/{to}`.

> **Highest-leverage backend adaption:** the `/explore-design/{id}/ai/*` family (~20 ops, all grep-0 in `api-contracts.ts`) — `ai/schema-health`, `ai/classify-columns`, `ai/warehouse-sizing`, `ai/savings`, `ai/deployment-risk`, … — feeds the AI content of **5 of the 7 axes**. Wire this family first.

## 3. Deploy button — state machine (adapts to project state)
`No changes → Deploy (disabled)` · `Draft changes → Prepare Release` · `Checks not run → Run Validation` · `Blocking issues → Fix Blockers` · `Ready but not approved → Submit for Approval` · `Waiting approval → Awaiting Approval` · `Approved → Deploy` · `Deployed → Verify` · `Failed → Open Recovery`.
Project statuses: Draft · Unsaved changes · Saved · Validation required · Blocked · Ready for approval · Awaiting approval · Approved · Ready to deploy · Deploying · Deployed · Verified · Failed · Rolled back.

## 4. Release tab — 7 internal steps (all in-panel, no popup, no double deploy button)
1. **Changes** — what will change (tables/columns/relations). Actions: Review changes · Open SQL diff · Create checkpoint.
2. **Readiness** — acceptability KPIs (ingestion freshness, volume, schema, DQ, gov coverage, RLS, cost, perf). Actions: Run validation · Ask AI to explain blockers · Auto-fix suggested policies · Accept non-blocking warnings.
3. **Impact** — impacted objects (tables/dashboards/workflows/policies/users), cost & perf, security impact. Actions: View lineage/dashboard-usage/affected-roles · Generate impact summary.
4. **Approval** — **required named approvers** by role: Product-perimeter admin (required), Data owner (required), Governance admin (required if PII/RLS/masking changed), DQ owner (if critical checks changed), Cost owner (if cost > threshold), Platform admin (required for PROD). Actions: Submit for approval · Add reviewer · Request changes · Approve · Reject · Comment. **Submit-for-approval lives ONLY here.**
5. **Deploy** — accessible only when no blockers + approvals complete. Target/plan/safety (checkpoint + rollback script generated). Actions: Deploy now · Schedule deploy · Download/Copy SQL. Rollback discreet, not a primary CTA.
6. **Verify** (post-deploy only) — execution/schema/DQ-smoke/freshness/dashboard/policy/RLS checks. Actions: Mark verified · Generate release note · Notify stakeholders · Open issue.
7. **Recovery** (only after deploy/failed) — previous version, rollback available, risk. Actions: Rollback · Restore checkpoint · Compare versions.

## 5. AI Change Analyst (bottom of the right-bar, Live)
Not a generic AI tab — a **live analyst of *this project's* changes** that updates tab colors + KPIs. Timeline of changes with impact (freshness delay → Ingestion red → release blocked; PII detected → Governance red → masking recommended; encryption ↑ → gov score +8). It **interviews each change**: "You added ORDER_MARGIN — expose to dashboards?", "CUSTOMER_EMAIL is PII — apply standard email masking?", "FACT_TRANSACTIONS delayed — block release or accept exception?". AI actions: Explain impact · Suggest fix · Prepare approval summary · Generate release note · Auto-create missing DQ checks · Suggest masking policy. Feeders: `/explore-design/{id}/ai/savings` + `/command-center/snowflake-insights` + `/cortex/conversations` (all unwired today).

## 6. Sources vs Products vs Project-tag (cataloging sub-page)
- **Sources** = raw/staged tables (`tables` not in `targetTableIds`). Source-type tags (Raw/Landing · Staging · Curated/Core · Mart/Serving · Reference/Master · Analytics/BI · ML/Feature · Sandbox · External) — **currently localStorage-only; needs a backend write** (or tag via `/catalog` tags).
- **Products** = published models (the target model = a data product); `listModels` + certified/draft/published state.
- **Project tags** = `#project`/`#tag` chips (project name + free tags).
- Left panel tri-state per table: **In model · New · Not in model** (data exists via `targetTableIds` + `status`; only the label is net-new).
- **Remove the `SourceMindMap`** (the "mindmap") — replace catalog view with a clean sources/products/tags grid (mockup `12-catalog.html`).

## 7. Telemetry diet (minimize useless queries)
- **`track` is already optimal** — keep as-is (batched 10s/10-events, 500ms-debounced page views, fire-and-forget, ≤~6 req/min/tab). Route any new axis-open tracking through the existing `trackFeatureClick` queue (no new endpoint).
- **Kill the one recurring poll in the axes:** `HistoryRail` 20s poll of `/projects/{id}/events` → switch to **SSE `useCacheInvalidationSubscription`** (the `useCatalogSmartBar` pattern).
- **Lazy-load the 2 slow scanners** only on demand: `/api/platform/object-permission-matrix` (14s), `/administration/platform-health` (20s cold).
- **`overview-kpis/install` provisions Snowflake TASKS (real crons)** — keep it operator-triggered, never auto-fire on page load.
- Cheap/free to call: `/api/refresh-state`, `/cache/refresh/status`, `/api/data360/table-refresh-mapping`.

## 8. Current → target reorg (what to change in code)
Current `ContextRightBar` (2594 lines) has 8 tabs: `actions · ai · quality · cost · governance · history · deploy · help`. Map to the 7 axes:
- **Overview** (net-new tab) ← `ModelOverview` (page:912) + schema-health + rollup/scores. **Add the top KPI strip** (net-new; data exists).
- **Ingestion** (net-new axis) ← consolidate the 4 scattered ingestion surfaces (Actions group, Quality `IngestionCostPanel`, page-level `IngestionResultsPanel` + `IngestionConfigPanel`).
- **Data Quality** ← keep `quality` tab.
- **Governance** ← merge the write actions (Actions tab governance group) into the `governance` tab (own tab + release gate).
- **Impact & Cost** ← unify `cost` tab + `enhancedImpactAnalysis`.
- **Release** ← rename `deploy` tab; wire the 7-step flow + Deploy state-machine + the `/deployments/track/*` rollback spine.
- **History + AI** ← **merge** the two separate `history` + `ai` tabs.
- **Drop** `actions` meta-tab + `help` tab (no target home); fold their contents into the axes or the canvas node menu.

## 9. Implementation waves
- **W1 (net-new UI, data exists):** top KPI strip; 7-axis mini-rail + color indicators; Deploy state-machine button; tri-state membership labels; right-bar open/close behavior.
- **W2 (consolidation):** merge History+AI; unify Impact&Cost; single Ingestion axis; remove SourceMindMap → catalog grid.
- **W3 (backend adaption — highest leverage):** wire `/explore-design/{id}/ai/*` (~20 ops) → schema-health/classify/warehouse-sizing/savings/deployment-risk across 5 axes; wire `/deployments/track/*` rollback+scheduled-deploy spine; wire ERD save/version + version-compare.
- **W4 (AI Change Analyst):** the live per-change analyst feed + interview prompts (snowflake-insights + ai/savings + cortex/conversations).
- **Cross-cutting:** SSE-not-poll for the History rail; lazy-load slow scanners; source-type tag backend write.

## 10. Making each axis ACTIONABLE — per-axis primary CTA (no axis ships read-only)
Every axis gets one **primary CTA bound to a real write endpoint** in its panel header (optimistic → toast → auto-refetch of that axis). P0 uses endpoints that already exist; P1 unlocks AI/recovery depth.

| Axis | Primary CTA (P0) | Endpoint (WIRED) | P1 depth (UNWIRED) |
|---|---|---|---|
| Overview | **Recompute scores** | `POST /catalog/objects/{id}/scores/recompute` | `ai/schema-health` |
| Ingestion | **Refresh table** / **Resume task** | `POST /explore-design/dynamic-tables/{name}/refresh` · `deTaskAction` | `ingestion/watermark`, `pipe-usage` |
| Data Quality | **Auto-profile** / **Run DMF check** | `POST /data-quality/auto-profile` · `/projects/{id}/dmf-check` | `quality-gates/run` |
| Governance | **Classify columns** | `POST /gouvernance/policies/classification/classify` | `pii-scan`, `masking/apply`, `ai/classify-columns` |
| Impact & Cost | **Analyze impact** | `POST /explore-design/{id}/impact-analysis/enhanced` | `clustering/apply`, `ai/warehouse-sizing` |
| Release | **Request → Approve → Execute** | `POST /explore-design/{id}/deployments[/{d}/…]` | `/deployments/track/*` rollback/checkpoints |
| History + AI | **Open change feed / diff** | `GET /projects/{id}/events` (+ version compare) | `ai/savings` deltas |

**UX P0:** (1) ONE SSE-driven rail hook (clone `useCatalogSmartBar`; kill the 20s poll); (2) **lazy per-axis fetch** — only fetch an axis's feeders when its section is expanded; (3) primary CTA per axis header w/ optimistic→toast→refetch; (4) 4-state per axis (skeleton/honest-empty/error-retry/dark — never fake 0s); (5) guard the 2 SLOW endpoints behind an explicit "Load details"; (6) route all rail interactions through the existing batched `trackFeatureClick` queue (no new telemetry endpoint).
**Backend P0 (mostly contract, not new routes):** (a) contract-wire endpoints already LIVE but stubbed in `api-contracts.ts` (`data-quality/snapshot`, `anomalies`, `quality-gates/run`, `pii-scan`, `clustering/apply`, `cortex/conversations`, `erd`); (b) **every write CTA must emit a `PROJECT_EVENTS`/`EVENT_STORE` row** — this is what makes Axis-7 History + the `administration/performance/*` spine populate from real usage; (c) idempotency + honest 404/501 so the rail degrades quietly.
**Backend P1 (perf/depth):** consolidated fan-out `GET /explore-design/{id}/rail?axes=…` (server-side parallel + cached → collapses 7 client round-trips into 1); precompute the AI-heavy axes (schema-health, savings) into a cache table + Snowflake task like `OVERVIEW_KPIS` (avoids a live Cortex call per rail-open); extend SSE cache-key coverage to explore-design keys; wire the `/deployments/track/*` lifecycle spine.
**Sequencing (one line):** P0 = SSE rail + 6 working CTAs on already-live endpoints + event-emission; P1 = `ai/*` family + rollback spine + fan-out/precompute for cost.
