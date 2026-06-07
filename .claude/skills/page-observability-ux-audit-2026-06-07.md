---
name: page-observability-ux-audit-2026-06-07
description: UX audit snapshot for the Observability module (alerts, budget, SLO, lineage, dependencies, trust-center) as of 2026-06-07, covering layout, actions, AI touchpoints, right-bar redesign spec, prioritized gap backlog, and Snowflake feature map.
---

## Vue

The Observability module is a multi-route section reachable at `/observability`. The root page (`/observability/page.tsx`) renders an `<ObservabilityDashboard>` widget wrapped in a class-based `ObservabilityErrorBoundary` with a **Retry** button that remounts the subtree by bumping a `resetKey`. A row of explore-links at the bottom of the root page surfaces all sub-routes.

Sub-routes each carry a two-item `<Breadcrumb>` (Observability / Page) and a `<FreshnessDisclaimer>` banner explaining the Snowflake ACCOUNT_USAGE lag. Layout is a single `@container p-4` column; no sidebar or split-pane right-bar exists today — the right bar is a future spec (see §Redesign Right-Bar).

| Route | Title | Primary component |
|---|---|---|
| `/observability` | Dashboard | `ObservabilityDashboard` (shared) |
| `/observability/alerts` | Alerts | Inline table + `<ActionRail>` slide-over |
| `/observability/budget` | Budget & Resource Monitors | `<CostOverviewCard>` + resource-monitor table + `<CreateMonitorModal>` |
| `/observability/slo` | SLO Tracking | SLO table + `<AddSloModal>` |
| `/observability/lineage` | Lineage | `<LineageFlowView>` (ReactFlow canvas) |
| `/observability/dependencies` | Dependencies | `<DependenciesCard>` |
| `/observability/trust-center` | Trust Center | `<TrustCenterCard>` |

All pages use `rizzui` primitives (`Badge`, `Button`, `Input`, `Loader`, `Modal`, `Select`) and Phosphor icons (`pi*`). Dark-mode classes are present on every element. Loading states use `<TableSkeleton>`; empty states use `<EmptyState>`; backend-not-deployed states (404/501) use `<EmptyState>` with a descriptive message; genuine errors render an inline red banner.

---

## Tabs actuels

The Observability module does not use a tab-bar component. Navigation between sections is done via the explore-links row on the root page and via `<Breadcrumb>` back-links. The effective "tabs" are the seven routes listed above. No per-tab `page.tsx` files exist under a shared layout — each route is a standalone `page.tsx`.

---

## Actions

### Alerts page (`/observability/alerts`)

| Action | RBAC module / action | Endpoint | InsightActionButton |
|---|---|---|---|
| Toggle scope All / Cross-module | observability / view-alerts | client-side state switch; re-calls GET endpoint | No |
| Refresh | observability / view-alerts | `GET /observability/alerts?days=7` or `GET /observability/alerts/cross-module?days=7` | No — plain `<Button>` with `<Loader>` |
| Open Details slide-over | observability / view-alerts | none (uses already-fetched row data) | No |
| Acknowledge alert | observability / acknowledge-alert | `POST /observability/alerts/{id}/ack` body `{acknowledged_by:"current_user"}` | Not yet — implemented as a plain `<Button>` in both the table row and the `<ActionRail>`; candidate for `<InsightActionButton>` |

### Budget page (`/observability/budget`)

| Action | RBAC module / action | Endpoint | InsightActionButton |
|---|---|---|---|
| Refresh (cost + monitors) | observability / view-budget | `GET /observability/cost/warehouse-usage`, `GET /observability/cost/daily-credits`, `GET /observability/cost/storage`, `GET /org-accounts/resource-monitors` (via `getResourceMonitors`) | No |
| Create Resource Monitor (modal) | observability / configure-budget | `POST /observability/cost/monitors` body `{name, credit_quota, frequency, triggers, notify_users}` | No — modal form with `<Select>` + `<Input>` |
| Set Warehouse Budget (not yet surfaced) | observability / configure-budget | `POST /observability/budgets` via `createSpendBudget` | Candidate for `<InsightActionButton>` |

### SLO page (`/observability/slo`)

