# Endpoint Catalog for FE Hooks — 2026-06-23

> Auto-generated from source. Read-only reference. ~47 endpoints across 10 modules.
> Source files: `apps/data360/src/app/services/`, `apps/data360/src/lib/api-contracts.ts`

---

## How to read this table

- `req*` = required param; `opt` = optional
- **Source column**: `path` = URL path segment, `query` = `?param=`, `body` = JSON request body
- `POLICIES_API` = `/gouvernance/policies`
- `ED` = `/explore-design`
- Backend base: `NEXT_PUBLIC_API_URL` (SSR) or `/api-proxy` (client)

---

## 1. Governance — Roles & Users

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `getRoles` | GET `/gouvernance/roles` | — | `[{ role_name, created_on, granted_roles, granted_to_roles }]` | Returns raw Snowflake role rows; admin-only in practice |
| `addRole` | POST `/gouvernance/add-role` | `role_name*` (body) | `{ message }` | 409 if role already exists |
| `deleteRole` | DELETE `/gouvernance/drop-role` | `role_name*` (query) | `{ success, message }` | Irreversible; no cascade check client-side |
| `deleteMultipleRoles` | POST `/gouvernance/drop-roles-batch` | `role_names*` (body array) | `{ success, failed[] }` | No `/drop-roles-batch` backend route confirmed (TODO in api-contracts.ts); loop client-side as fallback |
| `getUsers` | GET `/gouvernance/users` | — | `[{ username, email, status, roles[], created_on }]` | Returns all non-system users |
| `addUser` | POST `/gouvernance/add-user` | `username*`, `password*`, `email*`, `role?`, `first_name?`, `last_name?` (body) | `{ success, message, user_id }` | 400 if username already exists |
| `assignRoleToUser` | POST `/gouvernance/assign-role` | `username*`, `role_name*` (body) | `{ message }` | — |
| `disableUser` | POST `/gouvernance/disable_user/?username=<name>` | `username*` (query via URL) | `{ success, message }` | Trailing slash in path — send as query param encoded in the URL, not body |
| `enableUser` | POST `/gouvernance/enable_user/?username=<name>` | `username*` (query via URL) | `{ success, message }` | Same trailing-slash pattern as disableUser |
| `getD360Roles` | GET `/gouvernance/d360-roles` | — | `[{ name, label, description, permissions{} }]` | D360 granular roles (not Snowflake native roles) |
| `getMyPermissions` | GET `/gouvernance/d360-roles/my-permissions` | — | `{ modules: { [moduleId]: { allowed_actions[] } } }` | Used by `useCanPerform` hook; fail-open on hard errors; invalidate with `invalidateMyPermissions()` after any permission edit |
| `getRolePermissions` | GET `/gouvernance/d360-roles/{role}/permissions` | `role*` (path) | `{ role, permissions{} }` | — |
| `setRolePermissions` | PUT `/gouvernance/d360-roles/{role}/permissions` | `role*` (path), `permissions{}*` (body) | `{ role, permissions{} }` | Must call `invalidateMyPermissions()` after success |
| `applyTemplate` | POST `/gouvernance/d360-roles/{role}/apply-template` | `role*` (path), `template_name*` (body) | `{ success, message }` | Templates listed by `getD360RoleTemplates()` (GET `/gouvernance/d360-roles/templates`) |
| `getEffectiveUserPermissions` | GET `/gouvernance/d360-roles/users/{username}/effective-permissions` | `username*` (path) | `{ effective_permissions[], module_summaries[] }` | Heavy call — shows resolved cross-role permissions |

---

## 2. Governance — Policies

