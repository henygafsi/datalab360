# Data360 — Per-Module Missing-Functionality Integration Specs

**Author:** Senior Product Architect (integration/UX)
**Date:** 2026-07-03
**Deliverable:** For each of the 13 platform modules — the wired-vs-available gap, the top-5 missing UI/UX actions (mutations first), and the single best next enhancement. Every recommendation **wires an endpoint that already exists in the live contract** (no new backend).

---

## Method, sources & caveats (read first)

**Sources.** Live contract `openapi.json` (917 paths / **1026 method+path pairs**); `fe_wired.json` (**457** unique method+path pairs the FE calls — a *stale-copy floor*); the stale FE tree; and the memory corpus.

**How the gap is computed.** Both sides are normalized: path params collapsed to `{}`, and the FE proxy prefixes `/api/v1` and `/api` stripped so `POST /api/v1/explore-design` matches contract `POST /explore-design`. Gap = `openapi − fe_wired` per family. Result: **780 unwired endpoints**, of which **735 map to the 13 modules** and **~326 are mutations** (the "missing actions").

**The floor caveat — important.** `fe_wired.json` is a *stale copy*, so the gap is a **ceiling of what's missing**, not a precise list. Three modules are newer than the snapshot and read as ~100% unwired even though the **current** FE already ships surfaces for them: `command_center` (ApprovalDetailModal, deploy approve/execute), `observability`, `catalog`, and the `account_overview` audit surface, `bi_reporting` (BiSmartRightBar), and `gouvernance` grants (`/api/platform/grants` live-tested per memory). Where the floor says "0 wired," I cross-reference memory and flag items that may already be partially built. **Treat counts as prioritization signal, not a punch-count.**

**UX norms applied (abbreviations used in tables).**
- **AxisCockpit** — hidable right panel + vertical axis rail with per-axis severity dots, lazy per-axis fetch, **zero popups**.
- **DensePage** — one dense scrollable page per module; no empty-shell / redirect-only tabs.
- **Gate** — every mutation behind `useCanPerform(module, action)` with a read-only banner for viewers.
- **HonestDash** — render `—`, never a fake `0`; role legible + switchable.
- **NeutralCopy** — no vendor names (Snowflake/Cortex/Kimi) in customer copy; contract families `/cortex/*` and `/api/snowflake/*` surface as "AI Assistant" / "Data Explorer".

**Gate vocabulary** (registered action keys — an unregistered key silently fails-open, per the connect `'read'`→`'view'` incident): `view · create · edit · delete · deploy · approve · execute · publish · share · suspend · resume · apply · run · manage`.

### Gap scoreboard

| Module | Contract endpoints | Wired (floor) | **Unwired** | **Unwired mutations** |
|---|---:|---:|---:|---:|
| explore_design | 177 | 74 | 103 | **72** |
| gouvernance | 177 | 77 | 100 | **48** |
| workflow | 81 | 7 | 74 | **44** |
| intelligent | 82 | 14 | 68 | **40** |
| bi_reporting | 31 | 0* | 31 | **21** |
| administration | 68 | 0* | 68 | **19** |
| observability | 54 | 0* | 54 | **17** |
| account_overview | 83 | 24 | 59 | **16** |
| catalog | 71 | 0* | 71 | **14** |
| connect | 45 | 28 | 17 | **11** |
| command_center | 51 | 0* | 51 | **10** |
| data_quality | 32 | 1 | 31 | **10** |
| data_products | 8 | 0* | 8 | **4** |
| **TOTAL (13 modules)** | **~950** | — | **735** | **~326** |

`*` = floor artifact; the current FE ships more than the stale snapshot (see caveat).

---

## 1. account_overview