| Action | RBAC module / action | Endpoint | InsightActionButton |
|---|---|---|---|
| Refresh | observability / view-slo | `GET /observability/slo-tracking?days=30` | No |
| Add SLO (modal) | observability / manage-slo | `POST /observability/slo` body `{name, target_metric, target_value, window_days}` | No |

### Lineage page (`/observability/lineage`)

| Action | RBAC module / action | Endpoint | InsightActionButton |
|---|---|---|---|
| Load lineage (database + table filter) | observability / view-lineage | `GET /observability/lineage?database={db}&table={t}&days={d}` | No |
| Load access patterns | observability / view-lineage | `GET /observability/lineage/access-patterns?days={d}` | No |
| Canvas node click (not yet connected) | — | Should trigger `GET /observability/lineage?database={db}&table={name}&days={d}` for right-bar detail | Candidate |

### Dependencies page (`/observability/dependencies`)

| Action | RBAC module / action | Endpoint | InsightActionButton |
|---|---|---|---|
| Filter / search objects | observability / view-dependencies | `GET /observability/dependencies` + `GET /observability/dependencies/graph` (both owned by `<DependenciesCard>`) | No |

### Trust Center page (`/observability/trust-center`)

| Action | RBAC module / action | Endpoint | InsightActionButton |
|---|---|---|---|
| View findings | observability / view-trust-center | `GET /observability/trust-center/findings` + `GET /observability/trust-center/summary` (owned by `<TrustCenterCard>`) | No |

---

## Interventions IA

### 1. Alert-severity recommendation (existing — suggested_action field)

- **Trigger**: backend-side, fires when `getObservabilityAlerts()` or `getCrossModuleAlerts()` returns an `ObservabilityAlert` with a non-null `suggested_action` string.
- **Snowflake call**: backend queries `ACCOUNT_USAGE.RESOURCE_MONITORS` + `WAREHOUSE_METERING_HISTORY`; Cortex Complete synthesizes the message.
- **Output**: rendered in the `<ActionRail>` slide-over inside an amber `suggested_action` block: `"This critical alert on warehouse {resource} fired 3 times in the last 7 days — consider adding a RESOURCE MONITOR with a SUSPEND trigger at 80% quota."`
- **Cortex feature**: Cortex Complete (text generation from structured Snowflake metadata context).

### 2. Slow-query materialisation hint (planned — query history tab)

- **Trigger**: user opens a slow-query drawer from the (P1) Query History tab; query has `mb_scanned > threshold` and no partition filter detected.
- **Snowflake call**: `ACCOUNT_USAGE.QUERY_HISTORY` for the selected `query_id`; Cortex Complete receives the query text + scan stats.
- **Output**: AI Tips block in the right bar: `"Query scans 2.4 B rows without a partition filter — Cortex suggests materialising the last-7-days slice as a dynamic table."`
- **Cortex feature**: Cortex Complete.

### 3. Lineage node — missing policy warning (planned — right-bar AI Tips)

- **Trigger**: user clicks a lineage canvas node that has no row-access or masking policy attached (policy_coverage_indicator = 0) and is accessed by ≥ 5 users.
- **Snowflake call**: `ACCOUNT_USAGE.POLICY_REFERENCES` filtered to the selected `{database}.{schema}.{object}`; access count from `ACCESS_HISTORY`.
- **Output**: `"Object {name} has no row-access or masking policy applied and is accessed by 12 users — consider attaching a masking policy via Governance."`
- **Cortex feature**: Cortex Complete; cross-links to `/governance`.

### 4. SLO breach analysis (planned — right-bar AI Tips)

- **Trigger**: user clicks an SLO row whose `status === 'BREACH'` or `breach === true`.
- **Snowflake call**: `ACCOUNT_USAGE.QUERY_HISTORY` grouped by warehouse for the SLO window; Cortex Complete receives `{slo.name, slo.target, slo.actual, slo.window_days, top_warehouse, failed_count}`.
- **Output**: `"Error budget for {slo.name} is exhausted ({remaining}% remaining) — the top contributor is {top_warehouse} with {failed} failed queries in the window."`
- **Cortex feature**: Cortex Complete.

### 5. Suggest materialised view for repeated-similar-query clustering (P3 planned)