> **Base constant**: `POLICIES_API = '/gouvernance/policies'`
>
> **Key pattern**: Create/apply endpoints all use **null body + `{ params }` (query params)** — never a JSON body.

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `listPoliciesEnriched` | GET `/gouvernance/policies` | `database*`, `schema*` (query) | `{ masking[], row_access[], aggregation[], total }` | Unified inventory — use this instead of per-type list routes (no dedicated `/masking/list`, `/aggregation/list` routes exist = 405) |
| `getMyScopePolicies` | GET `/gouvernance/policies/my-scope` | — | `{ manageable_by_me[], references_my_role[], total }` | NOT admin-gated; shows role-scoped policies for the caller |
| `getRLSPolicies` | GET `/gouvernance/policies` | `database?`, `schema?` (query) | `[{ policy_name, schema, body, created_on, granted_roles[] }]` | Extracts `row_access` key from unified endpoint response |
| `createRLSPolicy` | POST `/gouvernance/policies/row-access` | `policy_name*`, `signature*`, `expression*`, `database?`, `schema?`, `description?` (all query params, null body) | `{ policy_name, schema, body }` | **null body + query params only** — sending JSON body causes 422 |
| `applyRLSPolicy` | POST `/gouvernance/policies/row-access/apply` | `policy_name*`, `table_name*`, `database*`, `schema*`, `policy_column*`, `policy_schema?` (all query params, null body) | — | `table_name` query param is required (not in path) |
| `createMaskingPolicy` | POST `/gouvernance/policies/masking` | `policy_name*`, `data_type*`, `masking_type*` (MaskingType enum), `database?`, `schema?`, `custom_expression?` (all query params, null body) | `{ policy_name, data_type, masking_type }` | `masking_type` must be `MaskingType` enum: `'FULL_MASK'|'PARTIAL_MASK'|'HASH'|'DATE_TRUNCATE'|'CUSTOM'` |
| `applyMaskingPolicy` | POST `/gouvernance/policies/masking/apply` | `policy_name*`, `database*`, `schema*`, `table*`, `column*`, `policy_schema?` (all query params, null body) | — | Use `table`/`column` keys (NOT `table_name`/`column_name` — those are the `/masking/replace` contract) |
| `createAggregationPolicy` | POST `/gouvernance/policies/aggregation` | `policy_name*`, `aggregation_constraint*`, `database?`, `schema?` (query params, null body) | `{ policy_name, aggregation_constraint }` | `aggregation_constraint` is the GROUP BY expression string |
| `applyAggregationPolicy` | POST `/gouvernance/policies/aggregation/apply` | `policy_name*`, `database*`, `schema*`, `table*` (query params, null body) | — | No `column` param needed (table-level policy) |
| `getNetworkPolicies` | GET `/gouvernance/policies/network/list` | — | `[{ name, allowed_ip_list[], blocked_ip_list[], created_on }]` | Separate endpoint; not in unified `/gouvernance/policies` response |
| `createNetworkPolicy` | POST `/gouvernance/policies/network` | `policy_name*`, `allowed_ip_list*[]`, `blocked_ip_list?[]` (query params, null body) | `{ name, allowed_ip_list[] }` | IP lists passed as query params (comma-separated or repeated param) |
| `setNetworkPolicyAsDefault` | POST `/gouvernance/policies/network/{policy_name}/set-default` | `policy_name*` (path) | `{ message }` | — |
| `getTags` | GET `/gouvernance/policies/tags/list` | — | `[{ tag_name, schema, data_type, comment }]` | Note: path is `tags/list` not just `tags` |
| `createTag` | POST `/gouvernance/policies/tags` | `tag_name*`, `data_type?`, `comment?` (query params, null body) | `{ tag_name, schema }` | — |
| `applyTag` | POST `/gouvernance/policies/tags/apply` | `tag_name*`, `object_type*`, `object_name*`, `value?` (query params, null body) | — | `object_type` = `'TABLE'|'COLUMN'|'SCHEMA'|'DATABASE'` |
| `getPasswordPolicies` | GET `/gouvernance/policies/password/list` | — | `[{ name, password_min_length, history, lockout_time_mins }]` | Separate route; password+session policies backend is partially unimplemented |
| `getSessionPolicies` | GET `/gouvernance/policies/session/list` | — | `[{ name, session_idle_timeout_mins, session_ui_idle_timeout_mins }]` | Same caveat as password policies |

---

## 3. Governance — Security Matrix & Grants

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `initializeSecurityMatrix` | POST `/gouvernance/security-matrix/init` | — | `{ message }` | Admin-only; creates the matrix tables on first use |
| `getSecurityMatrix` | GET `/gouvernance/security-matrix` | `bustCache?` (query: `_ts` timestamp) | `{ entries[], axes[], total }` | Set `bustCache=true` to bypass server cache |
| `createSecurityMatrixEntry` | POST `/gouvernance/security-matrix` | `role*`, `axis_id*`, `value*` (body) | `{ id, role, axis_id, value }` | — |
| `batchUpdateSecurityMatrix` | PUT `/gouvernance/security-matrix/batch` | `updates[{id, value}]*` (body) | `{ updated[], failed[] }` | Preferred over per-row PUT for bulk ops |
| `getRoles` (grants) | GET `/gouvernance/grants` | — | `[{ role_name, modules[], grantable }]` | Returns module-grant data (not raw Snowflake grants) |
| `updateGrants` | PUT `/gouvernance/update-grants` | `role_name*`, `modules*[]` (body) | `{ success, message }` | Replaces the full module grant list — not additive |
| `getEnterpriseUsers` | GET `/gouvernance/enterprise-users` | — | `[{ username, email, department, cost_center, last_login }]` | — |
| `syncEnterpriseUsers` | POST `/gouvernance/enterprise-users/sync` | — | `{ synced, created, updated, errors[] }` | Pulls from external IdP |