**Family:** `org-accounts` · Contract **83** · wired ~24 · **unwired 59 · 16 mutations.**
The audit *reads* (logins, queries, access, security posture) shipped recently. The entire **account-lifecycle action layer is unwired** — the page shows posture but can't act on it.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /org-accounts/accounts/{id}/suspend` · `/activate` | Suspend / Activate toggle on each account row + Security axis | `account_overview:manage` | AxisCockpit · Gate |
| 2 | `POST /org-accounts/accounts/{id}/rotate-keys` | "Rotate keys" action in the account row overflow, confirm-inline (no popup) | `account_overview:manage` | Gate · AxisCockpit |
| 3 | `POST /org-accounts/accounts/{id}/reset-password` | "Reset password" row action, emits toast + audit entry | `account_overview:manage` | Gate |
| 4 | `PATCH /org-accounts/accounts/{id}/mfa` | MFA enforce switch in the Security axis of the cockpit | `account_overview:manage` | AxisCockpit · Gate |
| 5 | `POST /org-accounts/warehouses/{id}/resize` · `/suspend` · `PATCH …/auto-suspend` | Warehouse right-sizing controls in the Cost axis (inline stepper) | `account_overview:edit` | AxisCockpit · HonestDash |

**Best next enhancement:** Turn the read-only account-audit table into an actionable one — wire the suspend/activate/rotate-keys/reset-password row actions behind `account_overview:manage`, so posture findings become one-click remediations.

---

## 2. connect

