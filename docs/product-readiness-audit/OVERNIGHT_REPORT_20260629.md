# Overnight Report — 2026-06-29

> Status key: **DONE** = tested, screenshot-backed, real backend data. **NOT DONE** = missing, broken, or data-gap only.

---

## 1. Per-Domain E2E Results

### Sources (done: 24 / not_done: 7)

**DONE**
- Source Catalog page loads; breadcrumb, left tree, 285-table list, search/filter/sort/toggle all render.
- Tree expand works (CP_DATA360 / DRAFT_SOURCE nodes).
- "Refresh Catalog" triggers real backend job (`crun_46a92...`).
- "Add Source" links to `/data-source-connection`.
- Sources / Detected Models tab navigation; correct empty state on Detected Models.
- ObjectSmartPanel right-pane empty state correct.
- Data Source Connection (DSC) page loads; ConnectorHealthStrip (`0 pipes · 6 stages · 6 stale`), Enterprise Source Catalog KPIs (197 tables, 3 domains, 183.8K rows), filter dropdowns, AI sparkle button all visible.
- SSE cache-invalidation wired on `CATALOG/CATALOG_OBJECTS` and `STAGES/CONNECTIONS` keys.

**NOT DONE**
- Connector wizard cards (Snowflake, Azure, AWS, GCS, etc.) not visible on initial load — require scroll or user action.
- ConnectorAiHelper modal open/close not confirmed (test navigated to sidebar AI instead).
- ObjectSmartPanel table-detail content (requires a row click).
- Detected Models with a project + populated source tables.
- DatalakeBrowser, stage freshness per-card, InternalStageCreator.

**Defects**
- All 6 ingestion stages stale (7d+), 0 active pipelines; "0 Loaded (30d)" on Enterprise Catalog — operational staleness visible to users on page load.
- Multiple tables in AHAH schema show 0 rows / 0 B stale 37+ days (DIM_CALENDAR, DIM_CLIENTS, DIM_DEVISES, others).

---

### Data Products (done: 20 / not_done: 3)

**DONE**
- Product Portfolio page loads; all 6 KPI tiles have real backend data (9 products, quality %, consumers, domains, trust score).
- 9 product cards render with status badges, quality %, TABLE_FQN, SLA, consumer count, tags.
- Search, status filter, detail panel (w-380px) open/close, 2×2 overview metrics grid all functional.
- Object 360 panel (w-420px) opens from detail panel; all 8 tabs selectable (Columns/Lineage/Governance/Quality/Usage/Cost/Audit/Actions).
- Publish gate section, Published badge for published products, quality/governance/lineage threshold checks visible.
- KPIs section: Generate / Recommend model / New inline-row buttons (no popup).
- Activity section: collapse-toggle, lazy-load, correct "No activity yet" empty state.
- Subscribe button correctly gated (canSubscribe + isPublished; all 9 current products pass).
- Create Product inline form opens/closes without modal.
- 4 cross-module footer links correct; Explore deep-link per card navigates to `/explore-design?table=<FQN>`.
- SSE wired for `data_products/catalog_products/catalog_scores`.

**NOT DONE**
- Publish gate blocked-flow on DRAFT product (no Draft product in current DB).
- Subscribe disabled-state (RBAC+is_published gating exists in code; no unpublished product to trigger it).
- Activity panel event list (API returns empty array; no events provisioned).

**Defects**
- `GET /catalog/objects/TABLE:CP_DATA360.RETAIL_DW.FACT_TRANSACTIONS/360` → 404; PublishGate renders all checks as `—` (unknown = publish permanently blocked for this product). FE degrades correctly with Retry.
- `GET /api/snowflake/explorer/objects/TABLE:.../columns` → 404; Object360 Columns tab shows inline error with Retry. Catalog not indexed for this table.

---

### Dashboards / BI Dashboard (done: 12 / not_done: 5)