- **Trigger**: periodic or on-demand scan; backend groups `QUERY_HISTORY` query fingerprints and detects clusters of structurally similar queries hitting the same base tables.
- **Snowflake call**: `ACCOUNT_USAGE.QUERY_HISTORY` + Cortex Complete via `POST /observability/intelligence/suggest-mv` (proposed endpoint).
- **Output**: surfaced as an Insight card on the Observability dashboard or the (P1) Query History tab.
- **Cortex feature**: Cortex Complete + Cortex Search (query similarity clustering).

---

## Redesign Right-Bar

The right bar is a proposed slide-over / sticky panel (replacing the current minimal `<ActionRail>` on the Alerts page only). It should be wired to row-click on all table pages and node-click on the ReactFlow canvas (Lineage).

### Details

Per-entity detail card rendered in the right bar on row click or canvas node click.

**For alerts:**
- Severity badge (color-coded: critical=red, high=red, medium=amber, low=blue, info=slate)
- Category (text)
- Source module (text, hidden if null)
- Resource (monospace font)
- Detected timestamp (ISO → `YYYY-MM-DD HH:MM:SS`, "—" if absent)
- Description (paragraph)
- Suggested action block (amber bordered card, present only when `suggested_action` is non-null)

**For tasks (Workflow / Lineage integration):**
- State badge (STARTED=green, SUSPENDED=amber, FAILED=red, SUCCEEDED=green)
- Schedule (cron expression or "Serverless")
- Warehouse name
- Last-run status (SUCCEEDED / FAILED / SKIPPED)
- Definition snippet (collapsed `<details>` showing first 5 lines of task DDL)

**For resource monitors (Budget page):**
- Quota / used / remaining credit bar (progress bar, color: green < 75%, amber 75–90%, red ≥ 90%)
- Frequency badge (DAILY / WEEKLY / MONTHLY)
- Notify threshold(s) and Suspend threshold(s)
- Linked warehouses (chip list)

**For SLO records:**
- Target vs actual gauge (radial progress or linear bar)
- Error budget burn bar (remaining percent, red when < 20%)
- Window days
- Failure count
- Status badge (Meeting=green, At Risk=amber, Breached=red)

**For lineage nodes:**
- Domain badge (TABLE / VIEW / DYNAMIC TABLE / TASK / STAGE / PIPE)
- `database.schema.object` path (monospace)
- Upstream count / Downstream count
- Policy coverage indicator (green tick if policies attached, red warning if zero)

### Actions

- **InsightActionButton: Acknowledge alert** — `POST /observability/alerts/{id}/ack` — visible when `selected.entity_type === 'alert' && selected.id != null`; disabled while `ackingId === selected.id`; success toasts "Alert acknowledged" and closes the right bar.
- **InsightActionButton: Suspend task** — `POST /connect/tasks/{fqn}/suspend` — visible when `selected.entity_type === 'task' && selected.state !== 'SUSPENDED'`; requires `workflow / suspend-task` RBAC action.
- **InsightActionButton: Resume task** — `POST /connect/tasks/{fqn}/resume` — visible when `selected.entity_type === 'task' && selected.state === 'SUSPENDED'`; requires `workflow / resume-task` RBAC action.

### Status SSE

The right bar subscribes to the following SSE event channels (via the shared SSE client) and re-renders the relevant badge/bar in place without closing:

| Channel | Payload | Right-bar update |
|---|---|---|
| `observability:alert:{alertId}:status` | `{status, acknowledged_at}` | severity badge, acknowledged indicator |
| `observability:task:{taskFqn}:run_status` | `{state, last_run_status, last_run_time}` | state badge + last-run cell |
| `observability:monitor:{monitorName}:breach` | `{used_credits, credit_quota, used_percent}` | credit bar, percent badge |
| `observability:slo:{sloName}:status` | `{status, actual, error_budget_remaining_percent}` | gauge, burn bar, status badge |

### AI Tips

Cortex-powered tips rendered in the AI Tips section of the right bar (collapsible, lazy-loaded on entity selection):

- **Selected alert**: `"This critical alert on warehouse {resource} fired 3 times in the last 7 days — consider adding a RESOURCE MONITOR with a SUSPEND trigger at 80% quota."`
- **Selected slow query** (once Query History tab is built): `"Query scans 2.4 B rows without a partition filter — Cortex suggests materialising the last-7-days slice as a dynamic table."`
- **Selected lineage node with no policy coverage**: `"Object {name} has no row-access or masking policy applied and is accessed by 12 users — consider attaching a masking policy via Governance."`
- **Selected SLO in BREACH**: `"Error budget for {slo.name} is exhausted ({remaining}% remaining) — the top contributor is {top_warehouse} with {failed} failed queries in the window."`

