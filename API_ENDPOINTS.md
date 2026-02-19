# API Endpoints Actually Used in Pages — Workflow & Explore-Design

Only endpoints **verified as actually called from live (rendered) components**. Dead code, commented-out imports, and imported-but-never-called functions are excluded.

---

## 1. Explore-Design Module

**Entry:** `apps/data360/src/app/(dashboard)/explore-design/page.tsx`

### page.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/explore-design/guided/databases` | List Snowflake databases |
| GET | `/explore-design/guided/schemas/{database}` | List schemas in a database |
| GET | `/explore-design/guided/tables/{database}/{schema}` | List tables in a schema |
| GET | `/explore-design/guided/get_table_columns/?database_name=&schema_name=&table_name=` | Get columns for a table |
| GET | `/gouvernance/policies/MASKING` | Get masking policies |
| GET | `/explore-design/recent-deployment-errors?limit=10` | Fetch recent deployment errors |
| GET | `/api/v1/explore-design/{projectId}/ddl-actions` | List DDL actions |
| POST | `/api/v1/projects/{projectId}/events` | Add a project event |
| GET | `/api/v1/projects/{projectId}/events?module_name=EXPLORE-DESIGN` | List project events |
| GET | `/api/v1/projects/{projectId}/contributors` | List contributors |

### ProjectSelector.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/projects?project_type=explore_design&mine_only=true` | List explore-design projects |
| POST | `/api/v1/explore-design` | Create a new explore project |
| POST | `/api/v1/projects/{projectId}/contributors` | Add contributor on project create |
| GET | `/gouvernance/users` | Get users list (for team picker) |

### ColumnPreviewModal.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/columns/{column}/preview` | Preview column sample values |
| GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/columns/{column}/profile` | Get column profiling stats |

### TablePreviewModal.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/preview` | Preview table data rows |

### TableProfileModal.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/profile` | Get table profiling stats |

### CreateTableModal.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/explore-design/{projectId}/ddl-actions` | Add DDL action (CREATE TABLE) |

### RelationshipModal.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/explore-design/{projectId}/ddl-actions` | Add DDL action (FK create/remove) |

### DeploymentValidation.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/explore-design/{projectId}/versions?limit=20` | List schema versions |
| POST | `/api/v1/explore-design/{projectId}/ddl-actions` | Add DDL action |
| POST | `/api/v1/explore-design/{projectId}/ddl-actions/execute` | Execute pending DDL actions |
| POST | `/api/v1/explore-design/{projectId}/deployments` | Request a new deployment |
| POST | `/api/v1/explore-design/{projectId}/ingestion/schedule` | Schedule ingestion |
| POST | `/api/v1/explore-design/{projectId}/ingestion/execute` | Execute ingestion |
| PATCH | `/api/v1/projects/{projectId}/events/bulk-update` | Bulk update events |
| POST | `/api/v1/projects/{projectId}/rollback` | Rollback to a version |
| POST | `/cortex/recommend` | Get Cortex AI recommendation |

### DwhLocationPickerModal.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/explore-design/guided/databases` | List Snowflake databases |

### PolicyAssignmentPanel.tsx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gouvernance/policies/MASKING` | Get masking policies |
| GET | `/gouvernance/policies/ROW_ACCESS` | Get RLS policies |
| GET | `/gouvernance/policies/AGGREGATION` | Get aggregation policies |
| GET | `/gouvernance/policies/tags/list` | Get tags |
| GET | `/gouvernance/policies/objects/{db}/{schema}/{table}/policies` | Get table policies |
| POST | `/gouvernance/policies/masking/apply` | Apply masking policy |
| POST | `/gouvernance/policies/masking/replace` | Replace masking policy |
| POST | `/gouvernance/policies/row-access/apply` | Apply RLS policy |
| POST | `/gouvernance/policies/row-access/replace` | Replace RLS policy |
| POST | `/gouvernance/policies/tags/apply` | Apply tag |
| POST | `/gouvernance/policies/aggregation/apply` | Apply aggregation policy |

> **Dead imports in this file (NOT called):** `removeMaskingPolicy`, `removeRLSPolicy`, `removeTag`, `removeAggregationPolicy`