**DONE**
- Route `/bi-dashboard` loads 200; ScoreCards render with real data (COST 139.59 credits, PERF 32.76%).
- 11 dashboard projects in 3-col grid with real metadata.
- Dashboard editor opens; 14/14 widgets load in SAMPLE · Finance & Returns (KPI cards, bar, donut, area charts) with real warehouse data.
- Smart filter bar auto-detects 6 column dimensions (TX_DATE, RETURN_DATE, ACCOUNT, REASON, CURRENCY, ORDER_ID).
- AI prompt bar, chart palette (15+ types), CONFIGURE WIDGET right panel, toolbar (Snapshot, Export JSON, Duplicate, Manage access) all visible.
- "New Dashboard" slide-in panel with required name + optional description fields, dismissable.
- Auto-create modal with From Schema / From Table tabs, database/schema selectors, dismissable.

**NOT DONE**
- FF / EEE / SEED_DASH_COSTS dashboards show "0 widgets" in editor (empty drafts vs bug — unverified).
- FORECAST ScoreCard always shows `—` ("coming soon" placeholder, no backend source).
- DQ 0% / GOVERNANCE 0% header badges at project scope (project-level scores not populated for most dashboards).
- Create modal: no project selector for new dashboard.
- Auto-create "From Table" tab not tested.

**Defects**
- Dashboard editor cold-load latency ~8s before all 14 widgets render (pure skeleton at 3.5s). `/bi-dashboard/{id}/render` is the slow call — high abandonment risk.
- DQ 0% and GOVERNANCE 0% alongside active critical recommendations is suspicious; scoring denominator may be 0 (backend KPI computation issue, not FE rendering).

---

### Monitoring (Administration + Observability) (done: 8 / not_done: 6)

**DONE**
- `/administration` Platform Health: live KPIs — 164 req/min, 943ms avg, 2.80% error rate, 5,491 requests, 10h9m uptime, 128MB mem, 5.24 CPU (14 cores), 13.86 credits, 1 masking policy, 2 row-access policies, 5 tagged objects — all LIVE.
- Access Control tab: 13 users, real roles (RETAIL_DATA_ANALYST×4, BL_ANALYST×3, ACCOUNTADMIN×2), ACTIVE badges.
- Cost Governance tab: 140.59 ORG credits (30d), projected 325.52, top consumer, anomaly watch table, resource monitors.
- `/observability` Health & Insights: Overall Health 52/100 Warning; 3 actionable recommendations; Security Posture 45/100; Query Performance 82.7K queries, 1.8s avg.
- `/observability/slo`: 3 real SLOs — Query success rate BREACHED (67.3% vs 99% target, 181,663 failed of 555,323); P95 latency Meeting; Task success rate Meeting.
- `/observability/budget`: Compute $422.30 / 140.8 credits; 30d daily credit chart with real dates; warehouse breakdown (COMPUTE_WH 27 active days).
- `/observability/alerts`: 2 active alerts (HIGH query failure rate 10.2%; MEDIUM 1 task failure); actionable CTA present.
- `/admin/api-health`: 494 endpoints cataloged; Release History shows real past run.

**NOT DONE**
- `/observability/lineage`: "0 nodes / 0 edges" on navigation; requires user click "Load"; ~3h delay from ACCESS_HISTORY; no pre-load.
- `/admin/api-health` KPI strip: all 10 KPI cards show `—` on load; no guidance that "Test All" must be clicked first.
- `/administration` Performance tab: portal-only (links to Open Performance/Observability); no inline metrics.
- `/administration` Entitlements & Feature Governance tab: portal-only (links only; no inline data).
- `/administration` Projects tab: spinning ("Loading projects...") at screenshot time; endpoint slow or unresolved.
- `/observability/budget` FREE CREDITS REMAINING: `—` (no contract capacity configured).