### History

- Alert right-bar history panel: `GET /observability/alerts?days=30` filtered client-side by `resource === selected.resource`
- Task right-bar history panel: `GET /observability/lineage/with-tasks?days=30` filtered by `task_name`
- Monitor right-bar credit history: `GET /observability/cost/monitors/{name}` (single-monitor read; already wired via `getCostMonitor()`)
- SLO history panel (target vs actual over rolling windows): `GET /observability/slo-tracking` (already wired via `getSloTracking()`)

---

## Henry Tasks

Prioritized backlog of gaps confirmed by code inspection (2026-06-07). Endpoints marked "(proposed)" require backend verification against `from app.main import app` before building the service call.

### P1 — Must ship next sprint

**P1-1: Query History tab**
- Paginated `QUERY_HISTORY` grid with columns: query_id (truncated), user, warehouse, execution_time_sec, mb_scanned, rows_produced, start_time, status.
- Per-query drawer: full query text, execution plan (if P2 endpoint ships), warehouse, error message.
- Service call: `GET /observability/performance/query-history?days={d}&limit={n}&offset={n}&warehouse={w}` — **proposed; verify against backend source**. Note: `getSlowQueries` at `/observability/performance/slow-queries` is wired in `index.ts` but the current FE renders nothing for it (no page or tab consumes it).
- Pagination: server-side cursor or offset; FE renders `<Pagination>` from rizzui.
- Connects to: right-bar AI Tips (Cortex slow-query tip), P2 Query Plan popup.

**P1-2: Error History tab**
- `QUERY_HISTORY WHERE error_code IS NOT NULL` grid: same columns as P1-1 plus `error_code`, `error_message`.
- Service call: `GET /observability/performance/error-history?days={d}` — **proposed; no FE service call exists; backend source must be verified**.
- May reuse the Query History endpoint with an `error_only=true` flag; confirm shape with backend.

**P1-3: Event Tables / Logs tab**
- Full-text search over `SNOWFLAKE.TELEMETRY.EVENTS`.
- Filter controls: resource_attributes (key:value pairs), record_type, scope, since (ISO datetime), limit.
- Service call: `GET /observability/events?resource_attributes={k}:{v}&record_type={t}&scope={s}&since={iso}&limit={n}` — **proposed; no FE service call exists**.
- Result: virtual-scroll table of event rows; expandable JSON column for `record` payload.

**P1-4: Sensor / Alert wizard**
- Visual no-code alert builder: pick metric (warehouse credit, query failure rate, storage %), set predicate (>, <, ==), set threshold value, set schedule (cron or on-query), set action (notify email / suspend warehouse).
- Sensor history drilldown: `GET /observability/alerts/sensors/{id}/history`.
- Service call: `POST /observability/alerts/sensors` — **proposed**.
- UX: multi-step wizard inside a `<Modal size="xl">`; step 1 = metric picker, step 2 = predicate + threshold, step 3 = schedule + action, step 4 = review + confirm.

### P2 — Next iteration

**P2-1: Lineage Path Drilldown popup**
- Triggered by canvas node click in `<LineageFlowView>`; opens a right-bar or modal showing upstream chain and downstream consumers.
- Service call: `GET /observability/lineage?database={db}&table={name}&days={d}` — **already wired in `getDataLineage()`; not connected to canvas click**.
- Wire: pass `onNodeClick` prop to `<LineageFlowView>` → set `selectedNode` state → fire `getDataLineage` → render in right-bar Details.

**P2-2: Per-monitor breach drilldown**
- Right-bar for a selected resource monitor: top responsible queries and users for the current period.
- Already-wired read: `GET /observability/cost/monitors/{name}` via `getCostMonitor()`.
- Proposed linked queries: `GET /observability/performance/query-history?warehouse={warehouse}&days=7` — **proposed**.

**P2-3: Set Warehouse Budget popup**
- A "Set Budget" button on the Budget page's warehouse table rows.
- Service call: `POST /observability/budgets` — **already wired as `createSpendBudget()` in `index.ts`; not yet surfaced in any FE form**.
- UX: compact inline modal with `name`, `monthly_credit_limit`, `warehouses` (multi-select), `alert_at_pct` fields.