---

### Consolidated — Explore-Design (deduplicated, 36 unique endpoints)

| # | Method | Endpoint |
|---|--------|----------|
| 1 | GET | `/explore-design/guided/databases` |
| 2 | GET | `/explore-design/guided/schemas/{database}` |
| 3 | GET | `/explore-design/guided/tables/{database}/{schema}` |
| 4 | GET | `/explore-design/guided/get_table_columns/?database_name=&schema_name=&table_name=` |
| 5 | GET | `/explore-design/recent-deployment-errors?limit=N` |
| 6 | GET | `/gouvernance/policies/MASKING` |
| 7 | GET | `/gouvernance/policies/ROW_ACCESS` |
| 8 | GET | `/gouvernance/policies/AGGREGATION` |
| 9 | GET | `/gouvernance/policies/tags/list` |
| 10 | GET | `/gouvernance/policies/objects/{db}/{schema}/{table}/policies` |
| 11 | POST | `/gouvernance/policies/masking/apply` |
| 12 | POST | `/gouvernance/policies/masking/replace` |
| 13 | POST | `/gouvernance/policies/row-access/apply` |
| 14 | POST | `/gouvernance/policies/row-access/replace` |
| 15 | POST | `/gouvernance/policies/tags/apply` |
| 16 | POST | `/gouvernance/policies/aggregation/apply` |
| 17 | GET | `/gouvernance/users` |
| 18 | GET | `/api/v1/projects?project_type=explore_design&mine_only=true` |
| 19 | POST | `/api/v1/explore-design` |
| 20 | GET | `/api/v1/projects/{projectId}/contributors` |
| 21 | POST | `/api/v1/projects/{projectId}/contributors` |
| 22 | GET | `/api/v1/projects/{projectId}/events?module_name=EXPLORE-DESIGN` |
| 23 | POST | `/api/v1/projects/{projectId}/events` |
| 24 | PATCH | `/api/v1/projects/{projectId}/events/bulk-update` |
| 25 | POST | `/api/v1/projects/{projectId}/rollback` |
| 26 | GET | `/api/v1/explore-design/{projectId}/ddl-actions` |
| 27 | POST | `/api/v1/explore-design/{projectId}/ddl-actions` |
| 28 | POST | `/api/v1/explore-design/{projectId}/ddl-actions/execute` |
| 29 | GET | `/api/v1/explore-design/{projectId}/versions?limit=20` |
| 30 | POST | `/api/v1/explore-design/{projectId}/deployments` |
| 31 | POST | `/api/v1/explore-design/{projectId}/ingestion/schedule` |
| 32 | POST | `/api/v1/explore-design/{projectId}/ingestion/execute` |
| 33 | GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/preview` |
| 34 | GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/profile` |
| 35 | GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/columns/{col}/preview` |
| 36 | GET | `/api/v1/explore-design/{projectId}/tables/{db}/{schema}/{table}/columns/{col}/profile` |
| 37 | POST | `/cortex/recommend` |

---

## 2. Workflow Module

**Entry:** `apps/data360/src/app/(dashboard)/workflow/page.tsx`

> `page.tsx` always renders `ETLPipelineBuilder`. The `WorkflowHomePage` component is defined but **never rendered** (dead code). Components only mounted from `WorkflowHomePage` (`VersionHistory`, `DeploymentHistory`, `DeploymentScheduler`, `ExecutionHistory`, `WorkflowCard`, `Workflow.tsx`) are all dead.

### ETLPipelineBuilder.tsx (live — main rendered component)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/projects?project_type=workflow&mine_only=true` | List workflow projects |
| GET | `/api/v1/projects/{projectId}/contributors` | List contributors |
| POST | `/api/v1/workflows` | Create a new workflow |
| GET | `/api/v1/workflows/{workflowId}/steps` | List workflow steps |
| POST | `/api/v1/workflows/{workflowId}/steps` | Add a step |
| DELETE | `/api/v1/workflows/{workflowId}/steps/{stepId}` | Delete a step |
| POST | `/api/v1/workflows/{workflowId}/execute` | Execute workflow |
| POST | `/api/v1/workflows/{workflowId}/compile` | Compile workflow (Preview SQL) |
| POST | `/api/v1/workflows/{workflowId}/validate` | Validate workflow |

