# Data360 API — full annuaire & usage

> Auto-generated from the live contract. **1026 operations**, 21 modules.
> Wired flags are a **STALE-COPY FLOOR** (FE read from the readable ~/Downloads snapshot, 53 svc files; current FE has 93 → true wired ~45–55%). **MISSING** = candidate backend-delta / unwired action to verify against current source, then wire if truly absent.

## Coverage by module

| Module | Ops | Wired (floor) | Missing | Missing mutations |
|---|--:|--:|--:|--:|
| Account Overview | 83 | 24 | 59 | 16 |
| Administration | 27 | 0 | 27 | 3 |
| BI & Reporting | 31 | 0 | 31 | 21 |
| Catalog | 33 | 0 | 33 | 10 |
| Command Center | 42 | 0 | 42 | 3 |
| Connect Data | 45 | 28 | 17 | 11 |
| Data Products | 8 | 0 | 8 | 4 |
| Data Quality | 32 | 1 | 31 | 10 |
| Explore & Design | 217 | 97 | 120 | 82 |
| Governance | 155 | 77 | 78 | 39 |
| Intelligent | 81 | 14 | 67 | 38 |
| Observability | 43 | 0 | 43 | 10 |
| Platform | 129 | 3 | 126 | 47 |
| Workflow | 81 | 7 | 74 | 44 |
| analytics | 1 | 0 | 1 | 0 |
| cache-stream | 5 | 0 | 5 | 1 |
| common | 5 | 0 | 5 | 0 |
| health | 1 | 0 | 1 | 0 |
| notifications | 5 | 0 | 5 | 3 |
| ready | 1 | 0 | 1 | 0 |
| signin | 1 | 0 | 1 | 1 |