---

## 4. Governance — DMF (Classification)

> **Prefix**: `/gouvernance/policies` (via `POLICIES_API`) for classification; `/gouvernance/policies/dmf/...` for DMF management

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `listDMFs` | GET `/gouvernance/policies/dmf/list` | `database?`, `schema?` (query) | `[{ name, database, schema, description, columns[] }]` | — |
| `createDMF` | POST `/gouvernance/policies/dmf` | `function_name*`, `data_type*`, `target_column*`, `condition_column?` (query params, null body) | `{ name, created }` | All params via query string; null body |
| `associateDMF` | POST `/gouvernance/policies/dmf/associate` | `function_name*`, `table_fqn*`, `target_columns*[]` (query params, null body) | `{ message }` | `table_fqn` format: `DB.SCHEMA.TABLE` |
| `disassociateDMF` | POST `/gouvernance/policies/dmf/disassociate` | `function_name*`, `table_fqn*` (query params, null body) | `{ message }` | — |
| `classifyTable` | POST `/gouvernance/policies/classification/classify` | `table_name*`, `database?`, `schema?` (body) | `{ classifications[], semantic_tags[], confidence_scores[] }` | AI-backed; may be slow (3–15s); calls Cortex internally |
| `extractSemanticCategories` | POST `/gouvernance/policies/classification/extract-categories` | `database*`, `schema*` (body) | `{ categories[], tables_scanned }` | Schema-wide operation — may timeout on large schemas |
| `getDMFReferences` | GET `/gouvernance/policies/dmf/references` | `table_name*` (query) | `[{ function_name, target_column, schedule, last_run }]` | Returns DMF associations for a single table |

---

## 5. Explore-Design

> **Base constant**: `ED = '/explore-design'`

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `createExploreProject` | POST `/explore-design` | `project_name*`, `description?`, `project_type?` (body) | `{ project_id, project_name, created_at }` | `project_type` should be `'EXPLORE_DESIGN'` |
| `getExploreProject` | GET `/explore-design/{project_id}` | `project_id*` (path) | `{ project_id, project_name, status, tables[], events[] }` | — |
| `tableProfile` | GET `/explore-design/{project_id}/tables/{db}/{schema}/{table}/profile` | `project_id*`, `database*`, `schema*`, `table*` (path), `sample_size?` (query) | `{ row_count, col_count, columns[{name, type, null_pct, unique_count}] }` | Can be slow (>5s) on large tables |
| `tablePreview` | GET `/explore-design/{project_id}/tables/{db}/{schema}/{table}/preview` | `project_id*`, `database*`, `schema*`, `table*` (path), `limit?` (query, default 100) | `{ columns[], rows[][] }` | — |
| `detectRelations` (legacy, explore/index.ts) | GET `/explore-design/smart/detect-fk` | `source_tables*`, `target_tables*` (query, dot-separated FQNs), `sample_size?` (query) | `{ detected_relations[], suggestions[] }` | Silently returns empty on error — check console |
| `detectRelations` (new, exploreDesignApi.ts) | POST `/explore-design/{project_id}/ai/discover-relationships` | `project_id*` (path), `tables[{database, schema, table_name}]*` (body) | `{ relationships[{source_table, source_column, target_table, target_column, confidence}] }` | Errors NOT swallowed here — wizard falls back to name-match heuristics only on throw |
| `recordEvent` | POST `/explore-design/{project_id}/events` | `project_id*` (path), `event_type*` (EventType enum), `target{database, schema, table, column?}*`, `payload{}*` (body) | `{ event_id, status }` | `event_type` must be one of the `EventType` enum values (TABLE_SELECTED, COLUMN_RENAMED, etc.) |
| `executeIngestion` | POST `/explore-design/{project_id}/ingestion/execute` | `project_id*` (path), `mode*` (IngestionMode enum), `tables[]*`, `mappings?[]` (body) | `{ status, rows_loaded, duration_ms }` | `mode` enum: `'full_refresh'|'incremental'|'snapshot'|'scd_type1'|'scd_type2'|'scd_type3'` |
| `scheduleIngestion` | POST `/explore-design/{project_id}/ingestion/schedule` | `project_id*` (path), `cron_expression*`, `mode*`, `tables[]*` (body) | `{ task_name, schedule, status }` | Cron format: Snowflake task CRON (`USING CRON expr tz`) |
| `createDeployment` | POST `/explore-design/{project_id}/deployments` | `project_id*` (path), `version*`, `deployment_type*` (DeploymentType enum), `event_ids*[]`, `config?` (body) | `{ deployment_id, status, approval_required, approval_request_id? }` | Field must be `deployment_type` (NOT `type` alone) — sending only `type` causes 400 "Field required"; send both for back-compat |
| `executeDeployment` | POST `/explore-design/{project_id}/deployments/{deployment_id}/execute` | `project_id*`, `deployment_id*` (path), `rollback_on_error?` (body) | `{ status, results[], summary{applied, failed, skipped} }` | No single-deployment GET route exists — use `listDeployments` |
| `addDDLAction` | POST `/explore-design/{project_id}/ddl-actions` | `project_id*` (path), `ddl_sql*`, `ddl_type?`, `priority?`, `target_table?`, `description?` (body) | `{ event_id, ddl_sql, status }` | Batch DDL endpoint (`/ddl-actions/batch`) does NOT exist on backend — falls back to per-action loop |
| `listMappings` | GET `/explore-design/{project_id}/mappings` | `project_id*` (path) | `{ mappings[] }` | Route does NOT exist on backend; callers receive an empty list silently. Mappings travel inside ingestion payloads |

