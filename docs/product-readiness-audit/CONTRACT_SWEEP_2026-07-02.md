# Contract GET Sweep + CRUD-7 Audit — 2026-07-02

Live sweep of every GET endpoint declared in `apps/data360/src/lib/api-contracts.ts` (`API.*`) against **http://api.datalab360.io** as `HAHA` (ACCOUNTADMIN), plus CRUD-7 completeness vs the deployed route set (`/openapi.json`). Only HTTP GET was issued (a GET to a POST route just 405s — no mutation possible).

> **Skew caveat:** the sweep hits the **deployed** backend; CRUD-7 cross-checks the **deployed** route set from live `/openapi.json` (1019 ops). Local backend source may be newer (deploy-lag). A contract GET that 404s and is absent from `/openapi.json` is **not-deployed**, not necessarily broken.

## (a) Summary counts

| Metric | Count |
|---|---:|
| Contract leaves parsed (API.*) | 525 |
| Callable GET (after mutation/side-effect filter) | 328 |
| Resolved + called | 263 |
| Unresolved params (skipped) | 65 |
| 2xx | 234 |
| 3xx | 0 |
| 4xx | 29 |
| 5xx | 0 |
| network/timeout (-1) | 0 |
| **empty-but-200** | 34 |
| deployed ops in /openapi.json | 1019 (GET 523) |
| deployed ops with **no contract entry** | 517 (mutations 298) |

By-status: `200`×234  `400`×5  `404`×20  `405`×3  `422`×1

## (b) FAILING GETs (non-2xx)

**0 5xx** across 263 live GETs. Class taxonomy: `method-405`×3  `not-deployed`×10  `not-found*`×10  `validation`×6.

- `not-deployed` — absent from live /openapi.json GET set = deploy-lag (backend source may have it; not on this host yet).
- `method-405` — path exists but not for GET (contract declares GET; backend serves another verb / different list path).
- `validation` (400/422) — endpoint live but requires a query param the contract fn treats as optional (**real contract gap**: FE can call it wrong).
- `not-found*` — deployed + 404 on a resolver **sample id** (endpoint works; the swept id/account simply had no such row). Harness artifact, not a defect.