## Account Overview — 83 ops, 59 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/org-accounts/account-health-score` |  | object | Account health composite score | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/accounts` |  | object | List all accounts | ACCOUNTADMIN |  | wired | served (gated) |
| POST | `/org-accounts/accounts` | ⚠ | object | Create an organization account (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/org-accounts/accounts/{account_name}` | ⚠ | object | Drop a Snowflake account (orgadmin only, hard with grace period) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/org-accounts/accounts/{account_name}` |  | object | Account detail (composite) | ACCOUNTADMIN |  | wired | served (gated) |
| PATCH | `/org-accounts/accounts/{account_name}` | ⚠ | object | Update editable account fields (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/accounts/{account_name}/activate` | ⚠ | object | Reactivate a managed account (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| PATCH | `/org-accounts/accounts/{account_name}/mfa` | ⚠ | object | Enforce / relax MFA on an account (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/accounts/{account_name}/reset-password` | ⚠ | object | Reset the admin password for an account (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/accounts/{account_name}/rotate-keys` | ⚠ | object | Rotate RSA key-pair for an account admin (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/accounts/{account_name}/suspend` | ⚠ | object | Suspend a managed account (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/accounts/{account_name}/transfer-ownership` | ⚠ | object | Transfer account ownership (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/org-accounts/accounts/audit` |  | object | Consolidated per-account audit (credits+storage+queries+logins) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/alerts` |  | object | Alerts | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/anomalies` |  | object | Cost / usage anomalies | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/audit/access-history` |  | object | Data access audit trail | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/audit/login-history` |  | object | Authentication audit trail | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/audit/query-history` |  | object | DQL audit trail from ACCOUNT_USAGE | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/automation-overview` |  | object | Tasks / automation rollup | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/contract` |  | object | Contract terms / items | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/cortex-costs` |  | object | Cortex AI cost breakdown | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/cost-simulation/{object_type}/{object_id}` |  | object | Per-object 30-day cost simulation | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/credit-forecast` |  | object | Credit usage forecast | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/credits` |  | object | Org credits aggregate (last N days) | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/credits/history/{account_name}` |  | object | Per-account daily credit history | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/credits/top` |  | object | Top credit-consuming accounts | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/credits/trend` |  | object | Daily credit trend | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/cross-account/usage` |  | object | Cross-account usage costs | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/dashboard/overview` |  | object | Org-wide overview aggregate | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/dashboard/trends` |  | object | Org-wide trends (credits + storage) | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/dashboard/usage` |  | object | Credit + storage totals | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/data-loading-overview` |  | object | Data-loading KPI rollup | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/data-operations-overview` |  | object | Data-operations rollup | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/data-transfer` |  | object | Data-transfer usage / cost | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/events` |  | object | Platform events audit trail | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/filter-options` |  | object | Filter options for Command Center | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/governance-grants-overview` |  | object | Grants rollup (governance) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/governance-overview` |  | object | Governance KPI rollup | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/grants-overview` |  | object | Grants summary | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/health` |  | object | Health scores | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/health/{account_name}` |  | object | Account health | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/logins` |  | object | Recent login activity (org-wide) | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/logins/{account_name}` |  | object | Per-account login history | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/logins/failed` |  | object | Failed login attempts | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/metering` |  | object | Metering per account | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/metering/trend` |  | object | Daily metering trend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/org-summary` |  | object | Org activity: role → module/project → account | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/organization/costs` |  | object | Org costs by account in currency | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/organization/remaining-balance` |  | object | Org remaining credit balance | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/organization/storage` |  | object | Org storage per account | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/organization/warehouse-credits` |  | object | Org warehouse credits per account | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/performance-overview` |  | object | Performance KPI rollup | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/platform-activity` |  | object | Data360 platform activity | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/projects-overview` |  | object | Projects & deployments overview | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/queries` |  | object | Aggregate query stats (org-wide) | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/queries/trend` |  | object | Daily query volume trend | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/rate-sheet` |  | object | Credit rate sheet | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/reader-accounts` |  | object | Reader accounts (managed accounts) | ACCOUNTADMIN |  | wired | served (gated) |
| POST | `/org-accounts/reader-accounts` | ⚠ | object | Create a reader (managed) account (orgadmin only) | ACCOUNTADMIN |  | wired | mutation (not probed) |
| DELETE | `/org-accounts/reader-accounts/{account_name}` | ⚠ | object | Drop a reader (managed) account (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/org-accounts/replication` |  | object | Replication usage / spend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/resource-monitors` |  | object | List resource monitors | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/org-accounts/resource-monitors` | ⚠ | object | Create or replace a resource monitor (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/org-accounts/resource-monitors/{name}` | ⚠ | object | Drop a resource monitor (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/row-timestamps/activate` | ⚠ | object | Activate row timestamps on all supported tables | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/org-accounts/row-timestamps/status` |  | object | Check row timestamp support per table | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/security-overview` |  | object | Security posture overview | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/services/clustering` |  | object | Auto-clustering spend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/services/materialized-views` |  | object | MV maintenance spend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/services/pipes` |  | object | Snowpipe spend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/services/query-acceleration` |  | object | Query-acceleration spend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/services/search-optimization` |  | object | Search-optimization spend | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/shares` |  | object | Outbound + inbound shares | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/shares/{share_name}` |  | object | Per-share detail | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/storage/databases` |  | object | Per-database storage | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/storage/stages` |  | object | Per-account stage storage | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/storage/trend` |  | object | Daily storage trend (org-wide) | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/usage-analytics` |  | object | Usage analytics breakdown | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/org-accounts/warehouses` |  | object | Org-wide warehouse usage | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/org-accounts/warehouses/{account_name}` |  | object | Per-account warehouse cost | ACCOUNTADMIN |  | wired | served (gated) |
| PATCH | `/org-accounts/warehouses/{warehouse_name}/auto-suspend` | ⚠ | object | Set warehouse auto-suspend timeout (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/warehouses/{warehouse_name}/resize` | ⚠ | object | Resize a warehouse (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/org-accounts/warehouses/{warehouse_name}/suspend` | ⚠ | object | Suspend an idle warehouse (orgadmin only) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |

## Administration — 27 ops, 27 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/admin/activity-stats` |  | object | USER_ACTIVITY events grouped by module/project/user | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/api-health/introspect` |  | object | Snowflake query + related events behind a probed api-health call | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/admin/api-health/runs` | ⚠ | object | Persist an api-health probe sweep as a tracked release run | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/admin/api-health/runs` |  | object | Per-run KPIs + per-release rollup/trend for the api-health history | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/api-health/runs/{run_id}` |  | object | Stored endpoint rows + summary + slowest-N for one persisted run | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/cache/coverage` |  | object | Cache warm coverage per account/role + @shared_cache self-check | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/admin/cache/invalidate-surface` | ⚠ | object | Precisely evict one UI surface for one account (all roles) | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/admin/cache/svc-health` |  | object | Per-account SVC connection health (+ dev-fallback flag) | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/admin/cache/warm` | ⚠ | object | Trigger a one-account cache warm pass | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/admin/endpoint-usage` |  | object | Top API endpoints by request count | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/server-metrics` |  | object | Live in-process server metrics | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/service-account/health` |  | object | Service Account Health | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/svc-registry` |  | object | Get Svc Registry | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/admin/usage-by` |  | object | AUDIT_LOG request counts grouped by a dimension | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/by-cache` |  | object | Cache hit/miss rollup pivoted on a validated axis | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/by-endpoint` |  | object | Per-endpoint (method, path) performance rollup | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/by-module` |  | object | Per-module performance rollup | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/by-tab` |  | object | Workload rollup per tab (actions behind each tab) | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/by-user` |  | object | Per-user activity rollup | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/errors` |  | object | Most-recent errors and RBAC denials | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/events` |  | object | Data360 events audit (USER_ACTIVITY) by module × type | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/events/feed` |  | object | Most-recent Data360 events with all columns | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/overview` |  | object | Account-grain performance KPIs (USER_REQUESTS) | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/tab/{tab}` |  | object | All workloads behind one tab: endpoints, actions, users | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/{account}/user/{username}` |  | object | Per-user performance drill-down | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/performance/audit/by-account` |  | object | Endpoint audit by account (super-admin: cross-account) | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/administration/platform-health` |  | object | Account-grain platform-health KPIs (ACCOUNT_USAGE, caller connection — no SVC needed) | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |

## BI & Reporting — 31 ops, 31 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/bi-dashboard` | ⚠ | object | Create BI dashboard project | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{dashboard_id}/cost` |  | object | Per-dashboard query cost (credits/bytes) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/bi-dashboard/{dashboard_id}/drill-through` | ⚠ | object | Drill through widget data | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}` |  | object | Get dashboard design | BI_ANALYST | P2 | **MISSING** | served (gated) |
| PUT | `/bi-dashboard/{project_id}` | ⚠ | object | Update dashboard metadata | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/bi-dashboard/{project_id}` | ⚠ | object | Delete dashboard project | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}/export` |  | object | Export dashboard config + widget data as JSON | BI_ANALYST | P2 | **MISSING** | not-probed |
| POST | `/bi-dashboard/{project_id}/filters` | ⚠ | object | Add filter | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}/filters` |  | object | List filters | BI_ANALYST | P2 | **MISSING** | served (gated) |
| DELETE | `/bi-dashboard/{project_id}/filters/{filter_id}` | ⚠ | object | Delete filter | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/{project_id}/pages` | ⚠ | object | Add page | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}/pages` |  | object | List pages | BI_ANALYST | P2 | **MISSING** | served (gated) |
| PUT | `/bi-dashboard/{project_id}/pages/{page_id}` | ⚠ | object | Update page | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/bi-dashboard/{project_id}/pages/{page_id}` | ⚠ | object | Delete page | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/{project_id}/publish` | ⚠ | object | Publish dashboard (draft → live) | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/{project_id}/render` | ⚠ | object | Batch render all widgets on a page | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/{project_id}/share` | ⚠ | object | Share dashboard with a user or role | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}/shares` |  | object | List dashboard share grants | BI_ANALYST | P2 | **MISSING** | served (gated) |
| DELETE | `/bi-dashboard/{project_id}/shares/{share_id}` | ⚠ | object | Revoke a dashboard share grant | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/{project_id}/snapshot` | ⚠ | object | Save dashboard design as version | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}/status` |  | object | Get dashboard publish status | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/bi-dashboard/{project_id}/unpublish` | ⚠ | object | Unpublish dashboard (live → draft) | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/{project_id}/widgets` | ⚠ | object | Add widget to page | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/{project_id}/widgets` |  | object | List widgets | BI_ANALYST | P2 | **MISSING** | served (gated) |
| PUT | `/bi-dashboard/{project_id}/widgets/{widget_id}` | ⚠ | object | Update widget | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/bi-dashboard/{project_id}/widgets/{widget_id}` | ⚠ | object | Delete widget | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/auto-create` | ⚠ | object | Auto-create dashboard from table or schema | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/charts/data` | ⚠ | object | Get chart data | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/bi-dashboard/nl-to-chart` | ⚠ | object | Generate chart from natural language | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/bi-dashboard/retail-kpis` |  | object | Get retail KPIs | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/bi-dashboard/templates` |  | object | List dashboard templates | BI_ANALYST | P2 | **MISSING** | served (gated) |

## Catalog — 33 ops, 33 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/catalog/events` |  | object | Catalog event timeline (PROJECT_EVENTS WHERE module=CATALOG) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/kpis` |  | object | List KPI catalog entries | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/kpis` | ⚠ | object | Create a KPI | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/kpis/{kpi_id}` |  | object | Get one KPI | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/kpis/{kpi_id}/validate` | ⚠ | object | Flip KPI DRAFT → VALIDATED | RETAIL_GOVERNOR | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/objects/{object_fqn}/history` |  | object | Per-object history — UNION of PROJECT_EVENTS + USER_REQUESTS + ACCOUNT_USAGE.ACCESS_HISTORY | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/objects/{object_id}/360` |  | object | Object 360 — superset of /deep-dive (adds usage, finops, recos, scores) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/objects/{object_id}/clustering/apply` | ⚠ | object | Apply a clustering-key recommendation — ALTER TABLE <fqn> CLUSTER BY (<cols>) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/objects/{object_id}/scores` |  | object | Persisted scores for one object (None if never computed) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/objects/{object_id}/scores/recompute` | ⚠ | object | Compute + persist scores for one object | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/overview` |  | object | Account-wide catalog snapshot | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/products` |  | object | List data products + trust score | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/products/{product_id}/assets` |  | object | Objects bound to this product | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/products/{product_id}/generate-kpis` | ⚠ | object | Auto-generate KPI drafts for a product | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/products/{product_id}/kpis` |  | object | KPIs bound to product | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/products/{product_id}/lineage` |  | object | Anchor table + 1-hop neighbours | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/products/{product_id}/overview` |  | object | Product card + scoring + counts | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/products/{product_id}/publish` | ⚠ | object | Flip product DRAFT → PUBLISHED + emit event | RETAIL_GOVERNOR | P1 | **MISSING** | mutation (not probed) |
| POST | `/catalog/products/{product_id}/recommend-model` | ⚠ | object | Queue a Cortex model proposal for this product | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/profile/{database}/{schema}/{table}` |  | object | Per-column null % + approx distinct (sampled ≤1000 rows, no full scan) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/recommendations` |  | object | Open recommendations filtered by scope (account/product/object/severity) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/recommendations/{reco_id}/apply` | ⚠ | object | Mark a recommendation as applied + cascade cache invalidation | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/catalog/refresh` | ⚠ | object | Trigger catalog refresh (sync or background) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/refresh/{run_id}` |  | object | Refresh run status | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/scores` |  | object | Account-wide score rollup | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/sources` |  | object | Sources catalog — Snowflake DBs + connectors | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/tables/{database}/{schema}/{table}/context` |  | object | SmartRightBar Section 1 — table context (stats + tags + cost/dq) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/tables/{database}/{schema}/{table}/governance` |  | object | SmartRightBar Section 3 — tags, masking/RLS policies, PII flags | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/tables/{database}/{schema}/{table}/ingestion` |  | object | SmartRightBar Section 5 — last loads + tasks/streams (best-effort) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/tables/{database}/{schema}/{table}/lineage` |  | object | SmartRightBar Section 4 — 1-hop upstream + downstream lineage | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/catalog/tables/{database}/{schema}/{table}/ownership` |  | object | SmartRightBar Section 6 — owner role + top reader users 30d | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/catalog/tables/notify-consumers` | ⚠ | object | Flag a table change for recent readers — records it in History + returns recent-reader count (no direct delivery: readers aren't resolvable to recipients) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/catalog/tags/flow` |  | object | Tag usage aggregation — tag_name → count of tagged objects | BI_ANALYST | P2 | **MISSING** | served (gated) |

## Command Center — 42 ops, 42 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/command-center/activity-feed` |  | object | Unified activity feed | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/audit/access-history` |  | object | Data access audit trail | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/audit/login-history` |  | object | Login audit trail | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/audit/query-history` |  | object | Query history audit table | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/cache-metrics` |  | object | Cache, warming & per-endpoint call metrics (admin observability) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/clustering-costs` |  | object | Per-table auto-clustering cost | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/cost-breakdown` |  | object | Comprehensive cost intelligence | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/cost-by-service` |  | object | Credit cost by service type | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/cost-by-warehouse` |  | object | Per-warehouse credit cost (compute/cloud split) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/cross-module` |  | object | Cross-module intelligence with join queries | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/dwh-proposal` |  | object | DWH improvement proposal — all pain points + audit/workflow CTAs (gov · dedup · perf · cost · DQ) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/filter-options` |  | object | Smart filter options with counts | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/infrastructure` |  | object | Snowflake infrastructure snapshot | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/kpis` |  | object | All four KPI dimensions (dq+gov+perf+cost) in one call | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/kpis/{dimension}` |  | object | Exhaustive KPI scorecards + auditable detail table for one dimension (dq\|gov\|perf\|cost) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/module-health` |  | object | Per-module health status | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/mv-refresh-costs` |  | object | Per-MV refresh cost | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/object-enrichment` |  | object | Per-object USAGE + attributed COST + project/product tag link (single FULL-OUTER payload) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/object-lineage` |  | object | Real 1-hop object lineage graph (OBJECT_DEPENDENCIES + ACCESS_HISTORY) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/overview-kpis` |  | object | Consolidated Overview-tab payload (9 cards + 6 donuts + 2 panels) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/command-center/overview-kpis/install` | ⚠ | object | Provision DATA360_CACHE.OVERVIEW_KPIS (table + proc + tasks) — super-admin | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/command-center/overview-kpis/refresh` | ⚠ | object | Force refresh of OVERVIEW_KPIS cache for the given range | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/command-center/pipe-usage` |  | object | Per-pipe Snowpipe cost & throughput | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/pipelines` |  | object | Pipeline & ingestion health | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/profiling/column` |  | object | Profile a column — distinct values, nulls, distribution | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/projects/{project_id}/rollup` |  | object | Per-project precomputed KPI rollup (DQ·PERF·GOV·STORAGE+COST+recos), cheap table read | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/projects/{project_id}/scores` |  | object | Per-project DQ/COST/PERF/GOV scores, each flagged scope=project\|account | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/query-intelligence` |  | object | Top queries, slow queries, errors | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/recommendations` |  | object | Actionable recommendations + CTAs across DQ/GOV/PERF/STORAGE/COST | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/recommendations/{dimension}` |  | object | Recommendations + CTAs for one dimension (dq\|gov\|perf\|storage\|cost) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/role-hierarchy` |  | object | Role inheritance tree + per-role priv/user counts | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/security-audit` |  | object | Security & audit intelligence | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/snowflake-insights` |  | object | AI analysis of Snowflake features → actionable, coherently-routed insights | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/summary` |  | object | Executive summary — all-module KPIs | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/table-storage` |  | object | Per-table storage breakdown (active/TT/failsafe/clone + est $) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/tabs/{tab}` |  | object | Consolidated per-tab payload (kpis+charts+tables) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/task-history` |  | object | Per-task execution + serverless cost | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/time-context` |  | object | Parse time range + compute comparison period | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/user-activity-monitor` |  | object | Per-user activity & error rollup from EVENT_STORE.USER_REQUESTS | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/user-activity-monitor/errors` |  | object | Recent per-user errors from EVENT_STORE.USER_REQUESTS | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/command-center/warehouse-performance` |  | object | Warehouse utilization & performance | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/command-center/warm-user-cache` | ⚠ | object | Warm all essential caches for current user | any | P1 | **MISSING** | mutation (not probed) |

## Connect Data — 45 ops, 17 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/connect/aws/stage` | ⚠ | object | Create AWS stage | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/aws/storage_integration` | ⚠ | object | Create AWS storage integration | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/azure/notification_integration` | ⚠ | object | Create Azure notification integration | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/azure/snowpipe` | ⚠ | object | Create Azure Snowpipe | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/azure/stage` | ⚠ | object | Create Azure external stage (pre-hook: consent done) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/azure/storage_integration` | ⚠ | object | Create Azure storage integration (post-hook: user consent in Azure) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/connect/connectors` |  | object | List available connector types and capabilities | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/connect/connectors/{connector_id}` |  | object | Connector detail (catalog entry + best-effort last-sync) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/connect/connectors/{connector_id}/sync` | ⚠ | object | Trigger a connector sync (EXECUTE TASK) — 409 if no target | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/connectors/{connector_id}/test` | ⚠ | object | Validate connector connectivity config (no fake success) | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/connect/connectors/health` |  | object | Health status of all connected sources | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/connect/databricks/catalogs` | ⚠ | object | List Databricks catalogs | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/databricks/ingest` | ⚠ | object | Ingest Databricks tables into Snowflake | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/databricks/schemas` | ⚠ | object | List schemas in a catalog | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/databricks/tables` | ⚠ | object | List tables in a schema | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/databricks/test` | ⚠ | object | Test Databricks connection | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/gcs/notification_integration` | ⚠ | object | Create GCS notification integration | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/gcs/stage` | ⚠ | object | Create GCS external stage | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/gcs/storage_integration` | ⚠ | object | Create GCS storage integration | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/iceberg/ingest` | ⚠ | object | Ingest Iceberg tables into Snowflake | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/iceberg/namespaces` | ⚠ | object | List Iceberg namespaces | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/iceberg/tables` | ⚠ | object | List tables in a namespace | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/iceberg/test` | ⚠ | object | Test Iceberg REST catalog connection | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/connect/integration` |  | object | List or describe storage integrations (DESC INTEGRATION) | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| PATCH | `/connect/integration/{integration_name}` | ⚠ | object | Edit storage integration (ALTER STORAGE INTEGRATION) | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/mysql/ingest` | ⚠ | object | Ingest MySQL into Snowflake (standardized API) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/oracle/ingest` | ⚠ | object | Ingest Oracle data into Snowflake | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/oracle/sample-stage` | ⚠ | object | Load Oracle sample CSVs into Snowflake stage | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/oracle/test` | ⚠ | object | Test Oracle connection | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/postgres/ingest` | ⚠ | object | Ingest PostgreSQL into Snowflake (standardized API) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/connect/snowflake_lake/databases` |  | object | Step 2: Choose database | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/connect/snowflake_lake/datalake/connect` | ⚠ | object | Connect Snowflake datalake | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/connect/snowflake_lake/schemas/{database_name}` |  | object | Step 3: Choose schema | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/connect/snowflake_lake/tables/{database_name}/{schema_name}` |  | object | Step 4: Choose table | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/connect/source-catalog` |  | object | Enterprise source catalog with lineage, freshness, and domain tags | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/connect/stages` |  | object | List all stages | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/connect/stages/{stage_name}/files` |  | object | List files in a stage | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| DELETE | `/connect/stages/{stage_name}/files/{file_path}` | ⚠ | object | Delete file (Datalake Browser) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/connect/stages/{stage_name}/files/{file_path}/download` |  | object | Download file (Datalake Browser) | RETAIL_DATA_ENGINEER |  | wired | not-probed |
| GET | `/connect/stages/{stage_name}/files/{file_path}/preview` |  | object | Preview file content (Datalake Browser) | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/connect/stages/{stage_name}/grants` |  | object | List grants on a stage (governance) | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/connect/stages/{stage_name}/upload` | ⚠ | object | Upload files (Datalake Browser) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/stages/internal` | ⚠ | object | Create internal stage (raw zone upload) | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/connect/tasks/{task_name}/resume` | ⚠ | object | Resume a suspended task | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/connect/tasks/{task_name}/suspend` | ⚠ | object | Suspend a running task | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |

## Data Products — 8 ops, 8 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/data-products` | ⚠ | object | Register a data product | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-products` |  | object | List all data products | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/data-products/{product_id}` |  | object | Get data product detail | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/data-products/{product_id}/consumers` |  | object | Data product consumers (subscriber accounts + recent readers) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/data-products/{product_id}/lineage` |  | object | Data product lineage (OBJECT_DEPENDENCIES around TABLE_FQN) | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/data-products/{product_id}/publish` | ⚠ | object | Publish a data product as a Snowflake SHARE (CREATE SHARE + GRANT … TO SHARE) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/data-products/{product_id}/refresh` | ⚠ | object | Refresh a stale data product's backing object (ALTER DYNAMIC TABLE … REFRESH) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/data-products/{product_id}/subscribe` | ⚠ | object | Subscribe to a data product (real ALTER SHARE … ADD ACCOUNTS grant) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |

## Data Quality — 32 ops, 31 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/data-quality/anomalies` |  | object | Snowflake ML anomaly-detector results (if any) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/anomaly-detection` | ⚠ | object | Create/run a Snowflake ML anomaly detector | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/data-quality/auto-profile` | ⚠ | object | Auto-profile a table (refresh column stats) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-quality/classification-coverage` |  | object | Tag classification coverage | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/completeness-metrics` |  | object | Column completeness from DMF NULL_COUNT | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/cost-metrics` |  | object | Storage and cost per table | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/dmf-results` |  | object | DMF execution results dashboard | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/dmf/associate` | ⚠ | object | Associate a DMF with table column(s) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-quality/dmf/breaches` |  | object | DMF measurements vs thresholds -> breaches | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/dmf/catalog` |  | object | Per-account DMF inventory (tables × metrics × breaches) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/dmf/custom` | ⚠ | object | Create a custom Data Metric Function | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/data-quality/dmf/schedule` | ⚠ | object | Set the DMF evaluation schedule on a table | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/data-quality/dmf/suggest` | ⚠ | object | Suggest DMFs for a table (POST) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/data-quality/dmf/thresholds` | ⚠ | object | Persist a per-(table, metric) threshold | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-quality/dmf/thresholds` |  | object | Read back active thresholds | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/freshness-metrics` |  | object | Table freshness / staleness | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/ingestion-metrics` |  | object | COPY_HISTORY ingestion tracking | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/projects/{project_id}/dmf-check` | ⚠ | object | Run built-in DMF check | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-quality/projects/{project_id}/dmf-results` |  | object | Get DMF results for table | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/projects/{project_id}/dmf-suggest` |  | object | Suggest DMFs for table | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/quality-summary` |  | object | Aggregated quality KPI summary | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/run-check` | ⚠ | StandardResponse | Run quality check | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/data-quality/run-history` |  | StandardResponse | Past quality-check runs | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/schema-quality` |  | object | Schema quality gaps | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/security-posture` |  | object | Security and compliance posture | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/snapshot` |  | object | One-shot fan-out of all quality dimensions | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/tables/{database}/{schema}/{table}/optimize` | ⚠ | object | Optimize a table (RECLUSTER if clustered, else no-op + suggestion) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-quality/trend-analysis` |  | object | Quality metric trends over time | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/data-quality/trust-center/enable` | ⚠ | object | Opt a table into Trust-Center DQ tracking | RETAIL_GOVERNOR | P1 | **MISSING** | mutation (not probed) |
| GET | `/data-quality/trust-center/recommendations` |  | object | DQ-relevant Trust Center recommendations | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/trust-center/report` |  | object | Trust-Center findings for opted-in tables | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/data-quality/uniqueness-metrics` |  | object | Column uniqueness / duplicate detection | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |

## Explore & Design — 217 ops, 120 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/deployments/track` | ⚠ | object | Starts a deployment-lifecycle record in the tracking spine, capturing project, kind, and initial step. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/deployments/track` |  | object | Active = PENDING / RUNNING / PENDING_APPROVAL (owner-or-approver scoped). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/deployments/track/{deployment_id}` |  | object | Get current state of a deployment. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/deployments/track/{deployment_id}/approve` | ⚠ | object | Approves a pending tracked deployment, unblocking execution. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/deployments/track/{deployment_id}/complete` | ⚠ | object | Finalizes a tracked deployment with a terminal status (SUCCEEDED, FAILED, or CANCELLED). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/deployments/track/{deployment_id}/execute` | ⚠ | object | Executes an approved tracked deployment (runs its steps). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/deployments/track/{deployment_id}/reject` | ⚠ | object | Rejects a pending tracked deployment. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/deployments/track/{deployment_id}/rollback` | ⚠ | object | Rolls a tracked deployment's project back to a prior version. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| PATCH | `/deployments/track/{deployment_id}/step` | ⚠ | object | Advances a tracked deployment to its next step or records a per-step error. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design` | ⚠ | object | Creates a new Explore & Design modeling project (a schema-design workspace over a chosen source database). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}` |  | object | Get project detail. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/{project_id}/ai/check-naming` | ⚠ | object | Check naming conventions using pure Python rules (zero Cortex cost). | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/classify-columns` | ⚠ | object | Classify columns using Cortex AI into semantic categories (PII, metric, dimension, etc.). | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/clustering-keys` | ⚠ | object | Suggest optimal clustering keys based on query patterns and data distribution. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/deploy-schedule` | ⚠ | object | Find optimal deployment window based on warehouse usage patterns. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/deployment-risk` | ⚠ | object | Score deployment risk based on pending DDL actions for the project. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/discover-relationships` | ⚠ | object | Discover potential FK relationships using column name similarity and Cortex embeddings. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/feedback` | ⚠ | object | Record user feedback on AI suggestions for continuous learning. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/ai/feedback/stats` |  | object | Get acceptance/rejection statistics for AI suggestions. | RETAIL_AI_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/ai/history` | ⚠ | object | Append an AI Change Analyst event (detection/suggestion/interview/outcome). | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/ai/history` |  | object | AI Change Analyst event feed (reverse-chronological). | RETAIL_AI_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/ai/ingestion-mode` | ⚠ | object | Recommend optimal ingestion mode based on table characteristics. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/materialization` | ⚠ | object | Recommend whether to use table, view, materialized view, or dynamic table. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/optimize-types` | ⚠ | object | Suggest optimized data types based on actual data patterns (zero Cortex cost). | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/recommend-scd` | ⚠ | object | Recommend SCD type (1, 2, or 3) based on table structure and business context. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/ai/savings` |  | object | Get AI-driven cost savings dashboard. | RETAIL_AI_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/ai/schema-health` | ⚠ | object | Calculate a schema health score based on completeness, naming, and type efficiency. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/suggest-columns` | ⚠ | object | Suggest columns for a new table based on its purpose using Cortex AI. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ai/warehouse-sizing` | ⚠ | object | Analyze warehouse query history and recommend optimal sizing. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/cascade/drop` | ⚠ | object | Invalidate all pending DDL events that depend on the dropped table. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/cascade/rename` | ⚠ | object | Auto-update all pending DDL events that reference the old table name. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/conflict-check` | ⚠ | object | Check for duplicate events, circular dependencies, and contradictory DDL operations. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ddl-actions` | ⚠ | object | Stages one or more DDL change actions (create/alter/drop table or column) as pending edits on the project canvas. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}/ddl-actions` |  | object | Get DDL actions. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| DELETE | `/explore-design/{project_id}/ddl-actions/{event_id}` | ⚠ | object | Removes a single staged (not-yet-deployed) DDL action from the project. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ddl-actions/dry-run` | ⚠ | object | Runs the staged DDL actions on a zero-copy clone to preview results without touching production. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ddl-actions/execute` | ⚠ | object | Applies the project's staged DDL actions to the target schema, committing the modeled changes. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/{project_id}/ddl-actions/pre-check` | ⚠ | object | Runs pre-deployment validations (permissions, dependencies, drift) over the staged DDL actions. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/deploy` | ⚠ | object | Request + execute an IMMEDIATE deployment of a version. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}/deployment-readiness` |  | object | Consolidated pre-approval view composed from existing services:. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/deployments` | ⚠ | object | Requests a deployment of the project's current version, opening it for approval. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}/deployments` |  | object | List deployment history for an explore-design project. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/approve` | ⚠ | object | DEPRECATED - approve via POST /projects/{id}/deployments/{deployment_id}/approve instead. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}/deployments/{deployment_id}/approvers` |  | object | List named approvers for a deployment + approval-policy summary. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/approvers` | ⚠ | object | Add a named reviewer/approver to a deployment. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/approvers/{username}/decision` | ⚠ | object | Record an approver's decision (approve / reject / request-changes). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/cancel` | ⚠ | object | Cancel a pending or scheduled explore-design deployment. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/execute` | ⚠ | object | Execute an approved explore-design deployment (runs DDL actions). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/reject` | ⚠ | object | Reject a pending explore-design deployment with optional reason. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/explore-design/{project_id}/deployments/{deployment_id}/verify` | ⚠ | object | Re-runs post-deploy verification (tables, columns, row counts) for an Explore & Design deployment. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/dry-run` | ⚠ | object | Execute all pending DDL on a zero-copy cloned schema, return results + sample rows, then drop clone. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/events` |  | object | List project events. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/{project_id}/events/conflicts` |  | object | Detect event conflicts. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/full-dry-run` | ⚠ | object | Combined dry-run: DDL deployment + ingestion on cloned schema. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/impact-analysis` | ⚠ | object | Compute downstream dependencies (views, streams, tasks, dynamic tables) of a table/column. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/impact-analysis/enhanced` | ⚠ | object | Impact analysis with risk score, recommendations, and access pattern check. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/dry-run` | ⚠ | object | Preview N rows with INSERT/UPDATE/DELETE action labels before committing. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/execute` | ⚠ | object | Runs the project's data-ingestion pipeline immediately, loading source rows into the modeled target tables. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/operations` | ⚠ | object | Registers an ingestion operation that can be reviewed, approved, and executed through the deployment workflow. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/ingestion/operations` |  | object | List ingestion operations. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/ingestion/operations/{operation_id}/execute` | ⚠ | object | Execute a pending/approved ingestion operation with rollback tracking. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/operations/{operation_id}/rollback` | ⚠ | object | Rollback a completed ingestion using Time Travel or stored rollback SQL. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/preview-sql` | ⚠ | object | Returns the generated ingestion SQL for the project without executing it (legacy preview endpoint). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/quality-check` | ⚠ | object | Runs configured data-quality gates against the ingestion source before loading. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/ingestion/runs` |  | object | List past ingestion runs with rows affected, duration, and status. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/ingestion/schedule` | ⚠ | object | Schedules recurring ingestion as a Snowflake task that invokes the project's ingestion stored procedure. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/{project_id}/ingestion/sql-preview` | ⚠ | object | Generate the full MERGE/INSERT/COPY SQL without executing it. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/ingestion/watermark` |  | object | Get the ingestion watermark for a source table. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/ingestion/watermark/reset` | ⚠ | object | Resets the incremental-ingestion watermark for a source table so the next run reloads from the chosen point. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/post-verify` | ⚠ | object | Compares expected vs actual schema after a deployment, checking tables, columns, and row counts. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/pre-deploy-checks` | ⚠ | object | Run automated checks (warehouse, FK types, cycles, naming, drift) before deployment. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/quality-gates/run` | ⚠ | object | Run configurable quality checks (null rate, uniqueness, format, etc.) against source data. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/release-state` |  | object | Returns the project's release state: the Deploy-button state plus the 7-axis readiness signals in one aggregate call. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/{project_id}/schedule` | ⚠ | object | Register a SCHEDULED deployment and wire a Snowflake task on the supplied CRON expression. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}/schedules` |  | object | List scheduled deployments for a project. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/{project_id}/sql-diff` | ⚠ | object | Generate before/after column diff for pending DDL events. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/state` |  | object | Get wizard state. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| PUT | `/explore-design/{project_id}/state` | ⚠ | object | Saves the Explore & Design wizard's in-progress state (selected tables, columns, and mapping) for the project. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/{project_id}/tables/{database}/{schema}/{table}/ai/column-classification` |  | object | Returns the AI-inferred semantic classification for a table's columns (read-only GET variant of the classify-columns action). | RETAIL_AI_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/{project_id}/tables/{database}/{schema}/{table}/columns/{column}/preview` |  | object | Preview column data. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/{project_id}/tables/{database}/{schema}/{table}/columns/{column}/profile` |  | object | Profile column. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/{project_id}/tables/{database}/{schema}/{table}/preview` |  | object | Preview table data. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/{project_id}/tables/{database}/{schema}/{table}/profile` |  | object | Profile table. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/{project_id}/validate-events` | ⚠ | object | Check if all event dependencies are satisfied before deployment. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/validate/fk-types` | ⚠ | object | Checks that foreign-key columns and their referenced primary keys have compatible data types. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/{project_id}/validate/impact-analysis` | ⚠ | object | Analyzes downstream objects impacted by the project's pending changes (validation-step variant). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/{project_id}/validate/type-compatibility` |  | object | Check type compatibility. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/{project_id}/versions` |  | object | List project versions. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/{project_id}/watermarks` |  | array<object> | List all ingestion watermarks (high-water marks) for a project. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/{project_id}/watermarks/{source_table}` |  | object | Get the current watermark for a specific source table (format: DB.SCHEMA.TABLE). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/add-event` | ⚠ | object | Adds a design event (a modeled transformation step) to a project. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/alerts` | ⚠ | object | Creates a Snowflake alert that runs a condition query on a schedule and fires an action when it matches. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/alerts` |  | object | List alerts. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| PATCH | `/explore-design/alerts/{name}` | ⚠ | object | Alters a Snowflake alert's schedule, condition, or action. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/alerts/{name}` |  | object | Describe alert. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| DELETE | `/explore-design/alerts/{name}` | ⚠ | object | Drops a Snowflake alert. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/column/exclude` | ⚠ | object | Includes or excludes a column from the modeled output. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/column/mark-sensitive` | ⚠ | object | Flags a column as sensitive so downstream masking/governance can act on it. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/column/preview` | ⚠ | object | Returns sample values from a referenced column. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/column/profile` | ⚠ | object | Computes a data profile (nulls, distinct count, min/max, histogram) for a referenced column. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/compliance/validate` | ⚠ | object | Validates a project's schema against configured compliance rules (naming, PII tagging, required fields). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/dynamic-tables` | ⚠ | object | Creates a Snowflake dynamic table (declarative auto-refreshing materialized query) from the supplied definition. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/dynamic-tables` |  | object | List dynamic tables. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| PATCH | `/explore-design/dynamic-tables/{name}` | ⚠ | object | Alters a dynamic table's settings (target lag, warehouse, or query). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/dynamic-tables/{name}` |  | object | Describe dynamic table. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| DELETE | `/explore-design/dynamic-tables/{name}` | ⚠ | object | Drops a Snowflake dynamic table. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/dynamic-tables/{name}/refresh` | ⚠ | object | Triggers an immediate manual refresh of a dynamic table. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/dynamic-tables/{name}/resume` | ⚠ | object | Resumes a suspended dynamic table's automatic refresh. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/dynamic-tables/{name}/suspend` | ⚠ | object | Suspends a dynamic table's automatic refresh. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/event-tables` | ⚠ | object | Creates a Snowflake event table for capturing logs, traces, and telemetry. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/event-tables` |  | object | List event tables. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| DELETE | `/explore-design/event-tables/{name}` | ⚠ | object | Drops a Snowflake event table. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/events/{event_id}/conditions` | ⚠ | object | Attaches filter/branch conditions to a design event. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/events/{event_id}/conditions/evaluate` | ⚠ | object | Evaluates a design event's conditions against sample data to preview which rows match. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/export/{project_id}` |  | object | Export project configuration. | RETAIL_DATA_ENGINEER |  | wired | not-probed |
| POST | `/explore-design/fetch_relationships` | ⚠ | object | Fetch foreign-key relationships for a schema. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/glossary` |  | object | Return admin-curated business glossary terms (Snowflake-backed). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/glossary` | ⚠ | object | Creates or updates a business-glossary term definition (admin-curated). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/explore-design/glossary/{term}` | ⚠ | object | Deletes a business-glossary term. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/glossary/ai-draft` | ⚠ | object | AI-draft a definition for admin review (admin). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/glossary/lookup` |  | object | Looks up a business-glossary term so the AI advisor can reuse an approved definition instead of re-asking the LLM. | BUSINESS_USER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/guided/add-columns` | ⚠ | object | Adds one or more columns to the wizard's target-table draft. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/add-event` | ⚠ | object | Adds an event (mapping group / step) to the guided wizard flow. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/create_project` | ⚠ | object | Creates and initializes a new guided-wizard Explore & Design project. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/guided/databases` |  | object | Lists the databases the Snowflake user can access, for the wizard's database-selection step. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/guided/get-steps-event` | ⚠ | object | Returns the wizard's steps and events for the current project (POST form with filters). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/guided/get-steps-event` |  | object | Read wizard steps/events (GET form). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/guided/log_wizard_event` | ⚠ | object | Records a wizard telemetry event (step entered, action taken) for product analytics. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/manage_table` | ⚠ | object | Create / alter wizard target table. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/guided/manage_table` |  | object | Create / alter wizard target table (GET form). | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/guided/primary-key` | ⚠ | object | Sets the primary-key column(s) on the wizard's target table. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/remove-columns` | ⚠ | object | Drops one or more columns from the wizard's target-table draft. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/schedule_deployment` | ⚠ | object | Records a scheduled-deployment event (status PENDING_APPROVAL) for the wizard project without executing it, queuing it for modeler approval. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/store-selected-columns` | ⚠ | object | Persists the source columns the user selected in the wizard step. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/test_mapping` | ⚠ | object | Run a LIMIT preview SELECT against each mapping's source table applying the source→target column mapping. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/guided/update_column_length` | ⚠ | object | Resizes a wizard target column's type length/precision (e.g. VARCHAR or NUMBER size). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/hybrid-tables` | ⚠ | object | Creates a Snowflake hybrid table (Unistore, row-optimized for OLTP-style point access). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/hybrid-tables` |  | object | List hybrid tables. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| DELETE | `/explore-design/hybrid-tables/{name}` | ⚠ | object | Drops a Snowflake hybrid table. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/impact-analysis` | ⚠ | object | Runs a global multi-change impact analysis across several pending edits at once. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/import` | ⚠ | object | Imports a previously exported project configuration (schema design) from an uploaded file. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/ingestion/adapt` | ⚠ | object | Adapt ingestion to a new schema version. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/ingestion/create-versioned` | ⚠ | object | Creates version-pinned ingestion objects (stream/task/pipe) bound to a specific schema version. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/ingestion/pause` | ⚠ | object | Pause ingestion objects for a table. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/ingestion/resume` | ⚠ | object | Resume ingestion objects for a table. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/lineage/column` |  | object | Column-level lineage. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/primary-key/add` | ⚠ | object | Adds a primary-key constraint to a modeled table. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/projects/{project_id}/erd` |  | object | Get ERD layout. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| PUT | `/explore-design/projects/{project_id}/erd` | ⚠ | object | Saves the ERD canvas layout (node positions and relationships) for a project. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/projects/{project_id}/erd/auto-layout` | ⚠ | object | Auto-arranges the ERD canvas nodes using the layout engine. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/projects/{project_id}/relationships` | ⚠ | object | Creates a relationship (foreign-key edge) between two tables on the ERD. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| DELETE | `/explore-design/projects/{project_id}/relationships/{relationship_id}` | ⚠ | object | Deletes an ERD relationship edge. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/recent-deployment-errors` |  | object | Get recent failed deployments across all explore-design projects. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/scheduled-deployments/{schedule_id}` |  | object | Scheduled deployment detail. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/scheduled-deployments/{schedule_id}/approve` | ⚠ | object | Approves a scheduled Explore & Design deployment so it may run at its scheduled time. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/explore-design/scheduled-deployments/{schedule_id}/cancel` | ⚠ | object | Cancels a scheduled Explore & Design deployment. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/scheduled-deployments/{schedule_id}/execute-now` | ⚠ | object | Runs a scheduled Explore & Design deployment immediately instead of waiting for its slot. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/scheduled-deployments/{schedule_id}/logs` |  | object | Scheduled deployment logs. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/scheduled-deployments/{schedule_id}/reject` | ⚠ | object | Rejects a scheduled Explore & Design deployment, blocking it from running. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/explore-design/scheduled-deployments/{schedule_id}/reschedule` | ⚠ | object | Changes the scheduled run time of a pending deployment. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/schema-clone` | ⚠ | object | Creates a schema-clone configuration (zero-copy clone of a source schema for safe testing). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/schema-clone/{clone_id}/execute` | ⚠ | object | Executes a configured schema-clone job, creating the zero-copy cloned schema. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/schema-clone/{clone_id}/rollback` | ⚠ | object | Rolls back a schema-clone job by dropping its cloned objects. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/schema-clone/{clone_id}/status` |  | object | Schema-clone status. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/schema-clone/list` |  | object | List schema-clone jobs. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/schema-clone/preview` | ⚠ | object | Previews the DDL a schema-clone job would run, without creating anything. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/smart/detect-fk` |  | object | Match column names across tables to infer foreign key relationships. | RETAIL_AI_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/smart/detect-pk` |  | object | Analyze column statistics and naming patterns to recommend primary key columns. | RETAIL_AI_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/smart/embed` | ⚠ | object | Generate a 768-dimensional embedding vector for the given text using Cortex AI. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/smart/semantic-search` | ⚠ | object | Use vector similarity to search text data in a table. | RETAIL_AI_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/streams` | ⚠ | object | Creates a Snowflake stream that captures change-data-capture (CDC) offsets on a table or view. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/streams` |  | object | List streams. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/streams/{name}` |  | object | Describe stream. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| DELETE | `/explore-design/streams/{name}` | ⚠ | object | Drops a Snowflake stream. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/streams/{name}/data` |  | object | Consume stream data. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/explore-design/table/preview` | ⚠ | object | Returns a sample of rows from a referenced table (RLS-filtered to the caller). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/explore-design/table/profile` | ⚠ | object | Computes column statistics and a data profile for a referenced table. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/explore-design/tasks` |  | object | List tasks. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/explore-design/tasks/{name}` |  | object | Describe task. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| PATCH | `/explore-design/tasks/{name}` | ⚠ | object | Alters a Snowflake task, typically to resume or suspend its schedule. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/explore-design/tasks/{name}` | ⚠ | object | Drops a Snowflake task. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/tasks/{name}/resume` | ⚠ | object | Resumes a suspended Snowflake task. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/explore-design/tasks/{name}/suspend` | ⚠ | object | Suspends a Snowflake task's schedule. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/explore-design/versions/{from_version_id}/compare/{to_version_id}` |  | object | Compare two versions. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/explore-design/versions/{from_version_id}/migration/{to_version_id}` |  | object | Version migration script. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/explore-design/versions/{version_id}/promote` | ⚠ | object | Promotes a project version to a target stage/environment (e.g. draft to production). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects` |  | object | Dispatch by scope so the hot (default) account-wide list is account-shared while the per-caller list stays per-user:. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/projects` | ⚠ | object | Creates a project of any module type via the unified create endpoint (project type is a discriminator in the body). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/{project_id}` |  | object | Single project detail (any type). | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| PUT | `/projects/{project_id}` | ⚠ | object | Updates a project's editable fields (name, description, tags, settings). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/projects/{project_id}` | ⚠ | object | Soft-delete a project (status -> deleted). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/{project_id}/comments` |  | object | Flat, chronologically-ordered comment list (soft-deleted excluded). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/projects/{project_id}/comments` | ⚠ | object | Post a comment (or a reply via parent_comment_id). @mentions are parsed from the body into the MENTIONS column. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/projects/{project_id}/comments/{comment_id}` | ⚠ | object | Soft-deletes a comment from a project's discussion thread. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/projects/{project_id}/contributors` | ⚠ | object | Adds a contributor (owner/editor/viewer) to a project's access list. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/{project_id}/contributors` |  | array<object> | List contributors. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| GET | `/projects/{project_id}/deployments` |  | object | List deployment history (all project types). | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/projects/{project_id}/deployments` | ⚠ | object | Request a deployment for a project version. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/{project_id}/deployments/{deployment_id}` |  | object | Returns full detail for one deployment: the deployment row, its version, approver votes, runs, and per-step results for every wizard step. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/projects/{project_id}/deployments/{deployment_id}/approve` | ⚠ | object | Approve a pending deployment (steward/DPO action). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/projects/{project_id}/deployments/{deployment_id}/execute` | ⚠ | object | Execute an approved deployment (runs DDL actions, marks as deployed or failed). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/projects/{project_id}/deployments/{deployment_id}/reject` | ⚠ | object | Reject a pending deployment with optional reason. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| PUT | `/projects/{project_id}/deployments/{deployment_id}/steps/{step}` | ⚠ | object | Persists the result of one deployment-wizard step (pre-check, dry-run, verify) so the wizard can resume where it left off. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/projects/{project_id}/events` | ⚠ | object | Add an event to a project's activity log. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/{project_id}/events` |  | object | Get events for a project from unified PROJECT_EVENTS table. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| PATCH | `/projects/{project_id}/events/bulk-update` | ⚠ | object | Bulk-update events by IDs or by filter (status/event_type). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/projects/{project_id}/lock` | ⚠ | object | Acquire the editing lock for the signed-in user. 403 if another user holds it. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| POST | `/projects/{project_id}/rls` | ⚠ | object | Creates a row-access (RLS) policy and binds it to a project table so rows are filtered per role/user. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/projects/{project_id}/rls` |  | object | List a project's row-access bindings. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| DELETE | `/projects/{project_id}/rls/{binding_id}` | ⚠ | object | Removes a row-access policy binding from a project table. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/projects/{project_id}/rollback` | ⚠ | object | Rolls a project back to a prior saved version (metadata repoint), marking newer versions superseded. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/{project_id}/runs` |  | object | Unified run list for any project type. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/projects/{project_id}/unlock` | ⚠ | object | Release the editing lock previously held by the signed-in user. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/projects/last-used` |  | object | Get last-used projects per module. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/projects/last-used` | ⚠ | object | Store which project user last worked on, per module. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/projects/seed-samples` | ⚠ | object | Seeds sample Explore & Design and Workflow projects (with owner/editor/viewer contributors, versions, deployments, and runs) so every module shows realistic data; safe to re-run and restricted to super-admins. | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/projects/unified` |  | object | Returns projects grouped by type with last activity, contributors, and cross-module last-used information. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |

## Governance — 155 ops, 78 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/access-requests` | ⚠ | object | Request access to a data asset (routes to its owner) | BUSINESS_USER | P1 | **MISSING** | mutation (not probed) |
| POST | `/access-requests/{request_id}/approve` | ⚠ | object | Owner approves → executes a real Snowflake GRANT | RETAIL_GOVERNOR | P1 | **MISSING** | mutation (not probed) |
| POST | `/access-requests/{request_id}/deny` | ⚠ | object | Owner denies the request | RETAIL_GOVERNOR | P1 | **MISSING** | mutation (not probed) |
| GET | `/access-requests/all` |  | object | Full access-request audit (account-admin) | any | P2 | **MISSING** | served (gated) |
| GET | `/access-requests/inbox` |  | object | Requests awaiting my approval (I am the asset owner) | any | P2 | **MISSING** | served (gated) |
| GET | `/access-requests/mine` |  | object | My access requests + their status | any | P2 | **MISSING** | served (gated) |
| GET | `/gouvernance/access-review/summary` |  | object | Read-only access-review digest aggregated from existing governance reads. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/access-roles/from-objects` | ⚠ | object | Mints an access (technical) role that carries a chosen set of object grants. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/add-role` | ⚠ | object | Creates a Snowflake role (CREATE ROLE). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| POST | `/gouvernance/add-user` | ⚠ | object | Creates a Snowflake user (CREATE USER), optionally granting a role in the same call. | ACCOUNTADMIN |  | wired | mutation (not probed) |
| POST | `/gouvernance/assign-role` | ⚠ | object | Grants a role to a user (GRANT ROLE ... TO USER). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| GET | `/gouvernance/client/dashboard` |  | object | Return dashboard KPIs for the connected Snowflake account. | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/compliance/score` |  | object | Returns an account-level governance compliance score (0-100) with a per-dimension breakdown across masking, row-access, and tagging. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/d360-roles` |  | object | List all Data360 roles with their metadata and permission counts. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/d360-roles` | ⚠ | object | Creates a custom Data360 role (an application-RBAC role with a page/action permission set). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| PUT | `/gouvernance/d360-roles/{role_name}` | ⚠ | object | Update display name or description of a custom D360 role. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/gouvernance/d360-roles/{role_name}` | ⚠ | object | Delete a custom D360 role and all its permissions. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/d360-roles/{role_name}/apply-template` | ⚠ | object | Copies a system role template's action set onto a custom Data360 role. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/d360-roles/{role_name}/permissions` |  | object | Return a role's module→page→tab→action allow/deny matrix. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| PUT | `/gouvernance/d360-roles/{role_name}/permissions` | ⚠ | object | Replace a custom role's permission rows with the supplied set (upsert). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/d360-roles/action-registry` |  | object | Return the complete grantable-action catalog from the RBAC ACTION_REGISTRY. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/d360-roles/effective/{username}` |  | object | Computes the effective Data360 action set for an arbitrary user (admin view). | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/d360-roles/my-module-access` |  | object | Coarse module→level map for the CALLING user. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/d360-roles/my-permissions` |  | object | Resolve the CALLING user's effective Data360 action set. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/d360-roles/templates` |  | object | Return the 7 standard Data360 role templates with their permission summaries. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/dashboard/activity` |  | object | Return USER_ACTIVITY events for account-level dashboard and audit. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/dashboard/errors` |  | object | Return recent ERROR events from USER_ACTIVITY for audit and AI recommendations. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/disable_user/` | ⚠ | object | Disables (locks) a Snowflake user account by username. | ACCOUNTADMIN |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/drop-role` | ⚠ | object | Drops a Snowflake role (DROP ROLE). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| POST | `/gouvernance/drop-roles-batch` | ⚠ | object | Drops multiple Snowflake roles in one call. | ACCOUNTADMIN |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/drop-user` | ⚠ | object | Drops a Snowflake user (DROP USER). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| POST | `/gouvernance/drop-users-batch` | ⚠ | object | Drops multiple Snowflake users in one call. | ACCOUNTADMIN |  | wired | mutation (not probed) |
| POST | `/gouvernance/enable_user/` | ⚠ | object | Enables (unlocks) a Snowflake user account. | ACCOUNTADMIN |  | wired | mutation (not probed) |
| GET | `/gouvernance/enterprise-users` |  | object | Get enterprise users from the directory table with pagination. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| PUT | `/gouvernance/enterprise-users/{username}` | ⚠ | object | Update fields for an enterprise user (inline edit save). | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/gouvernance/enterprise-users/{username}` | ⚠ | object | Remove a user from the enterprise directory (does NOT drop the Snowflake user). | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/enterprise-users/sync` | ⚠ | object | Sync users from Snowflake SHOW USERS into the ENTERPRISE_USERS directory. | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/get_dwh_health_info` |  | object | Get DWH health info. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/get_dwh_schemas` |  | object | List all DWH schemas (schemas starting with 'DWH'). | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/get_dwh_storage_info` |  | object | Get total and per-table storage (in MB) for the given Snowflake DWH. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/grant-permission` | ⚠ | object | Grants a privilege on an object to a role (GRANT ... ON ...). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| GET | `/gouvernance/grants` |  | array<RoleModulesOut> | Get all roles with their assigned modules (permissions). | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/grants-for-role/{role_name}` |  | object | Get grants for a role. | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/grants-matrix` |  | object | Returns SHOW GRANTS for every visible role in one batched request. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/gui-permissions` |  | object | List all GUI permission rules. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/gui-permissions` | ⚠ | object | Create or update a GUI permission rule (upsert by role_name + page_path). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/gouvernance/gui-permissions/{permission_id}` | ⚠ | object | Delete a GUI permission rule by ID. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/gui-permissions/effective/{username}` |  | object | Get the effective page-access map for an ARBITRARY user's roles. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/gui-permissions/my-access` |  | object | Get the page access map for the currently logged-in user's roles. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/info` |  | object | Retrieve metadata about all active Snowflake integrations and connectors. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/oauth/api-keys` |  | object | List service accounts that have RSA public keys assigned (key pair auth). | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/oauth/assign-rsa-key` | ⚠ | object | Assign RSA public key to a user for key pair authentication (PAT equivalent). | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/oauth/integrations` |  | object | List all security integrations (OAuth, SAML, SCIM). | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/oauth/integrations` | ⚠ | object | Create a Snowflake security integration for external OAuth (Azure Entra ID, Okta, custom). | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/oauth/network-policies` |  | object | List all network policies with IP allowlists. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| DELETE | `/gouvernance/oauth/revoke-rsa-key/{username}` | ⚠ | object | Remove RSA public key from a user, disabling key pair auth. | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/oauth/saml-integrations` | ⚠ | object | Create a SAML2 security integration for SSO (Azure Entra ID, Okta, ADFS). | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/oauth/service-users` | ⚠ | object | Create a Snowflake service user (TYPE=SERVICE) for programmatic access via key pair auth. | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/policies` |  | StandardResponse | Unified governance-policy inventory: masking, row-access (RLS) and aggregation policies in one call. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/policies/{policy_type}` |  | object | List all policies of a specific type. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| DELETE | `/gouvernance/policies/{policy_type}/{policy_name}` | ⚠ | object | Deletes a governance policy of the given type. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| PUT | `/gouvernance/policies/{policy_type}/{policy_name}/metadata` | ⚠ | StandardResponse | Persist policy expiration/comment metadata, and push a SQL COMMENT when supported. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/policies/{policy_type}/{policy_name}/references` |  | StandardResponse | Pre-delete dependency check via INFORMATION_SCHEMA.POLICY_REFERENCES. | RETAIL_GOVERNOR |  | wired | served (gated) |
| PUT | `/gouvernance/policies/{policy_type}/{policy_name}/roles` | ⚠ | StandardResponse | Grants or revokes the APPLY privilege on a policy for the given roles. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/{policy_type}/{policy_name}/unapply-all` | ⚠ | StandardResponse | Detach a policy from all of its references so it can then be dropped. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/aggregation` | ⚠ | StandardResponse | Creates an aggregation policy that forces queries to return only grouped/aggregated results. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/policies/aggregation/{database}/{schema}/{table}` | ⚠ | StandardResponse | Removes the aggregation policy from a table (UNSET AGGREGATION POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/aggregation/{policy_name}/details` |  | StandardResponse | Describe aggregation policy. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/aggregation/apply` | ⚠ | StandardResponse | Applies an aggregation policy to a table (SET AGGREGATION POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/aggregation/replace` | ⚠ | StandardResponse | Swaps a table's existing aggregation policy for a different one. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/classification/apply-tags` | ⚠ | object | Applies the detected semantic-category tags to the classified columns. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/classification/classifiers` | ⚠ | object | Creates a custom classifier for detecting organization-specific data patterns. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/classification/classifiers/{name}/regex` | ⚠ | object | Adds a regex pattern to a custom classifier. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/classification/classify` | ⚠ | object | Runs Snowflake auto-classification on a table's columns to detect semantic categories and PII. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/classification/extract-categories` | ⚠ | object | Extracts the semantic categories found by a classification run. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/dmf` | ⚠ | object | Creates a data metric function (DMF) that computes a custom data-quality metric. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/gouvernance/policies/dmf/{name}` | ⚠ | object | Deletes a data metric function. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/policies/dmf/{name}/details` |  | object | Describe data metric function. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/policies/dmf/all-references` |  | object | Get all DMF references. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/policies/dmf/associate` | ⚠ | object | Attaches a data metric function to specific table columns so it runs on schedule. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/dmf/disassociate` | ⚠ | object | Detaches a data metric function from table columns. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/policies/dmf/list` |  | object | List data metric functions. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/policies/dmf/references` |  | object | Get DMF references for a table. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/policies/dmf/schedule` | ⚠ | object | Sets the execution schedule for a data metric function on a table. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/policies/health` |  | object | Runs a live, uncached governance-policy health check that exercises the real path. | RETAIL_GOVERNOR |  | wired | served (open) |
| POST | `/gouvernance/policies/masking` | ⚠ | StandardResponse | Creates a masking policy that redacts or transforms sensitive column values based on the querying role. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/masking/{policy_name}/details` |  | StandardResponse | Describe masking policy. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/masking/apply` | ⚠ | StandardResponse | Applies a masking policy to a column (SET MASKING POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/masking/batch-details` | ⚠ | StandardResponse | Return many masking policy details in one API round-trip. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/masking/preview` | ⚠ | object | Previews masked-vs-unmasked sample values for a table's masked columns (read-only). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/masking/remove` | ⚠ | StandardResponse | Removes a masking policy from a column (UNSET MASKING POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/masking/replace` | ⚠ | StandardResponse | Swaps a column's existing masking policy for a different one. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/my-scope` |  | StandardResponse | Returns the governance policies relevant to the caller's active role (available to any authenticated user, not admin-gated). | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/policies/network` | ⚠ | StandardResponse | Creates a network policy defining allowed/blocked IP ranges. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/policies/network/{policy_name}` | ⚠ | StandardResponse | Deletes a network policy. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/network/{policy_name}/details` |  | StandardResponse | Describe network policy. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/network/{policy_name}/set-default` | ⚠ | StandardResponse | Sets a network policy as the account default (ALTER ACCOUNT SET NETWORK_POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/network/list` |  | object | List account network policies. | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/policies/objects/columns/{database}/{schema}/{table}` |  | StandardResponse | List columns for policy pickers. | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/policies/objects/databases` |  | StandardResponse | List databases for policy pickers. | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/policies/objects/schemas/{database}` |  | StandardResponse | List schemas for policy pickers. | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/policies/objects/tables/{database}/{schema}` |  | StandardResponse | List tables for policy pickers. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/password` | ⚠ | StandardResponse | Creates a password policy (length, complexity, rotation rules). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/password/{policy_name}/details` |  | StandardResponse | Describe password policy. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/password/{policy_name}/set-default` | ⚠ | StandardResponse | Sets a password policy as the account default. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/password/list` |  | object | List password policies in the governance schema. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/policies/pii-scan` | ⚠ | object | Scan column names + sample data using regex patterns for PII detection, then enrich the response with:. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/row-access` | ⚠ | StandardResponse | Creates a row-access (RLS) policy that restricts which rows a role/user can see. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/row-access/{policy_name}/details` |  | StandardResponse | Describe row access policy. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/policies/row-access/apply` | ⚠ | StandardResponse | Applies a row-access policy to a table on the specified columns (ADD ROW ACCESS POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/row-access/remove` | ⚠ | StandardResponse | Removes a row-access policy from a table (DROP ROW ACCESS POLICY). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/row-access/replace` | ⚠ | StandardResponse | Swaps a table's existing row-access policy for a different one in a single operation. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/policies/row-access/simulate` | ⚠ | object | Simulates row-access (RLS) visibility for a chosen role/user, showing which rows they could see (read-only). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/policies/session` | ⚠ | StandardResponse | Creates a session policy (idle timeout and maximum session length). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/session/{policy_name}/details` |  | StandardResponse | Describe session policy. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/session/{policy_name}/set-default` | ⚠ | StandardResponse | Sets a session policy as the account default. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/session/list` |  | object | List session policies in the governance schema. | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| POST | `/gouvernance/policies/tags` | ⚠ | StandardResponse | Creates an object tag used for data classification. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/policies/tags/{tag_name}` | ⚠ | StandardResponse | Deletes an object tag. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/tags/{tag_name}/details` |  | StandardResponse | Describe tag. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/tags/apply` | ⚠ | StandardResponse | Applies a classification tag (with a value) to a database object. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/policies/tags/list` |  | StandardResponse | List tags. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/policies/tags/remove` | ⚠ | StandardResponse | Removes a classification tag from an object (UNSET TAG). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/revoke-permission` | ⚠ | object | Revokes a privilege on an object from a role (REVOKE ... ON ...). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| GET | `/gouvernance/rls-policies` |  | object | List RLS (row access) policies. | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/roles` |  | object | List all roles. | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/roles-for-user/{username}` |  | object | Get roles for a user. | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/roles/{role_name}` |  | object | Get detailed information about a specific role. | RETAIL_GOVERNOR |  | wired | served (gated) |
| PUT | `/gouvernance/roles/{role_name}` | ⚠ | object | Update role properties (comment and/or module permissions). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/roles/{role}/grant-role` | ⚠ | object | Attaches an access role to a functional role (role-to-role grant). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/gouvernance/roles/{role}/grant-role` | ⚠ | object | Detaches an access role from a functional role (role-to-role revoke). | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/roles/{role}/least-privilege` |  | object | Returns a least-privilege advisory for a role, listing privileges granted but never used (read-only). | RETAIL_GOVERNOR | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/roles/{role}/object-grants` |  | object | List the object/role grants a role carries (SHOW GRANTS TO ROLE). | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/roles/edit/{role_name}` |  | object | Get role details for editing (same as view, but signals edit intent). | RETAIL_GOVERNOR |  | wired | served (gated) |
| GET | `/gouvernance/security-axes` |  | object | Fetch security axes (regions, stores, departments, custom). | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/security-axes` | ⚠ | object | Creates values for a security axis (a classification dimension such as region or business unit). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| PUT | `/gouvernance/security-axes/{axis_id}` | ⚠ | object | Updates the values of a security axis. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/security-axes/{axis_id}` | ⚠ | object | Clears all values for a security axis. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| GET | `/gouvernance/security-matrix` |  | object | Get the security matrix - maps roles to axis-based access permissions. | RETAIL_GOVERNOR |  | wired | served (gated) |
| POST | `/gouvernance/security-matrix` | ⚠ | object | Creates a security-matrix entry mapping a role to allowed axis values (drives row-level security). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| PUT | `/gouvernance/security-matrix/{entry_id}` | ⚠ | object | Updates a security-matrix entry. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/security-matrix/{entry_id}` | ⚠ | object | Deletes a security-matrix entry. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| PUT | `/gouvernance/security-matrix/batch` | ⚠ | object | Applies a batch of security-matrix row updates in one call. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/gouvernance/security-matrix/bulk` | ⚠ | object | Bulk-assigns multiple security-matrix entries in one call. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| POST | `/gouvernance/security-matrix/init` | ⚠ | object | Initializes the security-matrix backing schema (one-time setup). | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/security-matrix/role/{role_name}` | ⚠ | object | Deletes all security-matrix entries for a role. | RETAIL_GOVERNOR |  | wired | mutation (not probed) |
| DELETE | `/gouvernance/unassign-role` | ⚠ | object | Revokes a role from a user (REVOKE ROLE ... FROM USER). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| PUT | `/gouvernance/update-grants` | ⚠ | object | Updates a role's Data360 module access grants (which modules and pages the role may use). | ACCOUNTADMIN |  | wired | mutation (not probed) |
| POST | `/gouvernance/user/mfa/set` | ⚠ | object | Enable or disable MFA for a Snowflake user: POST /gouvernance/user/mfa/set. | ACCOUNTADMIN | P0 | **MISSING** | mutation (not probed) |
| GET | `/gouvernance/user/mfa/status` |  | object | Returns a user's multi-factor-authentication enrollment status. | ACCOUNTADMIN | P1 | **MISSING** | served (gated) |
| GET | `/gouvernance/users` |  | object | List all users. | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/users-with-roles` |  | object | Get all users WITH their assigned roles. | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/users/{username}` |  | object | Get detailed information about a specific user. | ACCOUNTADMIN |  | wired | served (gated) |
| GET | `/gouvernance/users/{username}/roles` |  | object | Get all roles assigned to a specific user. | ACCOUNTADMIN |  | wired | served (gated) |
| PUT | `/gouvernance/users/{username}/roles` | ⚠ | object | Update all roles for a user (replaces existing role assignments). | ACCOUNTADMIN |  | wired | mutation (not probed) |

## Intelligent — 81 ops, 67 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/chat/conversations` |  | object | List conversations | any | P2 | **MISSING** | served (gated) |
| GET | `/chat/conversations/{conversation_id}` |  | object | Get conversation | any | P2 | **MISSING** | served (gated) |
| PATCH | `/chat/conversations/{conversation_id}` | ⚠ | object | Update conversation | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/chat/conversations/{conversation_id}/attachments` | ⚠ | object | Upload attachment | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/chat/conversations/{conversation_id}/messages` | ⚠ | object | Send message | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/chat/conversations/{conversation_id}/messages` |  | object | List messages | any | P2 | **MISSING** | served (gated) |
| GET | `/chat/conversations/{conversation_id}/participants` |  | object | Get conversation participants | any | P2 | **MISSING** | served (gated) |
| POST | `/chat/conversations/{conversation_id}/read` | ⚠ | object | Mark as read | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/chat/conversations/dm` | ⚠ | object | Create DM conversation | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/chat/conversations/group` | ⚠ | object | Create group conversation | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/chat/online-users` |  | object | List online users | any | P2 | **MISSING** | served (gated) |
| GET | `/cortex/agents` |  | object | List Cortex Search Services (agents) in the specified database. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/analyst/query` | ⚠ | StandardResponse | Answers a natural-language question: Cortex Analyst generates SQL over a semantic model, executes it, and returns sample rows. | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/code-generate` | ⚠ | StandardResponse | Generate code in the requested language using a user-chosen Cortex model. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/complete` | ⚠ | StandardResponse | Generate text completion using Snowflake Cortex LLM models. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| GET | `/cortex/conversations` |  | StandardResponse | Return the caller's stored AI exchanges (one row per prompt/response). | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/cortex/conversations/{conversation_id}` |  | StandardResponse | Read a single stored AI exchange by CHAT_HISTORY row id. | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/cortex/duckdb/datasets` |  | object | List staged Parquet/CSV files available for DuckDB-style zero-cost queries. | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/cortex/duckdb/query` | ⚠ | object | Export a table to Parquet, then query it without warehouse credits. | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/duckdb/query-stage` | ⚠ | object | Queries Parquet/CSV files directly in a stage using local DuckDB, with no warehouse compute. | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/embeddings` | ⚠ | StandardResponse | Generate text embeddings using Snowflake Cortex embedding models. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| GET | `/cortex/explore/databases` |  | StandardResponse | List all accessible databases. | BI_ANALYST |  | wired | served (gated) |
| GET | `/cortex/explore/schemas` |  | StandardResponse | List all schemas in a database. | BI_ANALYST |  | wired | served (gated) |
| POST | `/cortex/explore/tables` | ⚠ | StandardResponse | List all tables in a database/schema for data exploration. | BI_ANALYST |  | wired | mutation (not probed) |
| POST | `/cortex/icon-suggest` | ⚠ | StandardResponse | Pick a Lucide icon name from a curated whitelist based on chart context. | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/kpis` |  | StandardResponse | Return KPIs for the Intelligent Analytics (Cortex) dashboard. | BI_ANALYST |  | wired | served (gated) |
| DELETE | `/cortex/ml/classification/{model_name}` | ⚠ | object | Drops a trained Cortex ML classification model. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/ml/classification/{model_name}/metrics` |  | object | Get evaluation metrics, feature importance, and confusion matrix for a classification model. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/cortex/ml/classification/models` |  | object | List all trained classification models. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/ml/classification/predict` | ⚠ | object | Generate predictions using a trained classification model. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/classification/train` | ⚠ | object | Train a supervised ML classification model. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/document-ai/extract-to-table` | ⚠ | object | Extract data from a document using Document AI and insert results into a target table. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/document-ai/models` | ⚠ | object | Create a Document AI model build for extracting data from documents. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/ml/document-ai/models` |  | object | List Document AI model builds. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/ml/document-ai/predict` | ⚠ | object | Extract structured data from a document (PDF, image) using Document AI. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/document-ai/upload` | ⚠ | object | Upload a PDF/image file to the Document AI stage for processing. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/finetune` | ⚠ | object | Create a fine-tuning job to customize a base model with training data. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/ml/finetune/jobs` |  | object | List all fine-tuning jobs. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/cortex/ml/finetune/jobs/{job_id}` |  | object | Get details of a specific fine-tuning job. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/ml/finetune/jobs/{job_id}/cancel` | ⚠ | object | Cancels a running Cortex fine-tuning job. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/sentiment` | ⚠ | StandardResponse | Analyze sentiment of text using Snowflake Cortex. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| POST | `/cortex/ml/summarize` | ⚠ | StandardResponse | Summarizes input text using a Snowflake Cortex LLM. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| POST | `/cortex/ml/top-insights` | ⚠ | object | Create a Top Insights instance for root cause / key driver analysis. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/ml/top-insights` |  | object | List all Top Insights instances. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/ml/top-insights/{name}/analyze` | ⚠ | object | Run key driver analysis to identify what dimensions are driving metric changes. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/ml/translate` | ⚠ | StandardResponse | Translate text between languages using Snowflake Cortex. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| GET | `/cortex/models` |  | StandardResponse | Return every Cortex completion + embedding model + recommended defaults keyed by use case (code generation, cheap, multilingual, reasoning, ...). | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/cortex/query` | ⚠ | StandardResponse | Chat with your data using Cortex Analyst. | BI_ANALYST |  | wired | mutation (not probed) |
| POST | `/cortex/query-analytics/analyze` | ⚠ | object | Analyzes recent query history using Cortex COMPLETE. | BI_ANALYST | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/query-analytics/redundant-groups` |  | object | List query groups with redundant (repeated) execution patterns. | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/cortex/query-analytics/results` |  | object | Get latest Cortex query analysis results with optional filters. | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/cortex/query-analytics/summary` |  | object | Return aggregated KPIs from the latest query analytics run. | BI_ANALYST | P2 | **MISSING** | served (gated) |
| POST | `/cortex/semantic-models` | ⚠ | StandardResponse | Upload a semantic model YAML file to the centralized SEMANTIC_STAGE. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| GET | `/cortex/semantic-models/{model_name}` |  | StandardResponse | Get semantic model YAML content from the centralized SEMANTIC_STAGE. | RETAIL_AI_ENGINEER |  | wired | served (gated) |
| PUT | `/cortex/semantic-models/{model_name}` | ⚠ | StandardResponse | Update an existing semantic model YAML (overwrites on stage). | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/cortex/semantic-models/{model_name}` | ⚠ | StandardResponse | Delete a semantic model file from the centralized SEMANTIC_STAGE. | RETAIL_AI_ENGINEER |  | wired | mutation (not probed) |
| POST | `/cortex/semantic-models/generate` | ⚠ | StandardResponse | Auto-generate a Cortex Analyst semantic model YAML from the DDL of tables in a given database and schema. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/semantic-models/generate-and-save` | ⚠ | StandardResponse | Generate a semantic model YAML from DDL and immediately save it to SEMANTIC_STAGE. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/semantic-models/list` |  | StandardResponse | List all semantic model YAML files in the centralized SEMANTIC_STAGE. | RETAIL_AI_ENGINEER |  | wired | served (gated) |
| GET | `/cortex/semantic-views` |  | object | List views in the specified database that can be used as semantic views. | BI_ANALYST | P2 | **MISSING** | served (gated) |
| GET | `/cortex/snowpark/compute-pools` |  | object | List all Snowpark compute pool clusters. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/snowpark/compute-pools` | ⚠ | object | Create a compute pool for container workloads (GPU/CPU). | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| PATCH | `/cortex/snowpark/compute-pools/{name}` | ⚠ | object | Alters an SPCS compute pool's scaling settings (min/max nodes, auto-suspend, auto-resume) via ALTER COMPUTE POOL. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/cortex/snowpark/compute-pools/{name}` | ⚠ | object | Hard-drops an SPCS compute pool (DROP COMPUTE POOL), freeing its node-hours. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/snowpark/compute-pools/{name}/resume` | ⚠ | object | Resumes a suspended SPCS compute pool. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/snowpark/compute-pools/{name}/suspend` | ⚠ | object | Suspend a compute pool to stop billing. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/snowpark/endpoints/{service_name}` |  | object | List exposed REST endpoints for a container service. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/cortex/snowpark/image-repos` |  | object | List Docker image repositories in Snowflake. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/cortex/snowpark/services` |  | object | List all Snowpark container services. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/snowpark/services` | ⚠ | object | Deploy a container service from a YAML spec into a compute pool. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/snowpark/services/{name}` |  | object | Returns a container service's full definition (spec, compute pool, instance counts, status, endpoints); 404 if it does not exist. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| DELETE | `/cortex/snowpark/services/{name}` | ⚠ | object | Hard-drops an SPCS container service (DROP SERVICE - irreversible, frees all its credits). | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/snowpark/services/{name}/auto-stop` | ⚠ | object | Schedules an automatic suspend (default) or drop of an SPCS service after a given number of seconds. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/snowpark/services/{name}/logs` |  | object | Get stdout/stderr logs from a running container. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/snowpark/services/{name}/resume` | ⚠ | object | Resumes a suspended SPCS service, bringing its instances back online (ALTER SERVICE ... RESUME). | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/snowpark/services/{name}/status` |  | object | Get running containers, endpoints, and health for a service. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/snowpark/services/{name}/suspend` | ⚠ | object | Suspends an SPCS service so its instances scale to zero and billing stops (ALTER SERVICE ... SUSPEND). | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/snowpark/streamlit` |  | object | List all Streamlit apps deployed in Snowflake. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/cortex/snowpark/streamlit` | ⚠ | object | Deploy a Streamlit app in Snowflake. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| POST | `/cortex/synthesize-rows` | ⚠ | StandardResponse | Uses Cortex to fabricate up to 1000 realistic synthetic rows matching a target table schema. | RETAIL_AI_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/cortex/vectors/columns` |  | object | List all columns with VECTOR data type in the specified database. | RETAIL_AI_ENGINEER | P2 | **MISSING** | served (gated) |

## Observability — 43 ops, 43 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/observability/activity/summary` |  | object | Activity summary | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/alerts` |  | object | Threshold breach alerts — failed queries, slow queries, task failures, credit spikes | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/observability/alerts/{alert_id}/ack` | ⚠ | object | Acknowledge an alert | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/observability/alerts/cross-module` |  | object | Cross-Module Alerts | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/budgets` |  | object | List stored spend budgets (FinOps) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/observability/budgets` | ⚠ | object | Create a spend budget (FinOps) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| PUT | `/observability/budgets/{name}` | ⚠ | object | Update a spend budget (FinOps) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/observability/budgets/{name}` | ⚠ | object | Delete a spend budget (FinOps, destructive) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/observability/compliance/gdpr` |  | object | GDPR compliance report | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/compliance/soc2` |  | object | SOC2 compliance report | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/cost/daily-credits` |  | object | Daily credit usage | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/observability/cost/monitors` |  | object | List resource monitors (FinOps) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/observability/cost/monitors` | ⚠ | object | Create a resource monitor (FinOps) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/observability/cost/monitors/{name}` |  | object | Get a resource monitor (FinOps) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| PUT | `/observability/cost/monitors/{name}` | ⚠ | object | Update a resource monitor (FinOps) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/observability/cost/monitors/{name}` | ⚠ | object | Delete a resource monitor (FinOps, destructive) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/observability/cost/monitors/{name}/assign` | ⚠ | object | Assign a warehouse to a resource monitor (FinOps) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/observability/cost/storage` |  | object | Storage costs | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/observability/cost/warehouse-usage` |  | object | Warehouse cost usage | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/observability/dashboard` |  | object | Observability dashboard | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/dependencies` |  | object | Get object dependencies | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/dependencies/graph` |  | object | Get dependency graph | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/health` |  | object | Observability health check | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/intelligent-kpis` |  | object | Observability KPIs (legacy alias) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/kpis` |  | object | Observability KPIs | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/lineage` |  | object | Data lineage | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/lineage/access-patterns` |  | object | Access pattern analysis | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/lineage/cross-module` |  | object | Cross-module lineage explorer | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/lineage/with-tasks` |  | object | Intelligent lineage with tasks | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/performance/metrics` |  | object | Performance metrics | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/performance/slow-queries` |  | object | Slow queries | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/observability/probes/batch-check` | ⚠ | object | Batch check data freshness for multiple tables | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/observability/probes/changes` |  | object | Detect changes since timestamp | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/probes/platform` |  | object | Probe all Data360 metadata tables | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/probes/schema` |  | object | Probe all tables in a schema | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/probes/table` |  | object | Probe table freshness using row timestamps | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/security/posture` |  | object | Security posture | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/sensors/all` |  | object | Batch sensor check — all modules in one call | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/observability/slo` | ⚠ | object | Define a user SLO | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/observability/slo-tracking` |  | object | SLO compliance — query success rate, P95 latency, task success rate | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/tasks/importable` |  | object | List importable tasks | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/trust-center/findings` |  | object | Trust Center findings | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/observability/trust-center/summary` |  | object | Trust Center summary | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |

## Platform — 129 ops, 126 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/api/administration/entitlements` |  | object | Per-account addon enablement matrix (by module) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| PUT | `/api/administration/entitlements/{module}/{feature_key}` | ⚠ | object | Enable/disable/configure one addon for this account | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/administration/governance-posture` |  | object | Per-module rollup: enabled features, granted roles | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/administration/overview` |  | object | Administration landing aggregate | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/data360/cache-config` |  | object | Get cache config (TTL per zone/usage) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| PATCH | `/api/data360/cache-config` | ⚠ | object | Update cache config | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/data360/cache-entries` |  | object | Inventory of currently-cached entries (admin 'what's cached' view) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/data360/config` |  | object | Config metadata et cache | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/data360/platform-config` |  | object | List all platform configs | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/data360/platform-config/{key}` |  | object | Get single config entry | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| PUT | `/api/data360/platform-config/{key}` | ⚠ | object | Update config value | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/data360/platform-config/reset` | ⚠ | object | Reset configs to defaults | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/data360/table-refresh-mapping` |  | object | List table-refresh mapping (metadata tables, date columns, last_refresh) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/data360/table-refresh-mapping/refresh` | ⚠ | object | Trigger table refresh | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/data360/track` | ⚠ | object | Frontend event tracking (batched) | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/access-simulator` |  | object | What would <role> see on <page>/<tab> with action <action_key>? | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/cache/install` | ⚠ | object | Create EVENT_STORE.{PLATFORM_EVENTS,MODULE_GRANTS,USER_REQUESTS} | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/grants` |  | object | List module grants on this account | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/grants` | ⚠ | object | Grant a role access to a (page, module[, tab]) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/api/platform/grants` | ⚠ | object | Revoke an active grant | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/grants/actions` |  | object | List action grants (FE button visibility) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/grants/actions` | ⚠ | object | Grant an action to a role | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/grants/data-scope` |  | object | List data-scope grants | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/grants/data-scope` | ⚠ | object | Grant a role a data scope | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/grants/policies` |  | object | List policy grants | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/grants/policies` | ⚠ | object | Grant policy permissions to a role | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/grants/role/{role}` |  | object | Which pages/modules can THIS role see? | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/platform/grants/roles` |  | object | List role capability rows | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/grants/roles` | ⚠ | object | Set role-capability flags | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/grants/users` |  | object | List user-role bindings | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/api/platform/grants/users` | ⚠ | object | Bind a user to a role | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/api/platform/grants/users` | ⚠ | object | Revoke a user-role binding | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/platform/me/grants` |  | object | Effective grant bundle for the calling user (FE bootstrap) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/platform/object-permission-matrix` |  | object | Users × Snowflake data-object × privilege grid (composed from SHOW GRANTS) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/platform/permission-matrix` |  | object | Users × axis (module\|page\|tab) effective-access matrix (configured, not enforced) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/platform/users/{username}/effective-grants` |  | object | Effective grant bundle for an ARBITRARY user (me/grants shape + roles) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/platform/users/{username}/object-grants` |  | object | Snowflake-native data-object grants for a user (database→schema→table→column) | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/recommendations/` |  | object | List stored active recommendations | any | P2 | **MISSING** | served (gated) |
| GET | `/api/recommendations/{reco_id}` |  | object | Get one reco by id | any | P2 | **MISSING** | served (gated) |
| POST | `/api/recommendations/{reco_id}/acknowledge` | ⚠ | object | Mark a reco as acknowledged | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/{reco_id}/apply` | ⚠ | object | Apply a recommendation's remediation (mark-applied + return its SQL) | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/{reco_id}/dismiss` | ⚠ | object | Dismiss a reco (false-positive / N/A) | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/{reco_id}/reopen` | ⚠ | object | Reopen a resolved/dismissed reco | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/{reco_id}/resolve` | ⚠ | object | Mark a reco as resolved | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/{reco_id}/snooze` | ⚠ | object | Snooze a reco until a future date | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/analyze` | ⚠ | object | Recompute + upsert + return recos for a scope | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/recommendations/cache/install` | ⚠ | object | Create EVENT_STORE.AI_RECOMMENDATIONS (idempotent) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/recommendations/capabilities` |  | object | Recommendations module capability hint (UX gating) | any | P2 | **MISSING** | served (gated) |
| GET | `/api/recommendations/glossary` |  | object | Inspect the registered glossary (signals → actions) | any | P2 | **MISSING** | served (open) |
| GET | `/api/refresh-state` |  | object | Last refresh timestamp per zone | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/audit-views` |  | object | Predefined audit categories with live counts | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/api/snowflake/explorer/cache/install` | ⚠ | object | Create/refresh the DATA360 cache tables (idempotent) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/snowflake/explorer/databases` |  | object | Database inventory | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/databases/{database}/audit` |  | object | Audit events for all objects in a database | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/databases/{database}/governance` |  | object | Database-level governance rollup | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/databases/{database}/lineage` |  | object | Database-level lineage graph | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/facets` |  | object | Available filter values | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects` |  | object | Main object table | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}` |  | object | Object detail (drawer summary) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/actions` |  | object | Catalog actions (right-rail affordances for this object) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/audit` |  | object | Audit events for an object | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/columns` |  | object | Object columns | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/ddl` |  | object | GET_DDL for the object | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/deep-dive` |  | object | Catalog deep-dive (object → product → project → dependencies) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/governance` |  | object | Tags + policies coverage for an object | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/health` |  | object | Object health checks | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/impact` |  | object | Object impact analysis | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/lineage` |  | object | Object lineage (upstream/downstream) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/open-in-snowflake` |  | object | Build a Snowsight deep-link for the object | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/quality` |  | object | Data quality checks for an object | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/timeline` |  | object | Unified event timeline for an object | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/objects/{object_id}/usage` |  | object | Object usage summary + time series | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/api/snowflake/explorer/objects/bulk-action` | ⚠ | object | Apply a bulk action across selected objects (dry-run default) | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/snowflake/explorer/objects/export` |  | object | Stream the current /objects result as CSV | RETAIL_DATA_ENGINEER | P2 | **MISSING** | not-probed |
| GET | `/api/snowflake/explorer/recent-activity` |  | object | Account-wide unified activity feed (paginated) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/recent-activity/export` |  | object | Stream the recent-activity feed as CSV | RETAIL_DATA_ENGINEER | P2 | **MISSING** | not-probed |
| GET | `/api/snowflake/explorer/schemas` |  | object | Schema inventory | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/schemas/{database}/{schema}/audit` |  | object | Audit events for all objects in a schema | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/schemas/{database}/{schema}/governance` |  | object | Schema-level governance rollup | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/schemas/{database}/{schema}/lineage` |  | object | Schema-level lineage graph | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/scoring/definitions` |  | object | Health/risk/governance scoring formulas | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/api/snowflake/explorer/selection-review` | ⚠ | object | Aggregator across a set of selected object_ids | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/snowflake/explorer/summary` |  | object | Global summary cards | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/api/snowflake/explorer/sync` | ⚠ | object | Trigger a metadata refresh | RETAIL_DATA_ENGINEER | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/snowflake/explorer/sync/{sync_id}` |  | object | Single sync run status | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/sync/history` |  | object | Past sync runs (newest first) | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/sync/status` |  | object | Latest sync status | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| GET | `/api/snowflake/explorer/tree` |  | object | Database/schema tree | RETAIL_DATA_ENGINEER | P2 | **MISSING** | served (gated) |
| POST | `/api/workspace/cache/install` | ⚠ | object | Create EVENT_STORE.USER_* tables (idempotent) | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/workspace/investigation-modes` |  | object | Static catalog of pre-built filter presets | any | P2 | **MISSING** | served (open) |
| GET | `/api/workspace/recently-opened` |  | object | List recently-opened objects (current user) | any | P2 | **MISSING** | served (gated) |
| GET | `/api/workspace/saved-views` |  | object | List the current user's saved filter snapshots | any | P2 | **MISSING** | served (gated) |
| POST | `/api/workspace/saved-views` | ⚠ | object | Create a saved view | any | P1 | **MISSING** | mutation (not probed) |
| PATCH | `/api/workspace/saved-views/{view_id}` | ⚠ | object | Update a saved view | any | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/api/workspace/saved-views/{view_id}` | ⚠ | object | Delete a saved view | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/api/workspace/touch` | ⚠ | object | Record that the user opened an object | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/api/workspace/watchlist` |  | object | List watchlisted objects (current user) | any | P2 | **MISSING** | served (gated) |
| POST | `/api/workspace/watchlist` | ⚠ | object | Add an object to the watchlist | any | P1 | **MISSING** | mutation (not probed) |
| DELETE | `/api/workspace/watchlist/{object_id}` | ⚠ | object | Remove from watchlist | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/cache/breakdown` |  | object | Cache key breakdown by class | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/cache/clear/all` | ⚠ | object | Clear all cache | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/cache/clear/pattern` | ⚠ | CacheClearResponse | Clear cache by pattern | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/cache/dashboard` |  | object | Cache dashboard | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/cache/health` |  | object | Cache health check | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/cache/invalidations` |  | object | Recent cache invalidations | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/cache/keys` |  | CacheKeysResponse | List cache keys | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/cache/keys` | ⚠ | object | Set cache key | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/cache/keys/{key}` |  | CacheKeyResponse | Get cache key value | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| DELETE | `/cache/keys/{key}` | ⚠ | object | Delete cache key | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/cache/kpis` |  | object | Granular cache KPIs | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/cache/performance` |  | object | Cache performance stats | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/cache/refresh/start` | ⚠ | object | Start cache refresh | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/cache/refresh/status` |  | object | Cache refresh status | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/cache/refresh/stop` | ⚠ | object | Stop cache refresh | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/cache/refresh/trigger/{job_name}` | ⚠ | object | Trigger refresh job | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| GET | `/cache/stats` |  | CacheStatsResponse | Cache statistics | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/cache/svc-health` |  | object | Service account health check | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| GET | `/cache/test-connection` |  | object | Test cache connection | ACCOUNTADMIN | P2 | **MISSING** | served (gated) |
| POST | `/cache/warmup` | ⚠ | object | Warm up cache | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/cache/warmup/trigger` | ⚠ | object | Trigger cache warmup | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/user/bootstrap-account/` | ⚠ | object | Re-run metadata bootstrap for the authenticated account | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/user/login/` | ⚠ | object | Login (alias for POST /signin) | any |  | wired | mutation (not probed) |
| GET | `/user/me/modules` |  | object | Get user modules | any |  | wired | served (gated) |
| GET | `/user/profile` |  | object | Get current user's Snowflake profile | any | P2 | **MISSING** | served (gated) |
| PUT | `/user/profile` | ⚠ | object | Update current user's profile | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/user/profile/password` | ⚠ | object | Change current user's password | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/user/profile/role` | ⚠ | UserRolesResponse | Switch the current user's active role | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/user/profile/roles` |  | UserRolesResponse | List roles granted to the current user | any | P2 | **MISSING** | served (gated) |
| POST | `/user/register/` | ⚠ | object | Register a new account (creates Snowflake account + bootstraps metadata schema) | any |  | wired | mutation (not probed) |

## Workflow — 81 ops, 74 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/workflow` | ⚠ | object | Creates a new Workflow project (low-code ETL pipeline). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow` |  | object | Lists the current user's workflows. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/workflow/{workflow_id}` |  | object | Returns a single workflow's metadata (name, description, status, tags, and created-at). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| PATCH | `/workflow/{workflow_id}` | ⚠ | object | Updates a workflow's metadata (name, description, and tags) on its unified-projects record. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/block-events` |  | object | Returns per-block run and resource-cleanup events (compute used, billing, rows, and any Snowflake error) for a workflow. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/cancel` | ⚠ | object | Cancels the workflow - suspends its scheduled task and marks in-flight runs as cancelled. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/clone-data-tests` |  | object | Test-real-life via zero-copy clone (per ETL block). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/compile` | ⚠ | object | Compile workflow into CTE SQL without executing. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/contributors` |  | object | List contributors for a workflow from PROJECT_CONTRIBUTORS, enriched with the last action timestamp derived from the project's events history. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/workflow/{workflow_id}/contributors` | ⚠ | object | Add (or update the role of) a workflow contributor. | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| DELETE | `/workflow/{workflow_id}/contributors/{username}` | ⚠ | object | Remove a contributor from a workflow (owners are protected and cannot be removed). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/workflow/{workflow_id}/cost-summary` |  | object | REAL per-run credits: ACCOUNT_USAGE.TASK_HISTORY (full window) + the live INFORMATION_SCHEMA tail, attributed via ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY (root-aware), plus batched WAREHOUSE_METERING_HISTORY. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/workflow/{workflow_id}/dag` |  | object | DAG nodes + AFTER edges derived from the workflow definition. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/deployments` | ⚠ | object | Requests deployment of a workflow (materializes its blocks as Snowflake tasks), opening it for approval. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/deployments` |  | object | List workflow deployments. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/deployments/{deployment_id}/approve` | ⚠ | object | Approves a pending workflow deployment. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/deployments/{deployment_id}/cancel` | ⚠ | object | Cancels a pending or scheduled workflow deployment. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/deployments/{deployment_id}/execute` | ⚠ | object | Executes an approved workflow deployment, provisioning its scheduled tasks. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/deployments/{deployment_id}/reject` | ⚠ | object | Rejects a pending workflow deployment. | RETAIL_GOVERNOR | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/deployments/{deployment_id}/verify` | ⚠ | object | Re-verifies a workflow deployment's shipped objects (per-target row counts and task outcome). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| PUT | `/workflow/{workflow_id}/draft` | ⚠ | object | Persist the in-progress draft (canvas state) without minting a version. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/draft` |  | object | Return the last autosaved draft state (or an empty default if none). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/dry-run` | ⚠ | object | Compile + validate a saved workflow WITHOUT executing. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/estimate-vs-reference` | ⚠ | object | Estimate the cost of running this workflow + compare to a reference table's existing footprint. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/execute` | ⚠ | object | Runs a workflow end-to-end, executing each block in dependency order. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/post-verify` | ⚠ | object | After execution, verifies each target block's output (row counts) and the task outcome. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/pre-check` | ⚠ | object | Preconditions: source objects exist, target schema writable, warehouse available, no concurrent deployment. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/rollback` | ⚠ | object | Repoints a workflow to a prior saved version (metadata-only) and marks newer versions superseded. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/runs` |  | object | List workflow runs. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/workflow/{workflow_id}/runs/{run_id}/analyze` | ⚠ | object | Use Cortex AI to analyze a failed workflow run and suggest fixes. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/runs/summary` |  | object | Returns aggregate run metrics for a workflow (totals, success rate, average duration). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/schedule` | ⚠ | object | Create or update a Snowflake TASK that runs this workflow on a cron schedule. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/workflow/{workflow_id}/schedule` | ⚠ | object | Drop the Snowflake TASK for this workflow (DROP TASK IF EXISTS). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/schedule/pause` | ⚠ | object | Suspends the Snowflake task backing this workflow's schedule (ALTER TASK ... SUSPEND). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/schedule/resume` | ⚠ | object | Resumes the Snowflake task backing this workflow's schedule (ALTER TASK ... RESUME). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/schedules` |  | object | Get schedule info for a workflow by querying the Snowflake task directly. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/workflow/{workflow_id}/steps` |  | object | Get workflow steps. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/steps` | ⚠ | object | Adds a step (an ETL block instance) to a workflow's graph. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| PUT | `/workflow/{workflow_id}/steps/{step_id}` | ⚠ | object | Updates a workflow step's block type, parameters, or wiring. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/workflow/{workflow_id}/steps/{step_id}` | ⚠ | object | Deletes a step from a workflow's graph. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/task-status` |  | object | Snowflake task execution history (ACCOUNT_USAGE.TASK_HISTORY full window + live INFORMATION_SCHEMA tail) with success/fail stats, duration percentiles and real per-run credits. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/workflow/{workflow_id}/tasks/{task_id}/logs` |  | object | Per-task run history merged from ACCOUNT_USAGE.TASK_HISTORY (full window) + the live INFORMATION_SCHEMA tail, with real per-run credits and duration stats. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/{workflow_id}/tasks/{task_id}/retry` | ⚠ | object | Trigger a one-off run of a single task via EXECUTE TASK. 404 if unknown. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/validate` | ⚠ | object | Validate that workflow steps form a valid DAG (no cycles, correct input counts, unique aliases). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/{workflow_id}/validate-block` | ⚠ | object | Validates a single block's configuration in a pre-flight check as the user edits it in the builder. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/{workflow_id}/versions` |  | object | List workflow versions. | RETAIL_DATA_ENGINEER |  | wired | served (gated) |
| POST | `/workflow/{workflow_id}/versions` | ⚠ | object | Mint a named, immutable version from the workflow's current steps (snapshots the step graph as the version DEFINITION). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/workflow/action-templates` |  | object | List workflow action templates. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/action-templates` | ⚠ | object | Creates a reusable workflow action template (a parameterized block preset). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/blocks` |  | object | Full rich block catalog (single source of truth for the builder palette). | any | P1 | **MISSING** | served (gated) |
| GET | `/workflow/blocks/{block_type}` |  | object | Rich detail for one block: param schema, query_template, example rendered SQL, snowflake_capability, docs_url, supports. 404 if the type is unknown. | any | P1 | **MISSING** | served (gated) |
| POST | `/workflow/blocks/{block_type}/render-sql` | ⚠ | object | Fill the block's query_template with supplied params → SQL string. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/blocks/categories` |  | object | Categories with block-type lists for palette grouping. | any | P1 | **MISSING** | served (gated) |
| GET | `/workflow/capabilities` |  | object | Return workflow metadata to power low-code UX, notebooks, and python editors. | any | P1 | **MISSING** | served (gated) |
| GET | `/workflow/catalog/blocks` |  | object | Returns the ETL block catalog (categories and every registered action with metadata), served from memory with no Snowflake round-trip. | any | P1 | **MISSING** | served (gated) |
| GET | `/workflow/compute-pools/{name}` |  | object | Returns the definition and status of a single compute pool (404 if it does not exist). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| PATCH | `/workflow/compute-pools/{name}` | ⚠ | object | Alters a compute pool's scaling settings (min/max nodes, auto-suspend, auto-resume, comment) via ALTER COMPUTE POOL. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/dry-run` | ⚠ | object | Compile-from-graph + validate an UNSAVED workflow graph. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/events/resource-cleanup` | ⚠ | object | Records a resource-cleanup event for the real-life block-test harness (tracks objects created then dropped). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/from-graph` | ⚠ | object | Creates a workflow in one shot from a node/edge graph, adding every node as a step and wiring inputs from the edges. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/git/repositories` |  | object | Git Repositories List. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/git/repositories` | ⚠ | object | Registers a Snowflake Git repository integration for sourcing workflow code. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/git/repositories/{name}` |  | object | Git Repository Describe. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| DELETE | `/workflow/git/repositories/{name}` | ⚠ | object | Drops a registered Git repository integration. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/git/repositories/{name}/branches` |  | object | Git Repository Branches. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/git/repositories/{name}/fetch` | ⚠ | object | Fetches the latest commits, branches, and tags for a registered Git repository. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/git/repositories/{name}/tags` |  | object | Git Repository Tags. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/workflow/jobs` |  | object | List async jobs for the current user's account, newest first. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| GET | `/workflow/notebooks` |  | object | Notebooks List. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/notebooks` | ⚠ | object | Creates a Snowflake Notebook for interactive workflow development. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/notebooks/{name}` |  | object | Notebook Describe. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| PATCH | `/workflow/notebooks/{name}` | ⚠ | object | Alters a Snowflake Notebook's settings (warehouse, comment). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| DELETE | `/workflow/notebooks/{name}` | ⚠ | object | Drops a Snowflake Notebook. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/notebooks/{name}/execute` | ⚠ | object | Executes a Snowflake Notebook and returns its run result. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/preview-table` |  | object | Preview rows from any table. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/run-python` | ⚠ | object | Runs an ad-hoc Python (Snowpark) snippet in the workflow context and returns the result. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| POST | `/workflow/run-sql` | ⚠ | object | Runs an ad-hoc SQL statement in the workflow context and returns the result. | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |
| GET | `/workflow/schedules` |  | object | List all workflow Snowflake tasks (WORKFLOW_TASK_*). | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/setup/initialize-tables` | ⚠ | object | Provisions the backing metadata tables the Workflow module needs (one-time setup). | RETAIL_DATA_ENGINEER |  | wired | mutation (not probed) |
| GET | `/workflow/tasks/discover` |  | object | Discover all Snowflake tasks in a given database. | RETAIL_DATA_ENGINEER | P1 | **MISSING** | served (gated) |
| POST | `/workflow/tasks/import` | ⚠ | object | Materialize a Snowflake task DAG into a new workflow project (one step per task). | RETAIL_DATA_ENGINEER | P0 | **MISSING** | mutation (not probed) |

## analytics — 1 ops, 1 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/analytics/user-activity/summary` |  | object | User activity summary KPIs | any | P2 | **MISSING** | served (gated) |

## cache-stream — 5 ops, 5 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/cache-stream/available-keys` |  | object | Available cache keys | ACCOUNTADMIN | P2 | **MISSING** | not-probed |
| GET | `/cache-stream/last-invalidation/{cache_key}` |  | object | Last invalidation time | ACCOUNTADMIN | P2 | **MISSING** | not-probed |
| GET | `/cache-stream/stats` |  | object | Cache stream stats | ACCOUNTADMIN | P2 | **MISSING** | not-probed |
| GET | `/cache-stream/stream` |  | object | Cache SSE stream | ACCOUNTADMIN | P2 | **MISSING** | not-probed |
| POST | `/cache-stream/test-invalidation` | ⚠ | object | Test cache invalidation | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |

## common — 5 ops, 5 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/common/databases` |  | object | Step 2: Choose database | any | P2 | **MISSING** | served (gated) |
| GET | `/common/get_table_columns` |  | object | Get table columns | any | P2 | **MISSING** | served (gated) |
| GET | `/common/get_table_columns/` |  | object | Get table columns (trailing slash) | any | P2 | **MISSING** | served (gated) |
| GET | `/common/schemas/{database_name}` |  | object | Step 3: Choose schema | any | P2 | **MISSING** | served (gated) |
| GET | `/common/tables/{database_name}/{schema_name}` |  | object | Step 4: Choose table | any | P2 | **MISSING** | served (gated) |

## health — 1 ops, 1 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/health` |  | object | Health check | any | P2 | **MISSING** | served (open) |

## notifications — 5 ops, 5 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/notifications` |  | object | List current user's notifications | any | P2 | **MISSING** | served (gated) |
| PATCH | `/notifications/{notification_id}/read` | ⚠ | object | Mark a single notification as read | any | P1 | **MISSING** | mutation (not probed) |
| POST | `/notifications/broadcast` | ⚠ | object | Publish a notification — fan-out happens server-side | ACCOUNTADMIN | P1 | **MISSING** | mutation (not probed) |
| POST | `/notifications/mark-all-read` | ⚠ | object | Mark every unread notification as read | any | P1 | **MISSING** | mutation (not probed) |
| GET | `/notifications/unread-count` |  | object | Cheap unread counter for the bell badge | any | P2 | **MISSING** | served (gated) |

## ready — 1 ops, 1 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| GET | `/ready` |  | object | Readiness check | any | P2 | **MISSING** | served (open) |

## signin — 1 ops, 1 missing

| Method | Path | Mut | Returns | Description | Role | Prio | Wired | Live |
|---|---|:-:|---|---|---|:-:|---|---|
| POST | `/signin` | ⚠ | object | Sign in (get token) | any | P1 | **MISSING** | mutation (not probed) |