---

## 6. Data Quality

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `runBuiltinDmfCheck` | POST `/data-quality/projects/{project_id}/dmf-check` | `project_id*` (path), `table_name*`, `database?`, `schema?` (body) | `{ results[], total, passed, failed }` | Project-scoped; requires an active explore-design project |
| `getDmfResults` | GET `/data-quality/projects/{project_id}/dmf-results` | `project_id*` (path), `database?`, `schema?`, `table?` (query) | `[{ metric, value, threshold, status }]` | — |
| `suggestDmfs` | GET `/data-quality/projects/{project_id}/dmf-suggest` | `project_id*` (path), `table_fqn?` (query) | `[{ metric, reasoning, priority }]` | AI-backed suggestions |
| `getQualitySummary` | GET `/data-quality/quality-summary` | `database*`, `days?` (query) | `{ overall_score, completeness, uniqueness, freshness, schema_quality, security }` | — |
| `getCompletenessMetrics` | GET `/data-quality/completeness-metrics` | `database*`, `days?` (query) | `[{ table_name, column_name, null_count, null_pct, last_run }]` | DMF-backed; requires DMFs to be associated first |
| `getTrendAnalysis` | GET `/data-quality/trend-analysis` | `database*`, `days?` (query) | `[{ date, avg_score, completeness, freshness }]` | — |
| `runQualityCheck` | POST `/data-quality/run-check` | `table*` or full `config{database, schema, table, thresholds[]}` (body) | `{ results[], overall_pass, duration_ms }` | Accepts both minimal `{ table }` and full config body |
| `setDmfThreshold` | POST `/data-quality/dmf/thresholds` | `table_fqn*`, `metric*`, `threshold*`, `operator?` (body) | `{ id, table_fqn, metric, threshold }` | — |
| ~~`getAnomalies`~~ | ~~GET `/data-quality/anomalies`~~ | — | — | **BACKEND GAP** — route does not exist; 404-self-disables |
| ~~`getSnapshot`~~ | ~~GET `/data-quality/snapshot`~~ | — | — | **BACKEND GAP** — route does not exist; closest is `/observability/dashboard` |

---

## 7. Command Center / Account Overview

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `getOverviewKpis` | GET `/command-center/overview-kpis` | `range?` (query: `'24h'|'7d'|'30d'|'90d'`, default `'30d'`) | `{ total_queries, total_credits, active_users, warehouse_count, … }` | Returns 404/400 if cache tables not provisioned — degrades to `emptyOverviewKpiPayload()` (safe empty). Must call `installOverviewKpis()` first on fresh installs |
| `refreshOverviewKpis` | POST `/command-center/overview-kpis/refresh` | `range?` (query) | — (204) | Different endpoint from GET; 404 degrades silently |
| `installOverviewKpis` | POST `/command-center/overview-kpis/install` | — | `{ status: 'ok'|'not-deployed'|'forbidden'|'error' }` | Admin-only; one-shot provisioning; 404 = endpoint not on this backend |
| `getTab` (generic) | GET `/command-center/tabs/{tab}` | `tab*` (path: one of TabId enum), `days?` (query) | `{ data{}, meta{} }` | `TabId` values: `'overview'|'snowflake-objects'|'finops'|'modules'|'org-accounts'|'platform-activity'|'projects'|'security'|'snowflake-accounts'` |
| `getSummary` | GET `/command-center/summary` | `days?` (query) | `{ users, warehouses, queries, credits, data_freshness }` | Executive summary; always-available fallback if overview-kpis fails |
| `getCostBreakdown` | GET `/command-center/cost-breakdown` | `days?` (query) | `{ by_warehouse[], by_service[], total_credits }` | — |
| `getProjectScoreCards` | GET `/command-center/projects/{id}/scores` | `id*` (path), `days?` (query) | `[{ dimension, value, unit, status, scope:'project'|'account', open_recos }]` | `scope='account'` means account-level fallback was used (not per-project data) — UI must label honestly |
| `getProjectRollup` | GET `/command-center/projects/{id}/rollup` | `id*` (path), `days?` (query) | `{ dq, perf, gov, storage, cost, reco_counts, last_deploy, served_from }` | `served_from='cache'` = from materialized table; `'live'` = cold-computed |
| `getActivityFeed` | GET `/command-center/activity-feed` | — | `[{ timestamp, module, action, user, details }]` | — |
| `getSecurityAudit` | GET `/command-center/security-audit` | `days?` (query) | `{ failed_logins, mfa_coverage, grant_changes[], suspicious_activity }` | — |