**Defects**
- `observability/alerts/page.tsx:255` — `a.resource`, `a.detected_at`, and `a.timestamp` all null for both active alerts; Resource and Detected columns permanently blank (backend omits these fields).
- `admin/api-health/components/KpiStrip.tsx:29` — 10 KPI cards render as dashes with no explanatory empty-state text; users have no visible cue to click "Test All".
- `administration/components/PlatformHealthPanel.tsx` — STORAGE KPI row: all three sub-metrics `—` (backend not returning storage breakdowns; may be local-dev or unprovisioned route).
- `/observability/slo` OPERATIONAL: Query success rate SLO currently BREACHED — 67.3% actual vs 99.0% target, 181,663 failed queries. Requires immediate ops attention.

---

### Account-AI (Account Overview + Intelligent) (done: 16 / not_done: 5)

**DONE**
- Account-Overview: all 9 tabs have real data — Overview (10 active users, 64 projects, 48 workflows, 139.6 credits), DWH Action Plan (12 pain points, 452 password bypasses MFA CRITICAL), Data Objects (3 DB/13 schemas/116 tables/1.1 GB), FinOps (+824.3% vs prior, 3 top warehouses, anomaly CTA), Modules (7 modules all healthy, per-module KPIs), Platform Activity (2,304 events, sessions chart), Projects (84 total, charts, 10 pending approvals alert), Security (828 logins, 44 failures, 0% MFA), Organization (14,669 requests, role×module matrix).
- Intelligent: Semantic Models (1 real YAML model, 17.83 KB), AI Console (docked NL-to-SQL with model selector), AI Chat (correct empty state, model populated), ML Features sub-tabs render, Advanced ML tabs render (1 Top Insight), Local Analytics (15 staged datasets, 24 KB, zero-cost query panel), Container Apps (1 compute pool ZZZ/SUSPENDED).

**NOT DONE**
- Intelligent/AI Advisor: 0 recommendations (API 200/empty; "Run Analysis" CTA not triggered — costed Cortex call).
- Intelligent/Query Analytics: 0 queries analyzed (API 200/empty; "Run Analysis" not triggered).
- Intelligent/AI Agents: 0 agents deployed in this environment.
- Intelligent/Semantic Views: 0 rows (none created; API 200/empty).
- Intelligent/Vector Search: 0 vector columns configured; feature cards render.

**Defects**
- `POST /ai/estimate` → 404 on every AI tab load; `useAiCostEstimate.ts:8` documents this as expected (local fallback via costs-reference.json) but adds ~1s latency to cost-badge rendering on each AI tab load.
- Account-Overview/Security: Open Alerts / Privileged Users / User Security Score all `—` (ACCOUNT_USAGE data unprovisioned or view not granted for this account).
- Account-Overview/Platform Activity: Bytes Scanned / Credits Consumed / Avg Query ms all `—` (ACCOUNT_USAGE unprovisioned).
- Account-Overview/FinOps: AI Spend (30d) and Estimated Savings `—` (AI usage tracking not provisioned; formula-band fallback shown with disclaimer).

---

## 2. Administration UX Refactor

**Status: DONE — build green, screenshots confirmed.**

`apps/data360/src/app/(dashboard)/administration/components/AdministrationHub.tsx` was refactored from a horizontal tab bar to a collapsible vertical option rail:

- Layout changed from `space-y-4 p-4` to `flex flex-col` with full-width header + two-column body.
- Horizontal `role="tablist"` replaced by `<aside>` rail with `role="tablist"` / `aria-orientation="vertical"` / `aria-label="Administration sections"`.
- Each tab retains `role="tab"` + `aria-selected`; in collapsed mode shows icon only with `title` tooltip.
- Collapse/expand toggle (`ChevronLeft`/`ChevronRight`) toggles between `w-52` (icon + label) and `w-14` (icon only) via CSS transition.
- All 9 content panels untouched; two new icons added (`ChevronLeft`, `ChevronRight`).
- Screenshots: `docs/product-readiness-audit/screens/overnight/admin_ux_after.png` (expanded), `admin_ux_after_collapsed.png` (collapsed).

---

## 3. Hard Blockers — Require User Action

