# Data360 — Workflow Module API Reference (v2)

Base URL: `/api/v1/workflows`
Auth: Bearer JWT token (all endpoints require authentication)

---

## Architecture: CTE Pipeline Engine

Steps are stored as a JSON array in `PROJECTS.METADATA.steps` (no separate table). Each step has:
- `step_id` — unique identifier (auto-generated)
- `step_order` — position in the list
- `action_type` — the component type (src, join_tables, filter_rows, destination, etc.)
- `step_name` — display name
- `description` — optional description
- `payload` — JSON dict with template variables + two reserved keys:
  - `inputs`: list of step_ids this step reads from (empty for `src`)
  - `cte_alias`: optional CTE name (auto-generated from step_name if omitted)

At execution, the engine **topologically sorts** the DAG and compiles all steps into a single SQL `WITH ... AS` chain. The `destination` step materializes the result into a physical Snowflake table. Step execution status is tracked per-run in run details (not persisted on the step itself).

### Component Types & Payload Keys

| action_type | inputs | payload keys | SQL template |
|---|---|---|---|
| **src** | `[]` (none) | `database_name`, `schema_name`, `table_name` | `SELECT * FROM {database_name}.{schema_name}.{table_name}` |
| **destination** | 1 input | `database_name`, `schema_name`, `table_name`, `destination_columns_str` | `CREATE TABLE ... AS ... SELECT {destination_columns_str} FROM {input}` |
| **join_tables** | 2 inputs | `left_columns_aliased`, `right_columns_aliased`, `join_type`, `left_key`, `right_key` | `SELECT ... FROM {left_input} a {join_type} JOIN {right_input} b ON a.{left_key} = b.{right_key}` |
| **filter_rows** | 1 input | `filter_condition` | `SELECT * FROM {input} WHERE {filter_condition}` |
| **sort** | 1 input | `order_by` | `SELECT * FROM {input} ORDER BY {order_by}` |
| **distinct** | 1 input | _(none)_ | `SELECT DISTINCT * FROM {input}` |
| **deduplicate** | 1 input | `columns` | `SELECT DISTINCT {columns} FROM {input}` |
| **rename_col** | 1 input | `old_name`, `new_name` | `SELECT * EXCLUDE ({old_name}), {old_name} AS {new_name} FROM {input}` |
| **set_col_value** | 1 input | `column`, `value` | `SELECT *, '{value}' AS {column} FROM {input}` |
| **normalize_col** | 1 input | `column` | `SELECT * EXCLUDE ({column}), UPPER(TRIM({column})) AS {column} FROM {input}` |
| **cast** | 1 input | `column`, `target_type` | `SELECT * EXCLUDE ({column}), CAST({column} AS {target_type}) AS {column} FROM {input}` |
| **formula** | 1 input | `expression`, `output_column` | `SELECT *, {expression} AS {output_column} FROM {input}` |
| **aggregate_kpi** | 1 input | `group_by_columns`, `agg_type`, `column`, `new_kpi_name` | `SELECT {group_by_columns}, {agg_type}({column}) AS {new_kpi_name} FROM {input} GROUP BY {group_by_columns}` |
| **clustering** | 1 input | `cluster_expression`, `cluster_column` | `SELECT *, {cluster_expression} AS {cluster_column} FROM {input}` |
| **segmentation** | 1 input | `case_expression`, `segment_column` | `SELECT *, CASE {case_expression} END AS {segment_column} FROM {input}` |
| **recommendation** | 1 input | `score_expression`, `recommendation_column` | `SELECT *, {score_expression} AS {recommendation_column} FROM {input}` |

### Example: CTE Pipeline Flow

```
src_customers ──┐
                ├── join_tables ── filter_rows ── destination
src_orders ─────┘
```

Compiled SQL:
```sql
CREATE TABLE DB.SCH.TARGET AS
WITH src_customers AS (
    SELECT * FROM DB.SCH.CUSTOMERS
),
src_orders AS (
    SELECT * FROM DB.SCH.ORDERS
),
joined AS (
    SELECT a.*, b.amount FROM src_customers a INNER JOIN src_orders b ON a.id = b.id
),
filtered AS (
    SELECT * FROM joined WHERE status = 'ACTIVE'
)
SELECT * FROM filtered
```

---

## Enums