| Status | class | Module.name | Path | dep | Error |
|---:|---|---|---|:--:|---|
| 422 | validation | orgAccounts.costSimulation | `/org-accounts/cost-simulation/project/proj_62160fd8e960` | Y | object_type must be one of ['warehouse', 'databa |
| 405 | method-405 | biDashboard.list | `/bi-dashboard` | N | Method Not Allowed |
| 405 | method-405 | gouvernance.d360MyModuleAccess | `/gouvernance/d360-roles/my-module-access` | N | Method Not Allowed |
| 405 | method-405 | workflow.estimateVsReference | `/workflow/proj_d2e0b8c2538f/estimate-vs-reference` | N | Method Not Allowed |
| 404 | not-deployed | biDashboard.nlToChart | `/bi-dashboard/nl-to-chart` | N | {"error_code":"NOT_FOUND","message":"Dashboard p |
| 404 | not-deployed | biDashboard.autoCreate | `/bi-dashboard/auto-create` | N | {"error_code":"NOT_FOUND","message":"Dashboard p |
| 404 | not-found* | catalog.objectHistory | `/catalog/objects/CP_DATA360.EVENT_STORE.BI_DASHBOARD_PAGES/h` | Y | {"error_code":"OBJECT_NOT_FOUND","message":"cata |
| 404 | not-found* | catalog.productKpis | `/catalog/products/ac7c3dd1-42c6-4bd6-817b-1068d2e3469f/kpis` | Y | {"error_code":"NOT_FOUND","message":"DataProduct |
| 404 | not-deployed | catalog.detectedModels | `/sources/detected-models?project_id=proj_62160fd8e960` | N | Not Found |
| 404 | not-found* | chat.conversation | `/chat/conversations/proj_62160fd8e960` | Y | {"error_code":"NOT_FOUND","message":"Conversatio |
| 404 | not-found* | chat.conversationMessages | `/chat/conversations/proj_62160fd8e960/messages` | Y | {"error_code":"NOT_FOUND","message":"Conversatio |
| 404 | not-found* | chat.conversationParticipants | `/chat/conversations/proj_62160fd8e960/participants` | Y | {"error_code":"NOT_FOUND","message":"Conversatio |
| 404 | not-found* | connect.getConnector | `/connect/connectors/proj_62160fd8e960` | Y | {"error_code":"NOT_FOUND","message":"connector ' |
| 404 | not-deployed | dataQuality.base | `/data-quality` | N | Not Found |
| 404 | not-deployed | deployments.base | `/deployments` | N | Not Found |
| 404 | not-deployed | exploreDesign.releaseState | `/explore-design/proj_62160fd8e960/release-state` | N | Not Found |
| 404 | not-deployed | exploreDesign.aiHistory | `/explore-design/proj_62160fd8e960/ai/history` | N | Not Found |
| 404 | not-deployed | gouvernance.tablePolicies | `/gouvernance/policies/objects/CP_DATA360/EVENT_STORE/BI_DASH` | N | Not Found |
| 404 | not-deployed | observability.base | `/observability` | N | Not Found |
| 404 | not-found* | orgAccounts.accountDetail | `/org-accounts/accounts/HAHA` | Y | Account 'HAHA' not found in this organization. |
| 404 | not-found* | orgAccounts.accountHealth | `/org-accounts/health/HAHA` | Y | {"detail":"Account 'HAHA' not found","error_code |
| 404 | not-found* | orgAccounts.creditHistory | `/org-accounts/credits/history/HAHA` | Y | {"detail":"Account 'HAHA' not found","error_code |
| 404 | not-found* | orgAccounts.accountWarehouses | `/org-accounts/warehouses/HAHA` | Y | {"detail":"Account 'HAHA' not found","error_code |
| 404 | not-deployed | projects.contributor | `/projects/proj_62160fd8e960/contributors/HAHA` | N | Not Found |
| 400 | validation | dataQuality.projectDmfResults | `/data-quality/projects/proj_62160fd8e960/dmf-results` | Y | [{"type":"missing","loc":["query","table_name"], |
| 400 | validation | dataQuality.projectDmfSuggest | `/data-quality/projects/proj_62160fd8e960/dmf-suggest` | Y | [{"type":"missing","loc":["query","table_name"], |
| 400 | validation | exploreDesign.glossaryLookup | `/explore-design/glossary/lookup` | Y | [{"type":"missing","loc":["query","term"],"msg": |
| 400 | validation | gouvernance.policyDmfReferences | `/gouvernance/policies/dmf/references` | Y | [{"type":"missing","loc":["query","table_name"], |
| 400 | validation | workflow.previewTable | `/workflow/preview-table` | Y | [{"type":"missing","loc":["query","database"],"m |

## (c) EMPTY-but-200 (candidates for seed/verify)

| Module.name | Path | ms | sample |
|---|---|---:|---|
| accessRequests.inbox | `/access-requests/inbox` | 204 | {"requests": [], "count": 0, "execution_time_ms": 95} |
| administration.byCache | `/administration/performance/uchsfvb-HAHA/by-cache?axis=page` | 39 | {"account": "UCHSFVB-HAHA", "hours": 24, "axis": "page", "ro |
| cacheService.svcHealth | `/cache/svc-health` | 96 | {"status": "not_configured", "message": "Set D360_SVC_ACCOUN |
| catalog.recommendations | `/catalog/recommendations` | 29 | {"items": [], "count": 0, "filters": {"account": "UCHSFVB-HA |
| catalog.tableIngestion | `/catalog/tables/CP_DATA360/EVENT_STORE/BI_DASHBOARD_PAGES/in` | 34 | {"mode": null, "last_run": null, "next_run": null, "avg_cost |
| cortex.agents | `/cortex/agents?database=CP_DATA360` | 28 | {"agents": [], "total": 0, "execution_time_ms": 5} |
| cortex.classificationModels | `/cortex/ml/classification/models` | 28 | {"models": [], "count": 0, "execution_time_ms": 5} |
| cortex.documentAiModels | `/cortex/ml/document-ai/models` | 27 | {"models": [], "count": 0, "execution_time_ms": 5} |
| cortex.snowparkStreamlit | `/cortex/snowpark/streamlit` | 29 | {"apps": [], "count": 0, "execution_time_ms": 5} |
| cortex.snowparkImageRepos | `/cortex/snowpark/image-repos` | 27 | {"repositories": [], "count": 0, "execution_time_ms": 5} |
| cortex.queryAnalyticsResults | `/cortex/query-analytics/results` | 33 | {"results": [], "count": 0, "execution_time_ms": 7} |
| cortex.queryAnalyticsRedundantGroups | `/cortex/query-analytics/redundant-groups` | 28 | {"groups": [], "count": 0, "execution_time_ms": 6} |
| dataQuality.ingestionMetrics | `/data-quality/ingestion-metrics` | 116 | {"rows": [], "days": 30, "summary": {"total_loads": 0, "load |
| exploreDesign.recentDeploymentErrors | `/explore-design/recent-deployment-errors` | 164 | {"errors": [], "count": 0, "execution_time_ms": 112} |
| exploreDesign.glossaryList | `/explore-design/glossary` | 26 | {"data": [], "count": 0, "execution_time_ms": 4} |
| exploreDesign.dynamicTables | `/explore-design/dynamic-tables` | 27 | {"dynamic_tables": [], "count": 0, "execution_time_ms": 4} |
| exploreDesign.streams | `/explore-design/streams` | 32 | {"streams": [], "count": 0, "execution_time_ms": 9} |
| gouvernance.oauthNetworkPolicies | `/gouvernance/oauth/network-policies` | 27 | {"policies": [], "count": 0, "execution_time_ms": 4} |
| observability.budgets | `/observability/budgets` | 356 | {"budgets": [], "count": 0, "execution_time_ms": 332} |
| orgAccounts.creditsTrend | `/org-accounts/credits/trend` | 32 | {"period_days": 30, "trend": [], "data_points": 0, "executio |
| orgAccounts.creditsTop | `/org-accounts/credits/top` | 32 | {"period_days": 30, "limit": 10, "top_consumers": [], "count |
| orgAccounts.warehouses | `/org-accounts/warehouses` | 33 | {"period_days": 30, "warehouses": [], "count": 0, "note": nu |
| orgAccounts.orgWarehouseCredits | `/org-accounts/organization/warehouse-credits` | 33 | {"period_days": 30, "warehouses": [], "total": 0, "execution |
| orgAccounts.orgCosts | `/org-accounts/organization/costs` | 27 | {"period_days": 30, "costs": [], "total": 0, "execution_time |
| orgAccounts.orgStorage | `/org-accounts/organization/storage` | 32 | {"period_days": 30, "storage": [], "total": 0, "execution_ti |
| orgAccounts.orgRemainingBalance | `/org-accounts/organization/remaining-balance` | 27 | {"balance": [], "total": 0, "execution_time_ms": 5} |
| platform.list | `/api/platform/grants` | 172 | {"items": [], "count": 0, "execution_time_ms": 146} |
| platform.users | `/api/platform/grants/users?username=HAHA` | 314 | {"items": [], "count": 0, "execution_time_ms": 70} |
| snowflakeExplorer.databases | `/api/snowflake/explorer/databases` | 91 | {"items": [], "facets": null, "pagination": {"page": 1, "pag |
| snowflakeExplorer.schemas | `/api/snowflake/explorer/schemas` | 95 | {"items": [], "facets": null, "pagination": {"page": 1, "pag |
| snowflakeExplorer.objects | `/api/snowflake/explorer/objects` | 120 | {"items": [], "facets": null, "pagination": {"page": 1, "pag |
| snowflakeExplorer.facets | `/api/snowflake/explorer/facets` | 742 | {"databases": [], "schemas": [], "object_types": [], "object |
| workflow.gitRepositories | `/workflow/git/repositories` | 93 | {"data": [], "execution_time_ms": 70} |
| workflow.notebooks | `/workflow/notebooks` | 147 | {"data": [], "execution_time_ms": 116} |

## (e) Slowest 2xx GETs — wall `ms` vs backend `execMs`

Cold-path / perf signal (not defects); large wall-vs-execMs gaps = cold compile or network. `administration.platformHealth` also produced the lone `-1` timeout (>20s twice).

| ms | execMs | bytes | Module.name | Path |
|---:|---:|---:|---|---|
| 12896 | — | 1562 | workflow.steps | `/workflow/proj_d2e0b8c2538f/steps` |
| 12357 | 12295 | 984 | exploreDesign.deploymentReadiness | `/explore-design/proj_62160fd8e960/deployment-readine` |
| 11953 | — | 41115 | projects.events | `/projects/proj_62160fd8e960/events` |
| 11610 | — | 16690 | projects.unified | `/projects/unified` |
| 11174 | 11152 | 243 | workflow.contributors | `/workflow/proj_d2e0b8c2538f/contributors` |
| 9118 | — | 2551 | gouvernance.policiesMyScope | `/gouvernance/policies/my-scope` |
| 7903 | 7831 | 398 | workflow.deployments | `/workflow/proj_d2e0b8c2538f/deployments` |
| 7632 | 7593 | 445 | workflow.runs | `/workflow/proj_d2e0b8c2538f/runs` |
| 7197 | — | 1538 | exploreDesign.ingestionOperations | `/explore-design/proj_62160fd8e960/ingestion/operatio` |
| 6980 | — | 1766 | workflow.dag | `/workflow/proj_d2e0b8c2538f/dag` |
| 6895 | 6817 | 133 | workflow.blockEvents | `/workflow/proj_d2e0b8c2538f/block-events` |
| 6692 | 6600 | 160 | workflow.cloneDataTests | `/workflow/proj_d2e0b8c2538f/clone-data-tests` |

## (d) Per-module CRUD-7 grid

Canonical actions with a **declared contract entry** (any method). ✓=present, ✗=absent.

> GRANT/REVOKE/RUN are **name-inferred heuristics** (a read named `*Grants`/`*grant*` can false-✓; a RUN-like `warehouseResize` can be missed). The missing-actions list below is the authoritative gap signal — cross-check the two, don't read the grid alone.

| Module | CREATE | READ | UPDATE | DELETE | GRANT | REVOKE | RUN |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| accessRequests | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| accountOverview | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| admin | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| administration | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| auth | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| biDashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| cacheService | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| catalog | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| chat | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| commandCenter | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| common | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| connect | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| cortex | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ |
| dataProducts | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| dataQuality | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| deployments | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| exploreDesign | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| gouvernance | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| observability | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| orgAccounts | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| platform | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| projects | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| snowflakeExplorer | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| workflow | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |

### Missing management actions — deployed backend ops with NO contract entry

> **Read as contract-hygiene, NOT a feature-gap list.** "No contract entry" = absent from `API.*` **and** legacy `API_CONTRACTS`. It does **not** mean unwired — many are called via hardcoded inline strings elsewhere in the FE (prior audits found the majority of such "gaps" were hardcoded/legacy-wired). Mutation methods only; **298** total, showing up to 70. `file:line` = backend router decorator (suffix-matched; — = no literal-path decorator).

| Method + Path (deployed) | backend file:line |
|---|---|
| `DELETE /api/platform/grants` | app/modules/platform_core/router.py:172 |
| `DELETE /api/platform/grants/users` | app/modules/platform_core/router.py:267 |
| `DELETE /api/workspace/saved-views/{}` | app/modules/user_workspace/router.py:169 |
| `DELETE /api/workspace/watchlist/{}` | app/modules/user_workspace/router.py:294 |
| `DELETE /bi-dashboard/{}` | — |
| `DELETE /bi-dashboard/{}/filters/{}` | app/modules/projects/bi_dashboard/router.py:730 |
| `DELETE /bi-dashboard/{}/pages/{}` | app/modules/projects/bi_dashboard/router.py:550 |
| `DELETE /bi-dashboard/{}/widgets/{}` | app/modules/projects/bi_dashboard/router.py:658 |
| `DELETE /cache/keys/{}` | app/modules/cache/routers/cache_management.py:190 |
| `DELETE /cortex/ml/classification/{}` | app/modules/intelligence/cortex/router.py:3169 |
| `DELETE /cortex/semantic-models/{}` | app/modules/intelligence/cortex/router.py:1658 |
| `DELETE /cortex/snowpark/services/{}` | — |
| `DELETE /explore-design/alerts/{}` | app/modules/projects/explore_design/router.py:1113 |
| `DELETE /explore-design/event-tables/{}` | app/modules/projects/explore_design/router.py:994 |
| `DELETE /explore-design/hybrid-tables/{}` | app/modules/projects/explore_design/router.py:1039 |
| `DELETE /explore-design/projects/{}/relationships/{}` | app/modules/projects/explore_design/lifecycle_router.py:710 |
| `DELETE /explore-design/{}/ddl-actions/{}` | app/modules/projects/explore_design/router.py:242 |
| `DELETE /gouvernance/d360-roles/{}` | — |
| `DELETE /gouvernance/drop-role` | app/modules/gouvernance/routers/gouvernance.py:1538 |
| `DELETE /gouvernance/drop-user` | app/modules/gouvernance/routers/gouvernance.py:1415 |
| `DELETE /gouvernance/policies/aggregation/{}/{}/{}` | app/modules/gouvernance/routers/governance_policies.py:1855 |
| `DELETE /gouvernance/policies/dmf/{}` | app/modules/gouvernance/routers/governance_policies.py:2674 |
| `DELETE /gouvernance/policies/network/{}` | app/modules/gouvernance/routers/governance_policies.py:1150 |
| `DELETE /gouvernance/policies/tags/{}` | app/modules/gouvernance/routers/governance_policies.py:1406 |
| `DELETE /gouvernance/policies/{}/{}` | app/modules/gouvernance/routers/gouvernance.py:3108 |
| `DELETE /gouvernance/roles/{}/grant-role` | — |
| `DELETE /gouvernance/security-axes/{}` | app/modules/gouvernance/routers/gouvernance.py:493 |
| `DELETE /gouvernance/security-matrix/role/{}` | app/modules/gouvernance/routers/gouvernance.py:845 |
| `DELETE /gouvernance/security-matrix/{}` | app/modules/gouvernance/routers/gouvernance.py:757 |
| `DELETE /gouvernance/unassign-role` | app/modules/gouvernance/routers/gouvernance.py:1821 |
| `DELETE /org-accounts/reader-accounts/{}` | — |
| `DELETE /org-accounts/resource-monitors/{}` | — |
| `DELETE /projects/{}/comments/{}` | app/modules/projects/router.py:382 |
| `DELETE /projects/{}/rls/{}` | app/modules/projects/rls_router.py:357 |
| `DELETE /workflow/git/repositories/{}` | app/modules/projects/workflow/integrations_router.py:138 |
| `DELETE /workflow/notebooks/{}` | app/modules/projects/workflow/integrations_router.py:206 |
| `DELETE /workflow/{}/contributors/{}` | app/modules/projects/workflow/router.py:517 |
| `DELETE /workflow/{}/steps/{}` | app/modules/projects/workflow/router.py:686 |
| `PATCH /api/data360/cache-config` | — |
| `PATCH /api/workspace/saved-views/{}` | app/modules/user_workspace/router.py:142 |
| `PATCH /chat/conversations/{}` | app/modules/chat/routers/chat.py:123 |
| `PATCH /cortex/snowpark/compute-pools/{}` | app/modules/intelligence/cortex/router.py:4066 |
| `PATCH /deployments/track/{}/step` | app/modules/deployment_tracking/routers/tracking.py:95 |
| `PATCH /explore-design/alerts/{}` | app/modules/projects/explore_design/router.py:1084 |
| `PATCH /notifications/{}/read` | app/modules/notifications/routers/notifications.py:88 |
| `PATCH /org-accounts/accounts/{}` | — |
| `PATCH /org-accounts/accounts/{}/mfa` | — |
| `PATCH /workflow/notebooks/{}` | app/modules/projects/workflow/integrations_router.py:195 |
| `POST /api/data360/platform-config/reset` | — |
| `POST /api/data360/table-refresh-mapping/refresh` | app/modules/catalog/router.py:839 |
| `POST /api/data360/track` | — |
| `POST /api/platform/cache/install` | app/modules/recommendations/router.py:397 |
| `POST /api/platform/grants/data-scope` | app/modules/platform_core/router.py:454 |
| `POST /api/platform/grants/roles` | app/modules/platform_core/router.py:307 |
| `POST /api/platform/grants/users` | app/modules/platform_core/router.py:249 |
| `POST /api/recommendations/analyze` | app/modules/recommendations/router.py:73 |
| `POST /api/recommendations/cache/install` | app/modules/recommendations/router.py:397 |
| `POST /api/recommendations/{}/acknowledge` | app/modules/recommendations/router.py:239 |
| `POST /api/recommendations/{}/apply` | — |
| `POST /api/recommendations/{}/dismiss` | app/modules/recommendations/router.py:294 |
| `POST /api/recommendations/{}/reopen` | app/modules/recommendations/router.py:312 |
| `POST /api/recommendations/{}/resolve` | app/modules/recommendations/router.py:276 |
| `POST /api/recommendations/{}/snooze` | app/modules/recommendations/router.py:258 |
| `POST /api/snowflake/explorer/cache/install` | app/modules/recommendations/router.py:397 |
| `POST /api/snowflake/explorer/objects/bulk-action` | app/modules/command_center/account_overview/snowflake_explorer/router.py:930 |
| `POST /api/snowflake/explorer/selection-review` | app/modules/command_center/account_overview/snowflake_explorer/router.py:835 |
| `POST /api/snowflake/explorer/sync` | app/modules/command_center/account_overview/snowflake_explorer/router.py:734 |
| `POST /api/workspace/cache/install` | app/modules/recommendations/router.py:397 |
| `POST /api/workspace/saved-views` | app/modules/user_workspace/router.py:119 |
| `POST /api/workspace/touch` | app/modules/user_workspace/router.py:202 |

## (f) Unresolved GET endpoints (65) — declared but NOT exercised

Grouped by the first blocking path param: no live id was discoverable (empty list on this account, or an id type this harness does not seed — shareId/queryId/runId/widget/page/filter/conversation/stepId…). These are coverage holes, not failures.

| Blocking param | # | Endpoints (module.name) |
|---|---:|---|
| `id` | 34 | cortex.mlFinetuneJob, biDashboard.get, biDashboard.pages, biDashboard.page, biDashboard.widgets, |
| `name` | 13 | exploreDesign.dynamicTable, exploreDesign.stream, exploreDesign.streamData, workflow.gitReposito |
| `filePath` | 2 | connect.previewStageFile, connect.downloadStageFile |
| `deploymentId` | 2 | projects.deployment, exploreDesign.deploymentApprovers |
| `runId` | 2 | admin.runDetail, catalog.refreshStatus |
| `stepId` | 1 | workflow.step |
| `contributorId` | 1 | workflow.contributor |
| `taskId` | 1 | workflow.runLogs |
| `since` | 1 | observability.probesChanges |
| `tab` | 1 | commandCenter.tab |
| `queryId` | 1 | admin.apiHealthIntrospect |
| `release` | 1 | admin.listRuns |
| `v` | 1 | catalog.viewDdl |
| `path` | 1 | accountOverview.explorer |
| `p` | 1 | platform.path |
| `(eval/other)` | 1 | platform.accessSimulator |
| `key` | 1 | cacheService.keyValue |

---
_Generated by `e2e/_contract-sweep.mjs`. Resolver seeds: project, wfProject, edProject, db, schema, table, fqn, role, d360Role, connector, stage, catalogProduct, catalogKpi, monitor, computePool, deTask, permissionId, account, orgAccount, username._