---

## 8. Cortex / AI

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `queryCortex` | POST `/cortex/query` | `prompt*`, `semantic_model?` (body) | `{ request_id, results[{type:'text'|'sql'|'suggestions', text?, query?, data?[], suggestions?[]}] }` | Multiple response envelope formats (direct / wrapped `{status, data}` / `response` key) — normalizes internally |
| `analystQuery` | POST `/cortex/analyst/query` | `question*`, `semantic_model_file?`, `semantic_view?` (body) | `{ sql, results[], row_count, columns[], method, text? }` | **Different endpoint from `/cortex/query`** — requires either `semantic_model_file` or `semantic_view` for best results; route verified at backend:cortex/router.py:1287 |
| `generateCompletion` | POST `/cortex/complete` | `prompt*`, `model?` (default `'mistral-7b'`), `guardrails?` (body) | `{ response, model }` | Model list from `GET /cortex/models`; never expose model names in customer-facing copy |
| `analyzeSentiment` | POST `/cortex/ml/sentiment` | `texts?[]`, `table_name?`, `text_column*` (body) | `[{ text, sentiment, category:'positive'|'negative'|'neutral' }]` | `text_column` is required even for inline texts mode (backend validation) — send `'inline'` as placeholder value |
| `listSemanticModels` | GET `/cortex/semantic-models/list` | — | `[{ name, stage_path, size_bytes, last_modified }]` | — |
| `getSemanticModelContent` | GET `/cortex/semantic-models/{name}` | `name*` (path, URL-encoded) | `{ name, content (YAML string) }` | — |
| `createSemanticModel` | POST `/cortex/semantic-models` | `name*`, `yaml_content*` (body) | `{ name, created }` | YAML must be valid (pass through `validateSemanticModelYaml()` first); invalid YAML = 422 |
| `generateSemanticModel` | POST `/cortex/semantic-models/generate` | `table_fqn*`, `include_relationships?`, `database?`, `schema?` (body) | `{ yaml_content, table_name, relationships_detected }` | Auto-generates from DDL; save separately with `generateAndSaveSemanticModel` or `createSemanticModel` |
| `listDatabases` (cortex) | GET `/cortex/explore/databases` | — | `[{ database_name, tables_count }]` | Used by Cortex explore feature for data context selection |

---