**CronChoice**: `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, `CUSTOM`
**DeploymentType**: `immediate`, `with_approval`, `scheduled`

---

## Endpoints

### 1. Workflow CRUD

#### POST `/api/v1/workflows`
Create a new workflow with optional initial steps.

**Request:**
```json
{
  "project_name": "Customer ETL Pipeline",
  "description": "Join customers + orders, filter active, write to DWH",
  "tags": ["etl", "customers"],
  "steps": [
    {
      "action_type": "src",
      "step_name": "src_customers",
      "payload": {
        "database_name": "RAW_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMERS",
        "inputs": [], "cte_alias": "src_customers"
      }
    },
    {
      "action_type": "src",
      "step_name": "src_orders",
      "payload": {
        "database_name": "RAW_DB", "schema_name": "PUBLIC", "table_name": "ORDERS",
        "inputs": [], "cte_alias": "src_orders"
      }
    }
  ]
}
```

**Response:**
```json
{
  "project_id": "proj_abc123",
  "project_name": "Customer ETL Pipeline",
  "project_type": "workflow",
  "status": "active",
  "metadata": {
    "steps": [
      {
        "step_id": "step_aaa111", "step_order": 1, "action_type": "src",
        "step_name": "src_customers", "description": null,
        "payload": { "database_name": "RAW_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMERS", "inputs": [], "cte_alias": "src_customers" }
      },
      {
        "step_id": "step_bbb222", "step_order": 2, "action_type": "src",
        "step_name": "src_orders", "description": null,
        "payload": { "database_name": "RAW_DB", "schema_name": "PUBLIC", "table_name": "ORDERS", "inputs": [], "cte_alias": "src_orders" }
      }
    ]
  },
  "version_id": "ver_xyz",
  "version_number": 1
}
```

#### GET `/api/v1/workflows/{workflow_id}`
Get workflow project details. Steps are inside `metadata.steps`.

**Response:**
```json
{
  "project_id": "proj_abc123",
  "project_name": "Customer ETL Pipeline",
  "project_type": "workflow",
  "status": "active",
  "description": "Join customers + orders, filter active, write to DWH",
  "created_by": "USER1",
  "created_at": "2026-02-12T10:00:00",
  "metadata": {
    "steps": [
      { "step_id": "step_aaa111", "step_order": 1, "action_type": "src", "step_name": "src_customers", "description": null, "payload": { "..." } },
      { "step_id": "step_bbb222", "step_order": 2, "action_type": "src", "step_name": "src_orders", "description": null, "payload": { "..." } }
    ]
  },
  "tags": ["etl", "customers"]
}
```

---

### 2. Steps Management

Steps are stored in `PROJECTS.METADATA.steps`. Every step mutation (add/update/delete/reorder) updates the METADATA column and auto-creates a new version.

#### GET `/api/v1/workflows/{workflow_id}/steps`
List all steps ordered by step_order.

**Response:**
```json
{
  "workflow_id": "proj_abc123",
  "steps": [
    {
      "step_id": "step_aaa111",
      "step_order": 1,
      "action_type": "src",
      "step_name": "src_customers",
      "description": null,
      "payload": {
        "database_name": "RAW_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMERS",
        "inputs": [], "cte_alias": "src_customers"
      }
    }
  ],
  "count": 1
}
```

#### POST `/api/v1/workflows/{workflow_id}/steps`
Add a step.

**Request:**
```json
{
  "action_type": "join_tables",
  "step_name": "join_cust_orders",
  "description": "Join customers with orders",
  "payload": {
    "left_columns_aliased": "a.*",
    "right_columns_aliased": "b.order_id, b.amount",
    "join_type": "INNER",
    "left_key": "customer_id",
    "right_key": "customer_id",
    "inputs": ["step_aaa111", "step_bbb222"],
    "cte_alias": "joined"
  },
  "position": 3
}
```

**Response:**
```json
{
  "step_id": "step_ccc333",
  "step_order": 3,
  "action_type": "join_tables",
  "step_name": "join_cust_orders",
  "description": "Join customers with orders",
  "payload": { "..." }
}
```

#### PUT `/api/v1/workflows/{workflow_id}/steps/{step_id}`
Update a step (partial update — only provided fields change).

**Request:**
```json
{
  "payload": {
    "filter_condition": "status = 'ACTIVE' AND amount > 100",
    "inputs": ["step_ccc333"],
    "cte_alias": "filtered"
  }
}
```

**Response:**
```json
{
  "step_id": "step_ddd444",
  "step_order": 4,
  "action_type": "filter_rows",
  "step_name": "filter_active",
  "description": null,
  "payload": { "..." }
}
```

#### DELETE `/api/v1/workflows/{workflow_id}/steps/{step_id}`
Delete a step. Reorders remaining steps.

**Response:**
```json
{ "status": "deleted", "step_id": "step_ddd444", "deleted_order": 4 }
```

#### POST `/api/v1/workflows/{workflow_id}/steps/reorder`
Reorder steps.

**Request:**
```json
{ "step_ids": ["step_aaa111", "step_bbb222", "step_ccc333", "step_eee555"] }
```

**Response:** Returns updated steps list (same shape as GET steps).

---

### 3. Action Templates

#### GET `/api/v1/workflows/actions/templates`
List all available action templates (system + custom).

**Response:**
```json
{
  "templates": [
    {
      "action_type": "src",
      "action_name": "Src",
      "description": null,
      "query_template": "SELECT * FROM {database_name}.{schema_name}.{table_name}",
      "parameters": {},
      "is_system": true,
      "created_at": "2026-02-12T10:00:00"
    },
    { "action_type": "join_tables", "..." },
    { "action_type": "filter_rows", "..." }
  ],
  "count": 16
}
```

#### POST `/api/v1/workflows/actions/templates`
Create a custom action template.

**Request:**
```json
{
  "action_type": "custom_pivot",
  "query_template": "SELECT * FROM {input} PIVOT ({agg_func}({value_col}) FOR {pivot_col} IN ({pivot_values}))",
  "action_name": "Pivot Table",
  "description": "Pivot rows to columns",
  "parameters": { "agg_func": "SUM", "value_col": "", "pivot_col": "", "pivot_values": "" }
}
```

**Response:**
```json
{ "action_type": "custom_pivot", "status": "created" }
```

---

### 4. Execution

#### POST `/api/v1/workflows/{workflow_id}/execute`
Execute workflow. Auto-detects CTE mode (if steps have `inputs`) vs legacy mode.

**Request:**
```json
{ "trigger_type": "manual" }
```

**Response (CTE mode):**
```json
{
  "run_id": "run_abc123",
  "project_id": "proj_abc123",
  "status": "completed",
  "mode": "cte",
  "steps_total": 5,
  "steps_executed": 5,
  "steps_failed": 0,
  "compiled_sql": "CREATE TABLE DB.SCH.TARGET AS\nWITH src_customers AS (\n    SELECT * FROM ...\n), ...",
  "rows_affected": 15230,
  "execution_details": {
    "mode": "cte",
    "compiled_sql": "...",
    "rows_affected": 15230,
    "steps_results": [
      { "step_id": "step_aaa111", "cte_alias": "src_customers", "status": "completed" },
      { "step_id": "step_bbb222", "cte_alias": "src_orders", "status": "completed" }
    ]
  },
  "error": null
}
```

**Response (legacy mode — no `inputs` in payloads):**
```json
{
  "run_id": "run_abc123",
  "project_id": "proj_abc123",
  "status": "completed",
  "mode": "legacy",
  "steps_total": 3,
  "steps_executed": 3,
  "steps_failed": 0,
  "execution_details": {
    "mode": "legacy",
    "steps_results": [
      { "step_id": "step_aaa111", "status": "completed", "rows_affected": 500 }
    ]
  },
  "error": null
}
```

#### POST `/api/v1/workflows/{workflow_id}/compile`
Compile workflow into SQL without executing. For preview/debug.

**Response (CTE mode):**
```json
{
  "mode": "cte",
  "compiled_sql": "CREATE TABLE DB.SCH.TARGET AS\nWITH src_customers AS (\n    SELECT * FROM RAW_DB.PUBLIC.CUSTOMERS\n),\nsrc_orders AS (\n    SELECT * FROM RAW_DB.PUBLIC.ORDERS\n),\njoined AS (\n    SELECT a.*, b.amount FROM src_customers a INNER JOIN src_orders b ON a.customer_id = b.customer_id\n),\nfiltered AS (\n    SELECT * FROM joined WHERE status = 'ACTIVE'\n)\nSELECT * FROM filtered",
  "steps_count": 5,
  "topological_order": ["step_aaa111", "step_bbb222", "step_ccc333", "step_ddd444"],
  "cte_aliases": {
    "step_aaa111": "src_customers",
    "step_bbb222": "src_orders",
    "step_ccc333": "joined",
    "step_ddd444": "filtered"
  }
}
```

#### POST `/api/v1/workflows/{workflow_id}/validate`
Validate DAG structure (no cycles, correct input counts, unique aliases).

**Response (valid):**
```json
{
  "valid": true,
  "mode": "cte",
  "steps_count": 5,
  "topological_order": ["step_aaa111", "step_bbb222", "step_ccc333", "step_ddd444"],
  "destination": "step_eee555",
  "cte_aliases": {
    "step_aaa111": "src_customers",
    "step_bbb222": "src_orders",
    "step_ccc333": "joined",
    "step_ddd444": "filtered"
  }
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "mode": "cte",
  "error": "Workflow contains a cycle in step dependencies"
}
```

---

### 5. Runs

#### GET `/api/v1/workflows/{workflow_id}/runs?status=completed&limit=20`
List execution runs.

**Response:**
```json
{
  "runs": [
    {
      "run_id": "run_abc123",
      "status": "completed",
      "trigger_type": "manual",
      "triggered_by": "USER1",
      "started_at": "2026-02-12T10:00:00",
      "completed_at": "2026-02-12T10:00:05",
      "duration_seconds": 5,
      "steps_total": 5,
      "steps_executed": 5,
      "steps_failed": 0
    }
  ],
  "count": 1
}
```

#### GET `/api/v1/workflows/{workflow_id}/runs/summary`
Aggregated run statistics.

**Response:**
```json
{
  "total_runs": 15,
  "completed": 12,
  "failed": 3,
  "avg_duration_seconds": 8.5,
  "last_run_at": "2026-02-12T10:00:00"
}
```

---

### 6. Scheduling

#### POST `/api/v1/workflows/{workflow_id}/schedule`
Schedule workflow execution via Snowflake TASK.

**Request:**
```json
{
  "cron_choice": "DAILY",
  "custom_cron": null,
  "warehouse": "COMPUTE_WH",
  "requires_approval": true,
  "config": { "notify_on_failure": true }
}
```

**Response:**
```json
{
  "schedule_id": "sched_abc123",
  "project_id": "proj_abc123",
  "status": "pending_approval",
  "cron_expression": "0 0 * * *"
}
```

#### POST `/api/v1/workflows/{workflow_id}/schedule/{schedule_id}/approve`
Approve a pending schedule. No body required.

#### POST `/api/v1/workflows/{workflow_id}/schedule/{schedule_id}/reject`
**Request:** `{ "reason": "Not ready for production" }`

#### POST `/api/v1/workflows/{workflow_id}/schedule/{schedule_id}/activate`
Activate an approved schedule (creates Snowflake TASK).

#### POST `/api/v1/workflows/{workflow_id}/task/suspend`
Suspend the active Snowflake TASK for this workflow.

#### POST `/api/v1/workflows/{workflow_id}/task/resume`
Resume a suspended TASK.

#### GET `/api/v1/workflows/scheduled?mine_only=false`
List all scheduled workflows.

**Response:**
```json
{ "schedules": [ { "schedule_id": "...", "project_id": "...", "status": "active", "cron_expression": "0 0 * * *" } ], "count": 1 }
```

---

### 7. Versions

#### GET `/api/v1/workflows/{workflow_id}/versions?limit=20&include_superseded=true`
List version history. A new version is auto-created on every step add/update/delete/reorder.

**Response:**
```json
{
  "versions": [
    {
      "version_id": "ver_xyz",
      "version_number": 3,
      "description": "Added step: filter_active",
      "created_by": "USER1",
      "created_at": "2026-02-12T10:00:00",
      "definition": { "steps": ["..."] }
    }
  ],
  "count": 3
}
```

#### POST `/api/v1/workflows/{workflow_id}/rollback?target_version_id=ver_xyz&reason=bug`
Rollback to a previous version.

---

### 8. Deployments

#### POST `/api/v1/workflows/{workflow_id}/deployments`
Request deployment.

**Request:**
```json
{
  "version_id": "ver_xyz",
  "deployment_type": "with_approval",
  "scheduled_time": null,
  "warehouse": "COMPUTE_WH",
  "config": {}
}
```

**Response:**
```json
{
  "deployment_id": "dep_abc123",
  "project_id": "proj_abc123",
  "status": "pending_approval",
  "deployment_type": "with_approval"
}
```

#### GET `/api/v1/workflows/{workflow_id}/deployments?status=pending_approval`
List deployments.

#### POST `/api/v1/workflows/{workflow_id}/deployments/{deployment_id}/approve`
#### POST `/api/v1/workflows/{workflow_id}/deployments/{deployment_id}/reject`
**Request:** `{ "reason": "..." }`

#### POST `/api/v1/workflows/{workflow_id}/deployments/{deployment_id}/execute`
Execute an approved deployment (runs the workflow).

#### POST `/api/v1/workflows/{workflow_id}/deployments/{deployment_id}/cancel`

---

## DAG Rules (validation)

| Rule | Detail |
|---|---|
| `src` steps | Must have `inputs: []` (no inputs) |
| `join_tables` | Must have exactly 2 inputs |
| All other transforms | Must have exactly 1 input |
| `destination` | Must have exactly 1 input, exactly 1 per workflow |
| No cycles | Validated via topological sort |
| No self-references | A step cannot list itself in inputs |
| Unique CTE aliases | No two non-destination steps can share the same alias |

## Error Codes

| Status | When |
|---|---|
| 404 | Workflow/step/schedule/deployment not found |
| 400 | Business rule violation (e.g. no active schedule to suspend) |
| 422 | DAG validation error (cycle, missing inputs, duplicate alias, missing payload key) |
| 500 | Snowflake execution error |