| # | Blocker | Why it blocks |
|---|---------|---------------|
| **B1** | Apply `.claude/settings.local.json` to enable MCP + permissions | Without MCP enabled, multi-user persona testing (RETAIL_DATA_ANALYST, BL_ANALYST) is impossible; 2nd-user credentials are available in `.platform-credentials.txt` but cannot be exercised; several API-health flows depend on MCP-proxied auth |
| **B2** | Restore host SVC key-pair for prod (`api.datalab360.io`) | `SVC_DATA360_API` key-pair is dead on host side (not a frontend issue); prod returns `CACHE_NOT_READY/svc_connect_failed`; all prod-environment metrics and live testing are blocked until key is rotated by the user on the Snowflake host |
| **B3** | Payment provider integration | FinOps AI Spend tracking, capacity contract, and FREE CREDITS REMAINING are all unprovisioned — these panels will remain `—` until a billing/payment provider is wired to the backend |
| **B4** | Backend deploy (local-only changes) | ~17 backend commits are local/uncommitted on `feat/backlog-v1`; includes: role-aware cache fixes, per-role Redis slots, governance coverage fixes, 8 ACCOUNT_USAGE audit endpoints, SSE singleton fix, platform health probe-noise fix, observability alert resource/timestamp fields — none of these are live on `api.datalab360.io` |

**Already unblocked once MCP + B1 resolved:** 2nd-user role testing (`.platform-credentials.txt` has RETAIL_DATA_ANALYST / BL_ANALYST personas ready); per-role RBAC e2e harness is written at `e2e/ux-audit/_role-cache-rbac-e2e.mjs`.

---

## 4. Prioritized Next Actions

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | User: rotate SVC key-pair + deploy backend `feat/backlog-v1` | Unblocks prod-green, SSE singleton, alert resource fields, probe-noise fix | User-side |
| **P0** | User: apply `.claude/settings.local.json` MCP + perms | Unblocks 2nd-user RBAC e2e, persona testing | User-side |
| **P1** | Fix `KpiStrip` empty-state (`/admin/api-health`) — add "Click Test All to run diagnostics" text under dashes | Removes UX confusion for first-time admin users | 1 file, low |
| **P1** | Fix Observability Alerts missing `resource` / `detected_at` fields — update `AlertsPanel` to handle null with `—` placeholder OR request backend to include the fields | Columns permanently blank in production | 1 file, low |
| **P1** | Fix DSC connector wizard card visibility — ensure connector grid is visible above the fold on initial load (or add a visible CTA below ConnectorHealthStrip) | Core onboarding path not immediately discoverable | 1 component, medium |
| **P2** | Dashboard editor cold-load (~8s skeleton for `/bi-dashboard/{id}/render`) — add skeleton shimmer with estimated time copy ("Loading your dashboard…"); investigate if `/render` response can be streamed or paginated | High abandonment risk for first-time users | 1 service + 1 component |
| **P2** | Catalog indexing for `FACT_TRANSACTIONS` table — PublishGate and Object360 Columns both 404 on this table; backend catalog needs to index the object | Data Products publish permanently blocked for RETAIL_DW product | Backend |
| **P2** | Resolve `/administration` Projects tab spinner — endpoint too slow or returning error; add timeout + graceful empty state | Admin UX inconsistency | 1 tab component |
| **P3** | Wire `POST /ai/estimate` route handler (`apps/data360/src/app/api/ai/estimate/route.ts`) to eliminate the known-404 + ~1s fallback latency on every AI tab load | Latency + noise in error logs | New route file |
| **P3** | Ingest staleness remediation (DSC: 6 stages stale 7d+, 167/197 tables stale) — operational trigger to refresh pipelines; FE already shows the data correctly | Data freshness affects user trust | Ops/backend |
| **P3** | SLO breach remediation — Query success rate at 67.3% vs 99% target (181,663 failed queries); investigate top failure pattern via `/observability/slo` BREACHED card | Real platform health issue | Backend/ops |

---

## Summary

Platform core is demo-ready on localhost (all 5 domains render real data, Administration UX refactor green, 80+ e2e assertions passing); production is blocked on two user-side actions — SVC key rotation and MCP enable — plus a pending backend deploy of ~17 local commits.