## 9. Observability

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `getIntelligentKpis` | GET `/observability/kpis` | — | `{ data_quality_score, governance_score, pipeline_health, active_alerts, … }` | Main health-score KPIs for intelligent page dashboard |
| `getDataLineage` | GET `/observability/lineage` | `database?`, `schema?`, `table?`, `days?` (query) | `{ nodes[], edges[], last_updated }` | From ACCESS_HISTORY; `days` defaults to 30 |
| `getSlowQueries` | GET `/observability/performance/slow-queries` | `days?`, `threshold_seconds?` (query) | `[{ query_id, query_text, duration_s, warehouse, user }]` | — |
| `getAlerts` | GET `/observability/alerts` | `days?` (query) | `[{ alert_id, type, severity, message, created_at, resolved }]` | Covers cost spikes, failed tasks, security findings |
| `getGdprComplianceReport` | GET `/observability/compliance/gdpr` | — | `{ score, findings[], recommendations[], assessed_at }` | — |
| `getSoc2ComplianceReport` | GET `/observability/compliance/soc2` | — | `{ score, controls[], gaps[], assessed_at }` | — |
| `getCostMonitors` | GET `/observability/cost/monitors` | — | `[{ name, credit_quota, used, remaining, warehouses[] }]` | Resource monitors list |
| `createCostMonitor` | POST `/observability/cost/monitors` | `name*`, `credit_quota*`, `frequency?`, `notify_users?[]` (body) | `{ name, credit_quota, status }` | — |
| `updateCostMonitor` | PUT `/observability/cost/monitors/{name}` | `name*` (path), `credit_quota?`, `frequency?` (body) | `{ name, credit_quota }` | — |
| `deleteCostMonitor` | DELETE `/observability/cost/monitors/{name}` | `name*` (path) | `{ message }` | — |
| `listSpendBudgets` | GET `/observability/budgets` | — | `[{ name, amount, spent, period }]` | — |
| `createSpendBudget` | POST `/observability/budgets` | `name*`, `amount*`, `period?` (body) | `{ name, amount }` | — |
| `getPlatformConfig` | GET `/observability/platform-config` | — | `[{ key, value, description, editable }]` | Admin-only platform config entries |
| `updatePlatformConfigEntry` | PUT `/observability/platform-config/{key}` | `key*` (path), `value*` (body) | `{ key, value }` | — |
| `probeTableFreshness` | GET `/observability/probes/table` | `table*` (query, FQN format) | `{ table, last_modified, age_hours, is_stale }` | — |
| `getSloTracking` | GET `/observability/slo-tracking` | `days?` (query) | `[{ slo_name, target_pct, actual_pct, error_budget_remaining }]` | — |

---

## 10. Workflow

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `getWorkflows` | GET `/workflow` | — | `[{ workflow_id, name, status, steps[], last_run_at }]` | Note: api-contracts.ts `.create()` helper returns `/workflow`; same path for GET/POST |
| `createWorkflow` | POST `/workflow` | `name*`, `description?`, `steps?[]` (body) | `{ workflow_id, name, status:'draft' }` | — |
| `executeWorkflow` | POST `/workflow/{id}/execute` | `id*` (path) | `{ message, task_id? }` | Triggers immediate run; use `getWorkflowRuns` to poll status |
| `scheduleWorkflow` | POST `/workflow/{id}/schedule` | `id*` (path), `cron_expression*`, `timezone?` (body) | `{ task_name, schedule }` | Creates a Snowflake Task |
| `suspendTask` | POST `/workflow/{id}/schedule/pause` | `id*` (path) | `{ message }` | Pauses the Snowflake Task |
| `getWorkflowRuns` | GET `/workflow/{id}/runs` | `id*` (path), `limit?`, `status?` (query) | `[{ run_id, status, started_at, completed_at, error? }]` | `status` filter: `'running'|'completed'|'failed'` |
| `createDeployment` (workflow) | POST `/workflow/{id}/deployments` | `id*` (path), `type*` (DeploymentStatus enum), `scheduled_at?`, `requires_approval?`, `description?` (body) | `{ deployment_id, status }` | `type` enum: `'immediate'|'with_approval'|'scheduled'` |
| `approveDeployment` | POST `/workflow/{id}/deployments/{depId}/approve` | `id*`, `depId*` (path), `comment?` (body) | `{ status, event_id, workflow_id, approved_by }` | — |
| `rejectDeployment` | POST `/workflow/{id}/deployments/{depId}/reject` | `id*`, `depId*` (path), `reason?` (body) | `{ status }` | — |
| `getWorkflowContributors` | GET `/workflow/{id}/contributors` | `id*` (path) | `[{ user_id, username, role:'owner'|'editor'|'viewer', added_at }]` | `ContributorRole` enum: `'owner'|'editor'|'viewer'` |
| `addWorkflowContributor` | POST `/workflow/{id}/contributors` | `id*` (path), `username*`, `role*` (ContributorRole) (body) | `{ user_id, role }` | — |
| `listGitRepositories` | GET `/workflow/git/repositories` | — | `[{ name, url, branch, last_fetched }]` | Snowflake Git repositories |
| `initializeTables` | POST `/workflow/setup/initialize-tables` | — | `{ message, tables_created[] }` | One-shot setup; idempotent |

---

## 11. BI Dashboard