**P2-4: Inspect Query Plan popup**
- Triggered from the P1-1 Query History drawer; shows the execution plan tree for a selected query.
- Service call: `GET /observability/performance/query-history/{queryId}/plan` — **proposed; requires backend route**.

**P2-5: 7-day cost forecast + top-50 queries by credits on budget page**
- Extend the daily-credits window to 37 days and project the next 7 days with a simple linear trend line on the `<CostOverviewCard>` chart.
- Already-wired: `GET /observability/cost/daily-credits?days=37` via `getDailyCredits(37)`.
- Top-50 queries by credits consumed: `GET /observability/performance/query-history?sort=credits_used&limit=50` — **proposed**.

### P3 — Future

**P3-1: Task DAG drag-to-reorganise in ReactFlow canvas**
- The current canvas in Lineage/Dependencies is read-only ReactFlow; add drag-handles and `onEdgesChange` to allow reordering task dependencies.
- Service call: `PUT /connect/tasks/{fqn}/dependencies` — **proposed; current canvas is read-only**.
- Requires confirmation dialog before persisting (destructive DDL: `ALTER TASK ... AFTER ...`).

**P3-2: Cortex "Suggest materialised view" for repeated-similar-query clustering**
- Background scan groups `QUERY_HISTORY` query fingerprints; clusters of ≥ 5 similar queries surfaced as an Insight card.
- Service call: `POST /observability/intelligence/suggest-mv` — **proposed Cortex Complete endpoint**.
- Output: suggested `CREATE DYNAMIC TABLE AS SELECT ...` DDL, estimated scan reduction, copy-to-clipboard action.

---

## Snowflake Features

| Feature | Used today | Where |
|---|---|---|
| `ACCOUNT_USAGE.QUERY_HISTORY` | Yes (slow queries, performance metrics, SLO tracking) | `getSlowQueries`, `getPerformanceMetrics`, `getSloTracking` |
| `ACCOUNT_USAGE.ACCESS_HISTORY` | Yes (lineage reconstruction) | `getDataLineage`, `getAccessPatterns` |
| `ACCOUNT_USAGE.OBJECT_DEPENDENCIES` | Yes (dependency graph) | `getObjectDependencies`, `getDependencyGraph` |
| `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY` | Yes (warehouse credit usage) | `getWarehouseUsage`, `getDailyCredits` |
| `ACCOUNT_USAGE.STORAGE_USAGE` | Yes (storage metrics) | `getStorageMetrics` |
| `ACCOUNT_USAGE.LOGIN_HISTORY` | Yes (security posture) | `getSecurityPosture` (via Trust Center) |
| `ACCOUNT_USAGE.POLICY_REFERENCES` | Yes (masking/RLS counts in security posture) | `getSecurityPosture` |
| `SHOW RESOURCE MONITORS` | Yes (resource monitor rows) | `getResourceMonitors` (org-accounts service) |
| `CREATE / ALTER RESOURCE MONITOR` | Yes (create monitor write path) | `createCostMonitor`, `updateCostMonitor`, `deleteCostMonitor` |
| `METADATA$ROW_LAST_MODIFIED_AT` | Yes (freshness probes) | `probeTableFreshness`, `probeSchemaFreshness`, `probeChanges` |
| `SNOWFLAKE.TELEMETRY.EVENTS` | No (P1 gap) | Proposed Event Tables / Logs tab |
| Dynamic Tables (`CREATE DYNAMIC TABLE`) | No (P3 gap) | Proposed Cortex materialised-view suggestion output |
| Cortex Complete | Partial (suggested_action on alerts — backend) | Planned: AI Tips in right-bar for alerts, SLO breach, lineage nodes, slow queries |
| Cortex Search | No (P3 gap) | Proposed query-similarity clustering for MV suggestions |
| Task DAG (`ALTER TASK ... AFTER`) | No (P3 gap) | Proposed drag-to-reorganise in ReactFlow canvas |
| Snowflake Alerts / SYSTEM$SEND_SNOWFLAKE_NOTIFICATION | No (P1 gap) | Proposed Sensor / Alert wizard |