### ETLConfigSidebar.tsx (live — rendered inside ETLPipelineBuilder)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/explore-design/guided/databases` | List Snowflake databases |
| GET | `/explore-design/guided/schemas/{database}` | List schemas |
| GET | `/explore-design/guided/tables/{database}/{schema}` | List tables |
| GET | `/explore-design/guided/get_table_columns/?database_name=&schema_name=&table_name=` | Get table columns |

### ETLExecutionHistory.tsx (live — rendered inside ETLPipelineBuilder)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/workflows/{workflowId}/runs?limit=50&status=` | List execution runs (auto-refreshes) |

### ScheduleManager.tsx (live — rendered inside ETLPipelineBuilder)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/workflows/{workflowId}/schedules` | Get workflow schedules |
| POST | `/api/v1/workflows/{workflowId}/schedule` | Create a new schedule |
| POST | `/api/v1/workflows/{workflowId}/task/suspend` | Suspend scheduled task |
| POST | `/api/v1/workflows/{workflowId}/task/resume` | Resume scheduled task |
| GET | `/api/v1/workflows/{workflowId}/runs?limit=20` | List runs (schedule history) |

### Dead code components (NOT rendered — mounted only from WorkflowHomePage)

These components exist and have valid API calls but are **never reached** from the live page:

| Component | Dead Endpoints |
|-----------|---------------|
| `VersionHistory.tsx` | `GET /api/v1/workflows/{id}/versions`, `POST /api/v1/workflows/{id}/rollback` |
| `DeploymentHistory.tsx` | `GET /api/v1/workflows/{id}/deployments`, `POST .../approve`, `POST .../reject`, `POST .../execute` |
| `DeploymentScheduler.tsx` | `POST /api/v1/workflows/{id}/deployments`, `POST .../execute` |
| `ExecutionHistory.tsx` | `GET /api/v1/workflows/{id}/runs` |
| `Workflow.tsx` | mapping endpoints (getDatabases, getSchemas, getTables, getTableColumns) |
| `WorkflowHomePage` | `PATCH /api/v1/projects/{id}`, scheduling, execution |

---

### Consolidated — Workflow LIVE endpoints (deduplicated, 18 unique)

| # | Method | Endpoint |
|---|--------|----------|
| 1 | GET | `/api/v1/projects?project_type=workflow&mine_only=true` |
| 2 | GET | `/api/v1/projects/{projectId}/contributors` |
| 3 | POST | `/api/v1/workflows` |
| 4 | GET | `/api/v1/workflows/{workflowId}/steps` |
| 5 | POST | `/api/v1/workflows/{workflowId}/steps` |
| 6 | DELETE | `/api/v1/workflows/{workflowId}/steps/{stepId}` |
| 7 | POST | `/api/v1/workflows/{workflowId}/execute` |
| 8 | POST | `/api/v1/workflows/{workflowId}/compile` |
| 9 | POST | `/api/v1/workflows/{workflowId}/validate` |
| 10 | GET | `/api/v1/workflows/{workflowId}/runs` |
| 11 | GET | `/api/v1/workflows/{workflowId}/schedules` |
| 12 | POST | `/api/v1/workflows/{workflowId}/schedule` |
| 13 | POST | `/api/v1/workflows/{workflowId}/task/suspend` |
| 14 | POST | `/api/v1/workflows/{workflowId}/task/resume` |
| 15 | GET | `/explore-design/guided/databases` |
| 16 | GET | `/explore-design/guided/schemas/{database}` |
| 17 | GET | `/explore-design/guided/tables/{database}/{schema}` |
| 18 | GET | `/explore-design/guided/get_table_columns/?database_name=&schema_name=&table_name=` |

---

## Summary

| Module | Live Unique Endpoints |
|--------|-----------------------|
| Explore-Design | 37 |
| Workflow | 18 |
| Shared (mapping/guided) | 4 (used by both) |
| **Total unique** | **~51** |