> **Prefix**: `PREFIX = '/bi-dashboard'`

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `createDashboard` | POST `/bi-dashboard` | `name*`, `description?`, `project_id?` (body) | `{ dashboard_id, name, status:'draft' }` | — |
| `getDashboard` | GET `/bi-dashboard/{project_id}` | `project_id*` (path) | `{ dashboard_id, name, pages[], widgets[], filters[] }` | — |
| `createWidget` | POST `/bi-dashboard/{project_id}/widgets` | `project_id*` (path), `type*`, `title?`, `config{}*`, `page_id?` (body) | `{ widget_id, type, config }` | — |
| `listWidgets` | GET `/bi-dashboard/{project_id}/widgets` | `project_id*` (path), `page_id?` (query) | `[{ widget_id, type, title, config }]` | — |
| `renderDashboard` | POST `/bi-dashboard/{project_id}/render` | `project_id*` (path), `widgets[{widget_id, filters?}]*` (body) | `[{ widget_id, data, chart_config, error? }]` | `widgets` array required — pass all visible widget IDs with any active filters |
| `nlToChart` | POST `/bi-dashboard/nl-to-chart` | `question*`, `database?`, `schema?` (body) | `{ chart_config, valid, validation_errors?, question, execution_time_ms }` | `chart_config` is null if generation failed; check `valid` flag; errors are not thrown |
| `publishDashboard` | POST `/bi-dashboard/{project_id}/publish` | `project_id*` (path) | `{ status:'live', published_at, share_url? }` | Triggers activity log event; `isBiRouteUnavailable()` auto-detects 404/501 |
| `unpublishDashboard` | POST `/bi-dashboard/{project_id}/unpublish` | `project_id*` (path) | `{ status:'draft' }` | — |
| `getDashboardStatus` | GET `/bi-dashboard/{project_id}/status` | `project_id*` (path) | `{ status:'draft'|'live', share_count, published_at? }` | — |
| `shareDashboard` | POST `/bi-dashboard/{project_id}/share` | `project_id*` (path), `target_user?`, `target_d360_role?` (body) | `{ share_id, target }` | Either `target_user` OR `target_d360_role` required |
| `autoCreateDashboard` | POST `/bi-dashboard/auto-create` | `source_table*`, `database?`, `schema?`, `name?` (body) | `{ dashboard_id, widgets_created, status }` | AI-powered; may be slow |
| `saveSnapshot` | POST `/bi-dashboard/{project_id}/snapshot` | `project_id*` (path) | `{ snapshot_id, created_at }` | Version pin — saves current layout/data |
| `exportDashboard` | GET `/bi-dashboard/{project_id}/export` | `project_id*` (path) | Binary blob (PDF/Excel) | Returns Blob; handle with `responseType: 'blob'` |
| `isBiRouteUnavailable` | (helper, not a call) | `error` object | `boolean` | Returns true if 404 or 501 — used to auto-disable BI actions when routes not yet deployed |

---

## 12. Org-Accounts

> **Base URL**: `BASE_URL = '/org-accounts'`

| Function | Method + Path | Inputs (req*/opt) | Output keys | Gotchas |
|---|---|---|---|---|
| `getDashboardOverview` | GET `/org-accounts/dashboard/overview` | — | `{ total_accounts, active_accounts, total_credits_used, alerts_count }` | Fast (~1s) overview summary |
| `getAccounts` | GET `/org-accounts/accounts` | `filters?{status, region, account_type}` (query) | `[{ account_name, status, region, edition, credits_used }]` | — |
| `getAccountDetail` | GET `/org-accounts/accounts/{accountName}` | `accountName*` (path, URL-encoded) | `{ account_name, status, warehouses[], users[], credit_history[] }` | — |
| `dropAccount` | DELETE `/org-accounts/accounts/{accountName}` | `accountName*` (path), `confirmation_text*` (query or body) | `{ dropped, message }` | **Irreversible** — requires `confirmation_text` matching the account name; ORGADMIN role required |
| `createAccount` | POST `/org-accounts/accounts` | `account_name*`, `admin_name*`, `admin_password*`, `email*`, `edition?`, `region?` (body) | `{ account_name, status, provisioning_url }` | Marked beta in UI — disabled by default |
| `suspendAccount` | POST `/org-accounts/accounts/{name}/suspend` | `name*` (path) | `{ success, message }` | — |
| `activateAccount` | POST `/org-accounts/accounts/{name}/activate` | `name*` (path) | `{ success, message }` | — |
| `getCredits` | GET `/org-accounts/credits` | `days?` (query, default 30) | `{ total_credits, by_service[{service, credits}], trend[] }` | — |
| `getTopConsumers` | GET `/org-accounts/credits/top` | `days?`, `limit?` (query, defaults: 30, 10) | `[{ account_name, credits, pct_of_total }]` | — |
| `getStorage` | GET `/org-accounts/organization/storage` | — | `{ total_tb, active_tb, time_travel_tb, failsafe_tb }` | From ORGANIZATION_USAGE view — requires orgadmin-level access |
| `getBalance` | GET `/org-accounts/organization/remaining-balance` | — | `{ remaining_credits, contract_end_date }` | — |
| `getOrganizationCosts` | GET `/org-accounts/organization/costs` | `days?` (query, default 30) | `{ costs_by_account[], trend[], total }` | 60-second timeout set explicitly — can be slow |
| `getLogins` | GET `/org-accounts/logins` | `days?` (query, default 30) | `[{ account_name, successful_logins, failed_logins }]` | — |
| `getFailedLogins` | GET `/org-accounts/logins/failed` | `days?` (query, default 7) | `[{ account_name, username, timestamp, error }]` | — |
| `setAccountMfaEnforcement` | PATCH `/org-accounts/accounts/{name}/mfa` | `name*` (path), `enforced*` (body boolean) | `{ success, mfa_enforced }` | — |