**Family:** `connect` · Contract **45** · wired ~28 · **unwired 17 · 11 mutations.**
Best-wired module. Gaps are the **connector operational lifecycle** (test/sync/pause) and two whole source types (GCS, Oracle).

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /connect/connectors/{id}/test` | "Test connection" button on each connector card; result → status dot | `connect:view` (read-only probe) | Gate · HonestDash |
| 2 | `POST /connect/connectors/{id}/sync` | "Sync now" primary button on connector card | `connect:execute` | Gate |
| 3 | `POST /connect/tasks/{id}/suspend` · `/resume` | Pause/Resume toggle on each ingestion task row | `connect:manage` | Gate |
| 4 | `POST /connect/oracle/test` · `/sample-stage` · `/ingest` | Add "Oracle" to the source picker with the same test→stage→ingest wizard steps | `connect:create` | DensePage · Gate |
| 5 | `POST /connect/gcs/storage_integration` · `/stage` · `/notification_integration` | Add "Google Cloud Storage" to the source picker (parity with AWS/Azure) | `connect:create` | DensePage · Gate |

**Best next enhancement:** Add the per-connector **Test / Sync-now / Pause** action strip — the operational verbs that make Connect a control surface rather than a one-time setup form.

---

## 3. explore_design

**Family:** `explore-design` · Contract **177** · wired ~74 · **unwired 103 · 72 mutations.** Largest absolute gap.
Two clusters dominate: the **AI axis family** (`/ai/*`, ~16 ops that feed the redesign's right-rail axes) and the **safe-change / pre-deploy** family (dry-run, impact-analysis, conflict-check, quality-gates). This is the flagship ED-redesign target already specced in memory.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /explore-design/{id}/ai/schema-health` · `/discover-relationships` · `/classify-columns` · `/optimize-types` · `/recommend-scd` · `/clustering-keys` · `/warehouse-sizing` | Populate the **AxisCockpit rails** — each AI op is one axis with a severity dot, fetched lazily when its rail is opened (no popup) | `explore_design:view` (advisory) → `apply` on accept | **AxisCockpit** · NeutralCopy |
| 2 | `POST /explore-design/{id}/impact-analysis` (+ `/enhanced`) · `/conflict-check` · `/sql-diff` | "Impact & diff" preview panel before any deploy; renders blast-radius + SQL delta inline | `explore_design:view` | AxisCockpit · Gate |
| 3 | `POST /explore-design/{id}/dry-run` · `/full-dry-run` · `/pre-deploy-checks` · `/quality-gates/run` | "Dry-run" + "Run quality gates" buttons in the Deploy state-machine footer, gating the real deploy | `explore_design:deploy` | Gate · DensePage |
| 4 | `POST /explore-design/{id}/deployments/{d}/approvers` · `/approvers/{a}/decision` · `/verify` · `/post-verify` | Named-approver rail in the Release panel: request approval, record decision, post-verify | `explore_design:approve` | Gate · AxisCockpit |
| 5 | `POST /explore-design/dynamic-tables/{id}/suspend` · `/resume` · `/refresh`; `POST /streams` · `/tasks/{id}/suspend`·`/resume`; `DELETE …/{id}` for each object type | Object-lifecycle action menu on each canvas node (suspend/resume/refresh/drop) | `explore_design:manage` | DensePage · Gate |

**Best next enhancement:** Wire the `/ai/*` family into the AxisCockpit rails (schema-health, relationships, type/SCD/clustering advice) — it converts the redesign's empty axis dots into the module's core differentiator with zero new backend.

---

## 4. workflow

**Family:** `workflow` · Contract **81** · wired ~7 (floor) · **unwired 74 · 44 mutations.**
The FE snapshot calls `/etl/*` and `/workflows/*` (older shapes) that don't match the current `/workflow/*` contract, so the floor is misleadingly low — but the **execution + deploy + scheduling verbs are genuinely thin**.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /workflow/{id}/execute` · `/dry-run` · `/{id}/cancel` | Run / Dry-run / Cancel buttons in the workflow header; live run state in a right-rail axis | `workflow:execute` | Gate · AxisCockpit |
| 2 | `POST /workflow/{id}/deployments` · `/approve` · `/reject` · `/execute` · `/verify` | Deploy panel mirroring ED's state-machine: submit → approve/reject → execute → verify | `workflow:deploy` / `workflow:approve` | Gate · DensePage |
| 3 | `POST /workflow/{id}/schedule` · `/schedule/pause` · `/schedule/resume` · `DELETE …/schedule` | Schedule editor with Pause/Resume/Clear on the workflow row (replaces popup ScheduleManager) | `workflow:manage` | DensePage · Gate |
| 4 | `POST /workflow/{id}/validate` · `/pre-check` · `/compile` · `/rollback` · `/{id}/runs/{r}/analyze` | "Validate & compile" pre-flight + per-run "Analyze failure" + "Rollback" in the run history rail | `workflow:execute` | AxisCockpit · Gate |
| 5 | `POST /workflow/run-sql` · `/run-python` · `/notebooks` · `/notebooks/{id}/execute` · `POST /workflow/git/repositories` | Inline SQL/Python scratch-runner + notebook create/run + Git repo attach in the authoring pane | `workflow:create` | DensePage · Gate |

**Best next enhancement:** Give each workflow a **Run / Dry-run / Cancel** header plus a live run-state axis — the single most-requested verb set, all backed by existing `/execute` `/dry-run` `/cancel`.

---

## 5. bi_reporting

**Family:** `bi-dashboard` · Contract **31** · wired 0 (floor artifact; current FE ships BiSmartRightBar under older `/bi/*` routes) · **unwired 31 · 21 mutations.**
Reads work; the **dashboard authoring + publish/share lifecycle** is the real gap (memory: "publish/share pending").

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /bi-dashboard/{id}/publish` · `/unpublish` · `POST /{id}/share` · `DELETE /{id}/shares/{s}` | Publish toggle + Share manager in the dashboard header (draft→published state) | `bi_reporting:publish` / `share` | Gate · DensePage |
| 2 | `POST /bi-dashboard/{id}/widgets` · `PUT …/widgets/{w}` · `DELETE …/widgets/{w}` | Add/edit/remove widget directly on canvas via the smart right-bar (no popup) | `bi_reporting:edit` | AxisCockpit · DensePage |
| 3 | `POST /bi-dashboard/nl-to-chart` · `/auto-create` | "Describe a chart" natural-language box + "Auto-build dashboard" button | `bi_reporting:create` | NeutralCopy · Gate |
| 4 | `POST /bi-dashboard/{id}/filters` · `DELETE …/filters/{f}` · `POST /{id}/drill-through` | Smart-filter chips + drill-through on chart click (per the no-popup BI restructure) | `bi_reporting:edit` | AxisCockpit |
| 5 | `POST /bi-dashboard/{id}/snapshot` · `/pages` · `PUT/DELETE …/pages/{p}` | "Snapshot" (freeze for sharing) + multi-page tabs within one dashboard | `bi_reporting:create` | DensePage · Gate |

**Best next enhancement:** Close the **publish/unpublish/share** loop — a dashboard you can build but not publish or share is a dead-end; these three endpoints make BI deliverable.

---

## 6. intelligent

**Families:** `cortex` + `api/recommendations` · Contract **82** · wired ~14 · **unwired 68 · 40 mutations.**
The AI module is broad but thin: **recommendation action-loop** and **ML/analyst actions** are unwired. All customer copy must be **NeutralCopy** ("AI Assistant", not the vendor name).

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /api/recommendations/{id}/apply` · `/dismiss` · `/snooze` · `/acknowledge` · `/resolve` · `/reopen` | Action buttons on every recommendation card (Apply / Snooze / Dismiss); state persists | `intelligent:apply` | Gate · HonestDash |
| 2 | `POST /cortex/analyst/query` · `/query-analytics/analyze` | "Ask about your data" NL query box returning a governed, RLS-filtered answer | `intelligent:run` | NeutralCopy · Gate |
| 3 | `POST /cortex/code-generate` · `/semantic-models/generate-and-save` · `PUT /semantic-models/{id}` | "Generate SQL/model" assist in the authoring surfaces; save-back with review | `intelligent:create` | NeutralCopy · Gate |
| 4 | `POST /cortex/ml/classification/train` · `/predict` · `/top-insights` · `/top-insights/{id}/analyze` | "Train / Predict / Top-insights" ML panel with job-state axis | `intelligent:run` | AxisCockpit · Gate |
| 5 | `POST /cortex/snowpark/compute-pools` · `/{id}/suspend` · `/resume`; `/services/{id}/suspend`·`/resume`·`/auto-stop` | Compute-pool lifecycle controls (suspend idle pools) with cost readout | `intelligent:manage` | Gate · HonestDash |

**Best next enhancement:** Wire the **recommendation action-loop** (apply / snooze / dismiss / resolve) — insights the user can't act on are noise; this closes detect→notify→**act** with six existing endpoints.

---

## 7. data_quality

**Family:** `data-quality` · Contract **32** · wired ~1 · **unwired 31 · 10 mutations.**
Profiler reads shipped; the **DQ authoring + automation** (metric functions, scheduling, anomaly detection) is unwired.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /data-quality/auto-profile` · `/projects/{id}/dmf-check` | "Auto-profile" button per table + "Run checks now" on a project | `data_quality:run` | Gate · HonestDash |
| 2 | `POST /data-quality/dmf/associate` · `/custom` · `/thresholds` | Attach/define metric checks + set thresholds in a right-rail axis (no popup) | `data_quality:create` | AxisCockpit · Gate |
| 3 | `POST /data-quality/dmf/schedule` · `/suggest` | Schedule recurring checks; "Suggest metrics" assist | `data_quality:manage` | Gate · NeutralCopy |
| 4 | `POST /data-quality/anomaly-detection` | "Detect anomalies" action, results as severity dots on the Quality axis | `data_quality:run` | AxisCockpit |
| 5 | `POST /data-quality/trust-center/enable` · `/tables/{d}/{s}/{t}/optimize` | "Enable Trust Center" org toggle + per-table "Optimize" suggestion-apply | `data_quality:manage` | Gate · DensePage |

**Best next enhancement:** Make DQ actionable — **auto-profile + attach metric checks + schedule** on any table, turning the read-only profiler into a monitoring system.

---

## 8. gouvernance

**Families:** `gouvernance` + `api/platform` + `access-requests` · Contract **177** · wired ~77 · **unwired 100 · 48 mutations.**
Grants are partly wired (memory: `/api/platform/grants` live-tested — may already be in current FE). Genuine gaps: **policy authoring** (DMF, classification, masking, row-access), **access-request workflow**, and **identity/SSO**.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /access-requests` · `/{id}/approve` · `/{id}/deny` | Access-request inbox: submit, approve, deny — the self-service grant workflow | `gouvernance:approve` | Gate · DensePage |
| 2 | `POST /gouvernance/policies/masking/preview` · `/row-access/simulate` · `/pii-scan` | "Preview masking" / "Simulate row-access" before apply; PII scan on a dataset | `gouvernance:view` (sim) → `apply` | Gate · AxisCockpit |
| 3 | `POST /gouvernance/policies/dmf` · `/associate` · `/disassociate` · `/schedule` | Data-metric policy authoring + attach/detach + schedule on the policy page | `gouvernance:create` | DensePage · Gate |
| 4 | `POST /gouvernance/policies/classification/classify` · `/apply-tags` · `/classifiers` | Auto-classify + tag-apply panel; manage classifiers/regex | `gouvernance:apply` | Gate · NeutralCopy |
| 5 | `POST /gouvernance/oauth/saml-integrations` · `/integrations` · `/service-users`; `POST /gouvernance/user/mfa/set` | SSO/SAML + service-user setup + per-user MFA enforce in an Identity axis | `gouvernance:manage` | Gate · AxisCockpit |

**Best next enhancement:** Ship the **access-request workflow** (submit → approve/deny) — it's a complete 3-endpoint feature that turns governance from admin-only config into self-service, closing the loop the command-center approvals surface already hints at.

---

## 9. observability

**Families:** `observability` + `api/workspace` · Contract **54** · wired 0 (floor artifact; module newer than snapshot) · **unwired 54 · 17 mutations.**
Reads likely ship in current FE; the **cost-control + alerting mutations** and the **personal workspace layer** are the gap. Note memory: a dead `deleteCostMonitor` and ungated ScheduleManager — wire these correctly.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /observability/cost/monitors` · `PUT/DELETE …/{id}` · `/{id}/assign` | Cost-monitor CRUD + assign-to-warehouse in the Cost axis (replaces the dead delete path) | `observability:manage` | Gate · AxisCockpit |
| 2 | `POST /observability/budgets` · `PUT/DELETE …/{id}` | Budget create/edit/delete with spend-vs-budget meter | `observability:manage` | Gate · HonestDash |
| 3 | `POST /observability/alerts/{id}/ack` | "Acknowledge" on each alert; acked alerts dim on the Alerts axis | `observability:manage` | AxisCockpit · Gate |
| 4 | `POST /observability/slo` · `/probes/batch-check` | Define an SLO + "Run probes now" health check | `observability:create` | Gate |
| 5 | `POST /api/workspace/saved-views` · `PATCH/DELETE …/{id}` · `POST /watchlist` · `DELETE …/{id}` | Save-view + watchlist star on any monitored object (personal workspace layer) | `observability:view` | DensePage · HonestDash |

**Best next enhancement:** Wire **cost-monitor + budget CRUD** into the Cost axis (and retire the dead delete path) — observability without spend guardrails is just a dashboard.

---

## 10. catalog

**Families:** `catalog` + `api/snowflake/explorer` · Contract **71** · wired 0 (floor artifact) · **unwired 71 · 14 mutations.**
Mostly a **read/discovery** surface (facets, objects, lineage, audit) — surface it as "Data Explorer" (**NeutralCopy**, the family is vendor-named). The mutations are curation actions.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /catalog/products/{id}/publish` · `/generate-kpis` · `/recommend-model` | Publish a catalog product + AI-suggest its KPIs/model from the product page | `catalog:publish` | Gate · NeutralCopy |
| 2 | `POST /catalog/kpis` · `/kpis/{id}/validate` | Define + validate a KPI against live data, inline | `catalog:create` | Gate |
| 3 | `POST /catalog/recommendations/{id}/apply` · `/objects/{id}/clustering/apply` | Apply a catalog recommendation / clustering suggestion (one-click curation) | `catalog:apply` | Gate · AxisCockpit |
| 4 | `POST /api/snowflake/explorer/objects/bulk-action` · `/selection-review` | Multi-select objects in the explorer → bulk action bar (tag/review) | `catalog:manage` | DensePage · Gate |
| 5 | `POST /catalog/tables/notify-consumers` · `/objects/{id}/scores/recompute` · `POST /catalog/refresh` | "Notify consumers" of a change + "Recompute quality score" + manual refresh | `catalog:manage` | Gate · HonestDash |
| — (read panel) | `GET /api/snowflake/explorer/objects/{id}/lineage` · `/audit` · `/governance` | Lineage + audit + governance axes in the object cockpit (mostly reads) | `catalog:view` | AxisCockpit |

**Best next enhancement:** Surface the object explorer (`/api/snowflake/explorer/*`) as a **"Data Explorer" DensePage** with lineage/audit/governance axes and a bulk-action bar — it's a nearly-complete discovery product sitting entirely unwired.

---

## 11. command_center

**Families:** `command-center` + `deployments` · Contract **51** · wired 0 (floor artifact — ApprovalDetailModal & deploy approve/execute exist in current FE) · **unwired 51 · 10 mutations.**
The 3 native command-center mutations are cache plumbing, not product actions — the compelling verbs live in `deployments/track` (**may be partially wired already**). Fill the rest with the high-value ops **read panels** this module exists to show.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /deployments/track/{id}/approve` · `/reject` · `/execute` · `/rollback` · `/complete` (may be partly wired) | Deployment control row: approve/reject → execute → rollback, with approver identity | `command_center:approve` / `execute` | Gate · DensePage |
| 2 | `POST /deployments/track` · `PATCH /track/{id}/step` | "Track a deployment" + per-step progress advance in the release board | `command_center:deploy` | Gate |
| 3 (read) | `GET /command-center/cost-breakdown` · `/cost-by-warehouse` · `/cost-by-service` · `/clustering-costs` | Cost-breakdown axis in the cockpit (by service/warehouse) | `command_center:view` | AxisCockpit · HonestDash |
| 4 (read) | `GET /command-center/audit/login-history` · `/query-history` · `/access-history` | Unified audit-history axis (logins/queries/access) with severity dots | `command_center:view` | AxisCockpit |
| 5 (read) | `GET /command-center/activity-feed` · `/cross-module` · `/dwh-proposal` | Live activity feed + cross-module signal panel on the dense overview | `command_center:view` | DensePage · HonestDash |

**Best next enhancement:** Consolidate the **deployment-track approve→execute→rollback** controls into one command-center release board (verifying what's already partly wired) so approvals, execution and cost land on a single dense page.

---

## 12. data_products

**Family:** `data-products` · Contract **8** · wired 0 (floor artifact) · **unwired 8 · 4 mutations.**
Small, clean, entirely unwired in the floor. Only 4 mutations exist — slot 5 is a read-derived panel, not an invented action.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /data-products` | "Create data product" primary button on the products page | `data_products:create` | Gate · DensePage |
| 2 | `POST /data-products/{id}/publish` | Publish toggle (draft→published) on the product header | `data_products:publish` | Gate |
| 3 | `POST /data-products/{id}/subscribe` | "Subscribe" button for consumers on the product card | `data_products:view` | Gate |
| 4 | `POST /data-products/{id}/refresh` | "Refresh" action with last-refreshed timestamp (`—` if never) | `data_products:manage` | Gate · HonestDash |
| 5 (read panel) | `GET /data-products/{id}/consumers` · `/lineage` | Consumers + lineage axes in the product cockpit (no mutation — read-derived) | `data_products:view` | AxisCockpit |

**Best next enhancement:** Ship the full **create → publish → subscribe** product lifecycle (3 endpoints) plus a consumers/lineage axis — an entire marketable module currently at zero surface.

---

## 13. administration

**Families:** `administration` + `admin` + `api/administration` + `api/data360` + `cache` + `cache-stream` · Contract **68** · wired 0 (floor artifact — /administration is mature in current FE) · **unwired 68 · 19 mutations.**
Reads are mature (memory: G9 14/15 feeds). Gaps are **operational controls**: cache management, entitlements, platform config.

| # | Endpoint | UI control to add | Gate | Norm |
|---|---|---|---|---|
| 1 | `POST /cache/warmup` · `/warmup/trigger` · `/refresh/start` · `/refresh/stop` · `POST /admin/cache/warm` | Cache control panel: warm / start-stop refresh, with per-surface coverage meter | `administration:manage` | Gate · HonestDash |
| 2 | `POST /cache/clear/all` · `/clear/pattern` · `DELETE /cache/keys/{k}` · `POST /admin/cache/invalidate-surface` | "Invalidate" controls (all / by-pattern / by-key / by-surface) with confirm-inline | `administration:manage` | Gate |
| 3 | `PUT /api/administration/entitlements/{module}/{feature}` | Per-module/feature entitlement toggles in the entitlements matrix | `administration:manage` | DensePage · Gate |
| 4 | `PUT /api/data360/platform-config/{key}` · `POST /platform-config/reset` · `PATCH /cache-config` | Platform-config editor with per-key edit + reset-to-default | `administration:edit` | Gate · HonestDash |
| 5 | `POST /admin/api-health/runs` · `POST /api/data360/table-refresh-mapping/refresh` | "Run API-health sweep" + "Refresh table mapping" ops buttons | `administration:run` | Gate |

**Best next enhancement:** Add the **cache control panel** (warm / refresh / invalidate-by-surface) behind `administration:manage` — the ops team's most-needed lever, and the fix for the recurring "cache initializing" incidents.

---

## Appendix — cross-cutting / unmapped families (the other ~45 unwired)

Not owned by any single module; surfaced globally or in a shell. Listed so all **780** unwired endpoints are accounted for.

| Family | Unwired | Mutations | Where it belongs |
|---|---:|---:|---|
| `projects` | 13 | 8 | Global project-context switcher (CRUD, members) — cross-cutting |
| `chat` | 11 | 6 | Team collaboration (DMs/groups/messages) — **human chat, not the AI module**; global dock |
| `user` | 6 | 4 | Profile / preferences — global settings |
| `notifications` | 5 | 3 | Global notification bell (mark-read, unread-count) |
| `common` | 5 | 0 | Shared lookups (databases/schemas) — used by many modules |
| infra | ~4 | ~1 | `signin`, `ready`, `health`, `api/refresh-state` — platform plumbing |

**Total unwired reconciliation:** 735 (13 modules) + ~45 (cross-cutting/infra) = **780**.

---

## One-page summary — best next enhancement per module

| Module | Missing mutations | Best next enhancement |
|---|---:|---|
| explore_design | 72 | Wire `/ai/*` into AxisCockpit rails (schema-health, relationships, type/SCD/clustering advice) |
| gouvernance | 48 | Ship the access-request workflow (submit → approve/deny) — a complete self-service loop |
| workflow | 44 | Run / Dry-run / Cancel header + live run-state axis on every workflow |
| intelligent | 40 | Recommendation action-loop (apply / snooze / dismiss / resolve) |
| bi_reporting | 21 | Close publish / unpublish / share so dashboards become deliverable |
| administration | 19 | Cache control panel (warm / refresh / invalidate-by-surface) behind `administration:manage` |
| observability | 17 | Cost-monitor + budget CRUD in the Cost axis (retire the dead delete path) |
| account_overview | 16 | Actionable account rows: suspend/activate/rotate-keys/reset-password |
| catalog | 14 | Surface the object explorer as a "Data Explorer" page with lineage/audit/governance axes |
| connect | 11 | Per-connector Test / Sync-now / Pause action strip |
| command_center | 10 | One release board: deployment approve → execute → rollback + cost |
| data_quality | 10 | Auto-profile + attach metric checks + schedule on any table |
| data_products | 4 | Full create → publish → subscribe lifecycle + consumers/lineage axis |

**Total missing actions (mutations) across the 13 modules: ~326** (of 780 unwired endpoints; 735 module-mapped). Counts are a stale-floor **ceiling** — the current FE ships more than the snapshot, especially for the newer command_center / observability / catalog / data_products modules.