---

## Known Backend Gaps (404-self-disable)

Routes confirmed missing from the backend (verified vs backend route manifests). These use the 404-self-disable pattern — components using `InsightActionButton` or `isBiRouteUnavailable()` will degrade automatically.

| Route | Module | Notes |
|---|---|---|
| `GET /data-quality/anomalies` | Data Quality | ML anomaly results; no backend implementation. Closest available: `/observability/alerts` |
| `GET /data-quality/snapshot` | Data Quality | Fan-out 9-dimension snapshot endpoint. Not implemented. |
| `GET /data-quality/anomaly-detection` | Data Quality | ML anomaly detection trigger. Not implemented. |
| `POST /explore-design/{id}/mappings` | Explore-Design | Column mapping CRUD via dedicated route. Mappings must travel inside ingestion payload. |
| `POST /explore-design/{id}/ddl-actions/batch` | Explore-Design | Batch DDL; FE falls back to per-action loop. |
| `GET /explore-design/{id}/deployments/{depId}` | Explore-Design | Single deployment GET; explicitly throws `not implemented`. Use `listDeployments`. |
| `GET /command-center/overview-kpis` (on fresh install) | Command Center | Returns 404/400 until `installOverviewKpis()` provisions the cache table/proc. |
| `GET /admin/cache/coverage` | Admin | Forward contract — `/admin/cache/*` routes degrade to "not available" notice. |
| `GET /admin/cache/svc-health` | Admin | Same forward contract. |
| `GET /admin/cache/warm-status` | Admin | Same forward contract. |
| `GET /gouvernance/policies/password/list` + `session/list` | Governance | Password/session policy backend partially unimplemented. |
| `POST /gouvernance/drop-users-batch` | Governance | No backend batch route (documented TODO). Loop `drop-user` client-side. |

---

## Cross-Cutting Gotchas

1. **Policies use null body + query params** — All governance policy create/apply endpoints (`/row-access`, `/masking`, `/aggregation`, `/network`, `/tags`, `/password`, `/session`) send `null` as the request body and all parameters as `?query=params`. Sending a JSON body causes 422.

2. **`deployment_type` not `type`** — `POST /explore-design/{id}/deployments` requires the field named `deployment_type` (not `type`). Send both for back-compat with older backends.

3. **`table` vs `table_name`** — In `/masking/apply`, use `table` and `column` query params. In `/masking/remove`, use `table_name`. These are different backend contracts.

4. **`installOverviewKpis()` prerequisite** — `GET /command-center/overview-kpis` returns 404 on fresh installs until the admin runs `installOverviewKpis()`. The FE degrades to an empty payload — but if ALL KPI tiles are blank, check provisioning first, not FE bugs.

5. **`isBiRouteUnavailable(err)`** — Must wrap all BI Dashboard calls with this helper. A 404 or 501 indicates the backend route is not yet deployed; consumers should disable themselves (never bubble as a user error).

6. **DMF/classification calls can be slow** — `classifyTable()` and `extractSemanticCategories()` invoke Cortex AI internally. Expect 3–15s on tables with many columns. Show a loading spinner; do not set a short axios timeout.

7. **`analystQuery` vs `queryCortex`** — These are two different backend routes with different input/output contracts. `analystQuery` requires a semantic model or semantic view and returns structured `{ sql, results[], columns[] }`. `queryCortex` is a raw NL chat endpoint and returns `{ request_id, results[{type, text?, query?}] }`.

8. **`dropAccount` is irreversible** — Requires `confirmation_text` matching the account name. ORGADMIN role is required. There is no undo.

9. **`getSemanticModelContent` name encoding** — The `name` path param must be URL-encoded. File names with slashes or spaces will break without `encodeURIComponent`.

10. **Cortex vendor name leakage** — Never render the words "Cortex", "Snowflake", or model names in customer-facing copy. Use "AI", "analytics engine", "data warehouse". Vendor names allowed only in architecture/admin views.
