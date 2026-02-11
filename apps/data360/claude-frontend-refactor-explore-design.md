# Frontend Refactoring: Explore & Design Module + Unified Project Management

## Context

You are refactoring the **Explore & Design** module frontend for a data platform (Data360). The backend is FastAPI + Snowflake. There are **two API layers** to consume:

1. **Unified Project Management** — `/api/v1/projects` — shared CRUD, versions, deployments, contributors, runs, state, events
2. **Explore & Design Module** — `/api/v1/explore-design` — domain-specific: metadata, profiling, preview, detection, schema clone, ingestion, masking, mappings, DDL actions, model versions, deploy, scheduling

The frontend must use **both** APIs together. The unified API handles project lifecycle; the explore API handles domain logic within each project.

Auth: **JWT Bearer token** on every request (`Authorization: Bearer <token>`).

---

## Architecture Decision: Two API Clients

Create two API service modules:

```
services/
  api/
    projectsApi.ts       → calls /api/v1/projects/*
    exploreDesignApi.ts   → calls /api/v1/explore-design/*
```

Both share the same auth interceptor and base URL config.

---

## PART 1 — Unified Project Management API (`/api/v1/projects`)

### Enums (define as TypeScript enums or union types)

```typescript
type ProjectType = "explore_design" | "workflow";
type ProjectStatus = "draft" | "active" | "archived" | "deleted";
type DeploymentStatus = "pending_approval" | "approved" | "rejected" | "scheduled" | "in_progress" | "deployed" | "failed" | "cancelled" | "rolled_back";
type DeploymentType = "with_approval" | "scheduled" | "immediate";  // unified deployments only
type ContributorRole = "owner" | "editor" | "viewer";
type VersionStatus = "draft" | "active" | "superseded" | "rolled_back";
```

### 1.1 Project CRUD

#### POST `/api/v1/projects` — Create project
**Request body:**
```json
{
  "project_name": "string (required, 1-255 chars)",
  "project_type": "explore_design | workflow",
  "description": "string | null",
  "step_name": "string | null",
  "metadata": "object | null",
  "tags": ["string"] | null
}
```
**Response:**
```json
{
  "project_id": "proj_xxxxxxxxxxxx",
  "project_name": "My Project",
  "project_type": "explore_design",
  "status": "active",
  "step_name": "CREATE_PROJECT",
  "created_by": "USERNAME"
}
```

#### GET `/api/v1/projects` — List projects
**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_type` | `explore_design \| workflow` | null | Filter by type |
| `status` | `draft \| active \| archived` | null | Filter by status |
| `mine_only` | boolean | false | Only my projects |
| `limit` | int (1-100) | 50 | Page size |
| `offset` | int (>=0) | 0 | Pagination offset |

**Response:**
```json
{
  "projects": [
    {
      "project_id": "proj_xxx",
      "project_name": "string",
      "project_type": "explore_design",
      "description": "string | null",
      "status": "active",
      "step_name": "SELECT_TABLES",
      "current_version_num": 3,
      "deployment_version": 2,
      "created_by": "USER",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

#### GET `/api/v1/projects/{project_id}` — Get project detail
**Response:**
```json
{
  "project_id": "proj_xxx",
  "project_name": "string",
  "project_type": "explore_design",
  "description": "string | null",
  "status": "active",
  "step_name": "SELECT_TABLES",
  "current_version_id": "ver_xxx | null",
  "current_version_num": 3,
  "deployment_version": 2,
  "locked_by": "USER | null",
  "locked_at": "iso-datetime | null",
  "created_by": "USER",
  "created_at": "iso-datetime",
  "updated_by": "USER | null",
  "updated_at": "iso-datetime | null",
  "metadata": { "source_tables": [...] },
  "tags": ["tag1", "tag2"]
}
```

#### PATCH `/api/v1/projects/{project_id}` — Update project
**Request body (all fields optional):**
```json
{
  "project_name": "string | null",
  "description": "string | null",
  "status": "draft | active | archived | null",
  "step_name": "string | null",
  "metadata": "object | null",
  "tags": ["string"] | null
}
```
**Response:** Same as GET project detail.

#### DELETE `/api/v1/projects/{project_id}` — Soft delete
**Response:** `{ "status": "deleted", "project_id": "proj_xxx" }`

### 1.2 Lock / Unlock

#### POST `/api/v1/projects/{project_id}/lock`
**Response:** Full project object (with `locked_by` set to current user). Returns 403 if locked by another user.

#### POST `/api/v1/projects/{project_id}/unlock`
**Response:** Full project object (with `locked_by` = null).

### 1.3 Version Management

#### POST `/api/v1/projects/{project_id}/versions` — Create version
**Request body:**
```json
{
  "definition": { "any": "json object (required)" },
  "version_name": "string | null",
  "description": "string | null"
}
```
**Response:**
```json
{
  "version_id": "ver_xxx",
  "project_id": "proj_xxx",
  "version_number": 4,
  "version_name": "v4",
  "status": "active"
}
```

#### GET `/api/v1/projects/{project_id}/versions` — List versions
**Query:** `limit` (1-100, default 20), `include_superseded` (bool, default true)
**Response:**
```json
{
  "project_id": "proj_xxx",
  "current_version": { "version_id": "ver_xxx", "version_number": 4, ... } | null,
  "versions": [
    {
      "version_id": "ver_xxx",
      "version_number": 4,
      "version_name": "v4",
      "status": "active",
      "definition": { ... },
      "changes_summary": { ... },
      "created_by": "USER",
      "created_at": "iso-datetime",
      "description": "string | null"
    }
  ],
  "total": 4
}
```

#### GET `/api/v1/projects/{project_id}/versions/{version_id}` — Get single version
**Response:** Single version object (same shape as list item + `approved_by`, `approved_at`).

#### POST `/api/v1/projects/{project_id}/rollback` — Rollback to version
**Request body:**
```json
{
  "target_version_id": "ver_xxx",
  "reason": "string | null"
}
```
**Response:**
```json
{
  "status": "success",
  "project_id": "proj_xxx",
  "rolled_back_to": "ver_xxx",
  "target_version_number": 2,
  "versions_rolled_back": 2,
  "reason": "string | null"
}
```

### 1.4 Deployments (Unified)

#### POST `/api/v1/projects/{project_id}/deployments` — Request deployment
**Request body:**
```json
{
  "version_id": "ver_xxx",
  "environment": "production",
  "deployment_method": "string | null",
  "scheduled_at": "iso-datetime | null",
  "config": { ... } | null,
  "requires_approval": true
}
```
**Response:**
```json
{
  "deployment_id": "deploy_xxx",
  "project_id": "proj_xxx",
  "version_id": "ver_xxx",
  "environment": "production",
  "status": "pending_approval"
}
```

#### GET `/api/v1/projects/{project_id}/deployments` — List deployments
**Query:** `environment` (string | null), `status` (DeploymentStatus | null), `limit` (1-100, default 20)

#### POST `/api/v1/projects/{project_id}/deployments/{deployment_id}/approve`
**Response:** `{ "deployment_id", "status": "approved", ... }`

#### POST `/api/v1/projects/{project_id}/deployments/{deployment_id}/reject`
**Request body:** `{ "reason": "string | null" }`
**Response:** `{ "deployment_id", "status": "rejected", ... }`

#### POST `/api/v1/projects/{project_id}/deployments/{deployment_id}/execute`
**Request body:** `{ "execution_log": object | null, "error_message": string | null }`
**Response:** `{ "deployment_id", "status": "deployed", ... }`

### 1.5 Execution Runs

#### POST `/api/v1/projects/{project_id}/runs` — Start a run
**Request body:**
```json
{
  "version_id": "string | null",
  "deployment_id": "string | null",
  "trigger_type": "manual | scheduled | api",
  "steps_total": 0
}
```
**Response:** `{ "run_id": "run_xxx", "status": "running" }`

#### GET `/api/v1/projects/{project_id}/runs` — List runs
**Query:** `status` (string | null), `limit` (1-100, default 20)

#### GET `/api/v1/projects/{project_id}/runs/summary` — Run summary stats

#### PATCH `/api/v1/projects/{project_id}/runs/{run_id}/complete` — Complete a run
**Request body:**
```json
{
  "status": "success | failed | cancelled",
  "steps_executed": 5,
  "steps_failed": 0,
  "execution_details": { ... } | null,
  "error_log": { ... } | null
}
```
**Response:** `{ "run_id", "status": "success" }`

### 1.6 Contributors

#### GET `/api/v1/projects/{project_id}/contributors`
**Response:** Array of `{ "contributor_id", "username", "role", "permissions", "added_by", "added_at" }`

#### POST `/api/v1/projects/{project_id}/contributors`
**Request body:**
```json
{
  "username": "string",
  "role": "viewer | editor",
  "permissions": { ... } | null
}
```

#### DELETE `/api/v1/projects/{project_id}/contributors/{username}`
**Response:** `{ "status": "removed", "username": "..." }`

### 1.7 Project State (Wizard)

#### GET `/api/v1/projects/{project_id}/state`
**Response:** `{ "project_id", "step": 1, "state": { "any": "data" } }`

#### PUT `/api/v1/projects/{project_id}/state`
**Request body:** `{ "step": 2, "state": { "any": "data" } }`
**Response:** `{ "project_id", "step": 2, "status": "saved" }`

### 1.8 Events (Activity Log)

#### GET `/api/v1/projects/{project_id}/events`
**Query:** `module_name` (string | null), `event_type` (string | null), `limit` (1-200, default 50)
**Response:**
```json
{
  "project_id": "proj_xxx",
  "events": [
    {
      "event_id": "evt_xxx",
      "project_id": "proj_xxx",
      "module_name": "EXPLORE_DESIGN",
      "event_type": "CREATE_PROJECT",
      "event_subtype": null,
      "status": "SUCCESS",
      "username": "USER",
      "timestamp": "iso-datetime",
      "entity_id": null,
      "entity_type": null,
      "details": { ... },
      "error_message": null,
      "duration_ms": null
    }
  ],
  "count": 12
}
```

#### GET `/api/v1/projects/events/all` — Global events (across projects)
**Query:** `module_name`, `event_type`, `username`, `limit`

---

## PART 2 — Explore & Design Module API (`/api/v1/explore-design`)

### Enums

```typescript
type NamingStrategy = "version_suffix" | "timestamp_suffix" | "custom";
type IngestionMode = "full_refresh" | "incremental" | "snapshot" | "scd_type1" | "scd_type2" | "scd_type3";
type DDLType = "CREATE_TABLE" | "ALTER_ADD_COLUMN" | "ALTER_DROP_COLUMN" | "ALTER_RENAME_COLUMN" | "ALTER_CHANGE_TYPE" | "DROP_TABLE";
type CronChoice = "EVERY_HOUR" | "EVERY_6_HOURS" | "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
type ExploreDeploymentType = "with_approval" | "scheduled" | "immediate";
```

### Common Type: TableRef

Used throughout the explore API:

```typescript
interface TableRef {
  database: string;
  schema: string;   // Note: backend Pydantic uses alias "schema" for field "schema_name"
  table: string;
}
```

### 2.1 Project (Explore-specific Create)

#### POST `/api/v1/explore-design` — Create explore project
**Request body:**
```json
{
  "project_name": "string (required, 1-255 chars)",
  "description": "string | null",
  "source_tables": [
    { "database": "MYDB", "schema": "PUBLIC", "table": "CUSTOMERS" }
  ],
  "tags": ["tag1"]
}
```
**Response:**
```json
{
  "project_id": "proj_xxx",
  "project_name": "string",
  "project_type": "explore_design",
  "status": "active",
  "step_name": "SELECT_TABLES",
  "created_by": "USER",
  "version_id": "ver_xxx"   // if source_tables were provided, an initial version is auto-created
}
```

#### GET `/api/v1/explore-design/{project_id}` — Get project (explore-only filter)
**Response:** Same as unified project detail, filtered to `project_type = "explore_design"`.

#### GET/PUT `/api/v1/explore-design/{project_id}/state` — Wizard state
Same as unified state endpoints.

#### GET `/api/v1/explore-design/{project_id}/events` — Module-filtered events
**Query:** `event_type`, `limit` (1-200, default 50)
**Response:** Events filtered to `module_name = "EXPLORE_DESIGN"`.

### 2.2 Templates

#### GET `/api/v1/explore-design/{project_id}/templates` — List config templates
**Response:** `{ "templates": [{ "template_id", "template_name", "template_type", "description", "config", "created_by", "created_at" }] }`

#### POST `/api/v1/explore-design/{project_id}/templates` — Create template
**Request body:**
```json
{
  "template_name": "string",
  "template_type": "explore_design",
  "description": "string | null",
  "config": { "any": "json" }
}
```
**Response:** `{ "template_id": "tpl_xxx", "template_name": "string" }`

### 2.3 Metadata

#### POST `/api/v1/explore-design/{project_id}/tables/metadata` — Batch metadata
**Request body:** `List<TableRef>` (JSON array)
**Query:** `include_columns` (bool, default true), `include_statistics` (bool, default false)
**Response:**
```json
{
  "project_id": "proj_xxx",
  "tables": [
    {
      "database": "MYDB",
      "schema": "PUBLIC",
      "table": "CUSTOMERS",
      "table_type": "BASE TABLE",
      "row_count": 50000,
      "bytes": 1024000,
      "created": "iso-datetime",
      "last_altered": "iso-datetime",
      "columns": [
        {
          "name": "ID",
          "data_type": "NUMBER",
          "nullable": false,
          "default": null,
          "position": 1,
          "max_length": null,
          "precision": 38,
          "scale": 0
        }
      ]
    }
  ]
}
```
Tables not found return: `{ "database", "schema", "table", "error": "not_found" }`

#### GET `/api/v1/explore-design/{project_id}/tables/{database}/{schema}/{table}/metadata`
Same response shape as a single table from batch.

### 2.4 Profiling

#### GET `/api/v1/explore-design/{project_id}/tables/{database}/{schema}/{table}/profile`
**Query:** `sample_size` (100-100000, default 1000)
**Response:**
```json
{
  "database": "MYDB",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "row_count": 50000,
  "bytes": 1024000,
  "column_count": 12,
  "created": "iso-datetime",
  "last_altered": "iso-datetime",
  "aggregate_quality_score": 95.5,
  "columns": [
    {
      "column_name": "EMAIL",
      "data_type": "VARCHAR",
      "nullable": true,
      "position": 3,
      "null_count": 120,
      "distinct_count": 49800,
      "min_value": "aaa@example.com",
      "max_value": "zzz@example.com",
      "quality_score": 99.76
    }
  ],
  "sample_size": 1000
}
```

#### GET `/{project_id}/tables/{db}/{schema}/{table}/columns/{column}/profile` — Deep column profile
**Query:** `sample_size` (100-100000), `top_n` (1-100, default 10)
**Response:**
```json
{
  "database": "MYDB",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "column": "EMAIL",
  "data_type": "VARCHAR",
  "nullable": true,
  "default_value": null,
  "max_length": 256,
  "precision": null,
  "scale": null,
  "total_count": 1000,
  "null_count": 5,
  "distinct_count": 980,
  "min_value": "a@b.com",
  "max_value": "z@y.com",
  "quality_score": 99.5,
  "top_values": [
    { "value": "admin@company.com", "count": 15 }
  ],
  "sample_values": ["user1@a.com", "user2@b.com"],
  "detected_patterns": [
    { "pattern": "email", "match_count": 950, "match_ratio": 0.9694 }
  ],
  "sample_size": 1000
}
```

### 2.5 Preview

#### GET `/{project_id}/tables/{db}/{schema}/{table}/preview` — Table preview
**Query:** `limit` (1-10000, default 100)
**Response:**
```json
{
  "database": "MYDB",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "columns": ["ID", "NAME", "EMAIL"],
  "rows": [
    { "ID": 1, "NAME": "John", "EMAIL": "john@example.com" }
  ],
  "row_count": 100,
  "limit": 100
}
```

#### GET `/{project_id}/tables/{db}/{schema}/{table}/columns/{column}/preview` — Column preview
**Query:** `limit` (1-10000), `distinct_only` (bool, default false)
**Response:**
```json
{
  "database": "MYDB",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "column": "EMAIL",
  "distinct_only": false,
  "values": ["john@a.com", "jane@b.com"],   // or [{"value": "john@a.com", "count": 5}] if distinct_only=true
  "count": 100,
  "limit": 100
}
```

### 2.6 Detection

#### POST `/{project_id}/detect/sensitive` — Sensitive column detection
**Request body:**
```json
{
  "tables": [{ "database": "MYDB", "schema": "PUBLIC", "table": "CUSTOMERS" }],
  "patterns": ["email", "phone", "ssn", "credit_card", "ip_address", "dob", "name", "address"],
  "confidence_threshold": 0.7
}
```
**Response:**
```json
{
  "project_id": "proj_xxx",
  "detections": [
    {
      "detection_id": "det_xxx",
      "table": "MYDB.PUBLIC.CUSTOMERS",
      "column": "EMAIL",
      "pattern_type": "email",
      "confidence": 0.8
    }
  ]
}
```

#### POST `/{project_id}/detect/relations` — Relation detection
**Request body:**
```json
{
  "tables": [{ "database": "MYDB", "schema": "PUBLIC", "table": "CUSTOMERS" }],
  "detection_method": "name_similarity",
  "confidence_threshold": 0.8
}
```
**Response:**
```json
{
  "project_id": "proj_xxx",
  "relations": [
    {
      "detection_id": "rel_xxx",
      "left_table": "MYDB.PUBLIC.ORDERS",
      "left_column": "CUSTOMER_ID",
      "right_table": "MYDB.PUBLIC.CUSTOMERS",
      "right_column": "CUSTOMER_ID",
      "relation_type": "foreign_key",
      "confidence": 0.9
    }
  ]
}
```

### 2.7 Schema Clone

#### POST `/{project_id}/schema-clone` — Create clone plan
**Request body:**
```json
{
  "source_database": "MYDB",
  "source_schema": "PUBLIC",
  "target_database": "DWH",
  "target_schema": "PUBLIC_V1",     // optional, auto-generated based on naming_strategy
  "naming_strategy": "version_suffix | timestamp_suffix | custom",
  "include_data": true,
  "include_constraints": true,
  "include_policies": false,
  "include_grants": false
}
```
**Response:**
```json
{
  "clone_id": "clone_xxx",
  "project_id": "proj_xxx",
  "source": "MYDB.PUBLIC",
  "target": "DWH.PUBLIC_V1",
  "version_num": 1,
  "status": "pending"
}
```

#### POST `/{project_id}/schema-clone/{clone_id}/execute`
**Query:** `warehouse` (default "COMPUTE_WH")
**Response:** `{ "clone_id", "status": "executed", "target": "DWH.PUBLIC_V1", "tables_cloned": 15 }`

#### POST `/{project_id}/schema-clone/{clone_id}/rollback`
**Response:** `{ "clone_id", "status": "rolled_back", "target": "DWH.PUBLIC_V1" }`

### 2.8 Ingestion

#### POST `/{project_id}/ingestion/config` — Single table config
**Request body:**
```json
{
  "source_database": "MYDB",
  "source_schema": "PUBLIC",
  "source_table": "CUSTOMERS",
  "ingestion_mode": "full_refresh | incremental | snapshot | scd_type1 | scd_type2 | scd_type3",
  "config": {
    "key_columns": ["ID"],
    "timestamp_column": "UPDATED_AT",
    "batch_size": 10000
  }
}
```
**Response:** `{ "config_id": "ing_xxx", "ingestion_mode": "full_refresh" }`

#### POST `/{project_id}/ingestion/bulk-config` — Multi-table config
**Request body:**
```json
{
  "tables": [{ "database": "MYDB", "schema": "PUBLIC", "table": "CUSTOMERS" }],
  "ingestion_mode": "full_refresh",
  "config": {}
}
```
**Response:** `{ "config_ids": ["ing_xxx", "ing_yyy"], "tables_configured": 2 }`

#### POST `/{project_id}/ingestion/execute` — Execute ingestion
**Request body:**
```json
{
  "source_database": "MYDB",
  "source_schema": "PUBLIC",
  "source_table": "CUSTOMERS",
  "target_database": "DWH",
  "target_schema": "PUBLIC_V1",
  "target_table": "CUSTOMERS",
  "ingestion_mode": "full_refresh",
  "column_mappings": [
    { "source_columns": ["FIRST_NAME", "LAST_NAME"], "target_column": "FULL_NAME", "transformation": "CONCAT({0}, ' ', {1})" }
  ],
  "config": {}
}
```
**Response:**
```json
{
  "status": "success",
  "source": "MYDB.PUBLIC.CUSTOMERS",
  "target": "DWH.PUBLIC_V1.CUSTOMERS",
  "ingestion_mode": "full_refresh",
  "rows_affected": 50000
}
```

### 2.9 Masking

#### POST `/{project_id}/masking/config` — Set masking on a column
**Request body:**
```json
{
  "database": "MYDB",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "column_name": "EMAIL",
  "masking_policy": "PARTIAL_MASK",
  "masking_type": "EMAIL",
  "preserve_format": true
}
```
**Response:** `{ "config_id": "mask_xxx", "column": "EMAIL", "policy": "PARTIAL_MASK" }`

### 2.10 Column Mappings

#### POST `/{project_id}/mappings` — Create column mapping
**Request body:**
```json
{
  "source_database": "MYDB",
  "source_schema": "PUBLIC",
  "source_table": "CUSTOMERS",
  "source_columns": ["FIRST_NAME", "LAST_NAME"],
  "target_database": "DWH",
  "target_schema": "PUBLIC_V1",
  "target_table": "DIM_CUSTOMERS",
  "target_column": "FULL_NAME",
  "transformation": "CONCAT({0}, ' ', {1})",
  "data_type": "VARCHAR",
  "is_key": false,
  "is_nullable": true
}
```
**Response:** `{ "mapping_id": "map_xxx" }`

#### GET `/{project_id}/mappings` — List mappings
**Response:**
```json
{
  "project_id": "proj_xxx",
  "mappings": [
    {
      "mapping_id": "map_xxx",
      "source": { "database": "MYDB", "schema": "PUBLIC", "table": "CUSTOMERS" },
      "source_columns": ["FIRST_NAME", "LAST_NAME"],
      "target": { "database": "DWH", "schema": "PUBLIC_V1", "table": "DIM_CUSTOMERS" },
      "target_column": "FULL_NAME",
      "transformation": "CONCAT({0}, ' ', {1})",
      "data_type": "VARCHAR",
      "is_key": false,
      "is_nullable": true,
      "default_value": null
    }
  ]
}
```

### 2.11 DDL Actions

#### POST `/{project_id}/ddl-actions` — Add DDL action
**Request body:**
```json
{
  "ddl_sql": "ALTER TABLE DWH.PUBLIC.CUSTOMERS ADD COLUMN AGE INT",
  "ddl_type": "CREATE_TABLE | ALTER_ADD_COLUMN | ALTER_DROP_COLUMN | ALTER_RENAME_COLUMN | ALTER_CHANGE_TYPE | DROP_TABLE",
  "priority": 0,
  "description": "Add age column",
  "target_table": "DWH.PUBLIC.CUSTOMERS"
}
```
**Response:**
```json
{
  "event_id": "evt_xxx",
  "project_id": "proj_xxx",
  "ddl_type": "ALTER_ADD_COLUMN",
  "priority": 0,
  "status": "PENDING"
}
```

#### GET `/{project_id}/ddl-actions` — List DDL actions
**Query:** `status` (PENDING | SUCCESS | FAILED | ROLLED_BACK | null)
**Response:**
```json
{
  "project_id": "proj_xxx",
  "actions": [
    {
      "event_id": "evt_xxx",
      "status": "PENDING",
      "username": "USER",
      "timestamp": "iso-datetime",
      "ddl_sql": "ALTER TABLE ...",
      "ddl_type": "ALTER_ADD_COLUMN",
      "priority": 0,
      "target_table": "DWH.PUBLIC.CUSTOMERS",
      "description": "Add age column",
      "error_message": null
    }
  ],
  "count": 5
}
```

#### POST `/{project_id}/ddl-actions/execute` — Execute all pending DDL
**Response:**
```json
{
  "project_id": "proj_xxx",
  "executed": 3,
  "failed": 1,
  "total": 4,
  "results": [
    { "event_id": "evt_xxx", "status": "SUCCESS" },
    { "event_id": "evt_yyy", "status": "FAILED", "error": "..." }
  ]
}
```

#### POST `/{project_id}/ddl-actions/{event_id}/rollback`
**Response:**
```json
{
  "event_id": "evt_xxx",
  "project_id": "proj_xxx",
  "status": "ROLLED_BACK",
  "previous_status": "SUCCESS"
}
```

### 2.12 Model Versions

#### POST `/{project_id}/models` — Save model version (snapshot)
**Request body:**
```json
{
  "model_name": "customers_model",
  "database": "DWH",
  "schema": "PUBLIC_V1",
  "table": "DIM_CUSTOMERS",
  "columns": [
    { "name": "ID", "type": "NUMBER", "nullable": false },
    { "name": "FULL_NAME", "type": "VARCHAR", "nullable": true }
  ]
}
```
**Response:** `{ "version_id": "mv_xxx", "version_number": 1, "table": "DWH.PUBLIC_V1.DIM_CUSTOMERS" }`

#### GET `/{project_id}/models` — List model versions
**Query:** `table` (optional FQN filter "DB.SCHEMA.TABLE"), `limit` (1-100, default 20)
**Response:**
```json
{
  "project_id": "proj_xxx",
  "versions": [
    {
      "version_id": "mv_xxx",
      "version_number": 2,
      "table": "DWH.PUBLIC_V1.DIM_CUSTOMERS",
      "column_attributes": { "columns": [...] },
      "column_groups": [],
      "semantic_model": {},
      "status": "draft",
      "created_by": "USER",
      "created_at": "iso-datetime"
    }
  ],
  "count": 2
}
```

### 2.13 Deploy

#### POST `/{project_id}/deploy?version_id=xxx` — Quick deploy
Executes all pending DDL actions first, then deploys the version. Aborts if any DDL fails.
**Query:** `version_id` (required)
**Response:**
```json
{
  "status": "success",
  "project_id": "proj_xxx",
  "version_id": "mv_xxx",
  "version_number": 2,
  "deployed_by": "USER",
  "ddl_executed": 3
}
```
**Error (400):** `"Deployment aborted: N DDL action(s) failed. Fix or rollback failed actions before deploying."`

#### POST `/{project_id}/deployments` — Request explore deployment
**Request body:**
```json
{
  "version_id": "ver_xxx",
  "deployment_type": "immediate | with_approval | scheduled",
  "scheduled_time": "2025-01-15T10:00:00Z",
  "warehouse": "COMPUTE_WH",
  "config": {}
}
```
**Response:** `{ "deployment_id": "deploy_xxx", "status": "...", "deployment_type": "...", "task_name": "..." }`

#### GET `/{project_id}/deployments`
**Query:** `status` (string | null)
**Response:** `{ "deployments": [...], "count": N }`

#### POST `/{project_id}/deployments/{deployment_id}/approve`
#### POST `/{project_id}/deployments/{deployment_id}/reject`
**Body:** `{ "reason": "string | null" }`
#### POST `/{project_id}/deployments/{deployment_id}/execute`
#### POST `/{project_id}/deployments/{deployment_id}/cancel`

### 2.14 Scheduling

#### POST `/{project_id}/schedule` — Create schedule
**Request body:**
```json
{
  "cron_choice": "EVERY_HOUR | EVERY_6_HOURS | DAILY | WEEKLY | MONTHLY | CUSTOM",
  "custom_cron": "0 */2 * * *",
  "warehouse": "COMPUTE_WH",
  "requires_approval": true,
  "config": {}
}
```
**Response:** `{ "schedule_id": "sched_xxx", "cron_expression": "0 * * * *", "status": "pending_approval | approved", ... }`

#### POST `/{project_id}/schedule/{schedule_id}/approve`
#### POST `/{project_id}/schedule/{schedule_id}/reject`
**Body:** `{ "reason": "string | null" }`
#### POST `/{project_id}/schedule/{schedule_id}/activate` — Creates Snowflake TASK
#### POST `/{project_id}/task/suspend`
#### POST `/{project_id}/task/resume`

#### GET `/{project_id}/schedules` — List schedules
**Query:** `status` (string | null)
**Response:** `{ "schedules": [...], "count": N }`

### 2.15 Version History (Unified delegation)

#### GET `/{project_id}/versions` — List unified project versions
**Query:** `limit` (1-100, default 20)
Same as unified versions endpoint.

---

## PART 3 — UI Pages & Components to Build

### Page 1: Project Dashboard (`/explore-design`)

**Data sources:**
- `GET /api/v1/projects?project_type=explore_design&mine_only=true` for project list
- `POST /api/v1/explore-design` to create new project

**Components:**
- **ProjectListTable** — columns: name, status badge, step, version, deployment version, created_by, created_at, actions (edit/delete)
- **CreateProjectDialog** — form: project_name (text), description (textarea), source_tables (TableRefPicker, multi-select), tags (tag input)
- **StatusBadge** — color-coded: active=green, draft=yellow, archived=gray, deleted=red

**Interactions:**
- Click project row → navigate to `/explore-design/{project_id}` (wizard)
- "New Project" button → opens CreateProjectDialog
- Pagination with limit/offset

---

### Page 2: Wizard (`/explore-design/{project_id}`)

Uses **GET/PUT `/api/v1/explore-design/{project_id}/state`** to persist wizard step + state across sessions.

On mount: load project detail (`GET /{project_id}`) and state. Navigate to `state.step`.

#### Step 1 — Source Explorer

**Data sources:**
- `POST /{project_id}/tables/metadata` — fetch metadata for selected tables
- `GET /{project_id}/tables/{db}/{schema}/{table}/profile` — table profiling
- `GET /{project_id}/tables/{db}/{schema}/{table}/columns/{column}/profile` — deep column profile
- `GET /{project_id}/tables/{db}/{schema}/{table}/preview` — data preview
- `GET /{project_id}/tables/{db}/{schema}/{table}/columns/{column}/preview` — column preview
- `POST /{project_id}/detect/sensitive` — sensitive detection
- `POST /{project_id}/detect/relations` — relation detection

**Components:**
- **TableBrowser** — left panel: tree of database > schema > table. Expand table → show columns with type badges
- **MetadataPanel** — right panel: shows table info (row_count, bytes, column list with types)
- **ProfilingPanel** — stats per column: null_count, distinct_count, min/max, quality_score (color bar)
- **DataPreviewTable** — paginated table with column headers and rows
- **ColumnProfileCard** — deep profile: top_values chart, detected_patterns badges, sample_values
- **SensitiveDetectionResults** — table: column, pattern_type, confidence (progress bar), actions
- **RelationDiagram** — visual: tables as nodes, FK lines between them (or simple table view)

**State to persist (PUT /state):**
```json
{
  "step": 1,
  "state": {
    "selected_tables": [{ "database": "...", "schema": "...", "table": "..." }],
    "profiled_tables": ["MYDB.PUBLIC.CUSTOMERS"],
    "sensitive_detections": [...],
    "relations": [...]
  }
}
```

#### Step 2 — Schema Design (Clone + DDL)

**Data sources:**
- `POST /{project_id}/schema-clone` → create clone
- `POST /{project_id}/schema-clone/{clone_id}/execute` → execute
- `POST /{project_id}/schema-clone/{clone_id}/rollback` → rollback
- `POST /{project_id}/ddl-actions` → add DDL
- `GET /{project_id}/ddl-actions` → list DDL
- `POST /{project_id}/ddl-actions/execute` → execute all
- `POST /{project_id}/ddl-actions/{event_id}/rollback` → rollback single

**Components:**
- **SchemaCloneForm** — source DB/schema picker, target DB picker, naming_strategy radio, checkboxes (data, constraints, policies, grants)
- **CloneStatusCard** — shows clone_id, source→target, status badge, version_num, buttons: Execute / Rollback
- **DDLActionForm** — textarea for SQL, ddl_type dropdown, priority number, description, target_table
- **DDLActionList** — sortable table by priority: ddl_type, sql preview, status badge, target_table, actions (rollback)
- **ExecuteDDLButton** — with confirmation dialog, shows results (executed/failed counts)

#### Step 3 — Ingestion & Mappings

**Data sources:**
- `POST /{project_id}/ingestion/config` — single config
- `POST /{project_id}/ingestion/bulk-config` — bulk config
- `POST /{project_id}/ingestion/execute` — execute
- `POST /{project_id}/mappings` — create mapping
- `GET /{project_id}/mappings` — list mappings

**Components:**
- **IngestionConfigForm** — per table: table picker, ingestion_mode dropdown, config JSON editor (key_columns, timestamp_column)
- **BulkIngestionPanel** — multi-select tables, single mode dropdown, apply button
- **IngestionExecutePanel** — source → target table pickers, mode, execute button with progress/result
- **ColumnMappingBuilder** — drag-and-drop or form: source_columns multi-select, target_column text, transformation dropdown/text, data_type, is_key toggle
- **MappingListTable** — source table/columns → target column, transformation, type, key badge

#### Step 4 — Masking

**Data sources:**
- `POST /{project_id}/masking/config` — set masking
- Reuse `GET /{project_id}/tables/{db}/{schema}/{table}/columns/{column}/preview` to compare masked/unmasked

**Components:**
- **MaskingConfigForm** — table/column picker, masking_policy dropdown, masking_type dropdown, preserve_format toggle
- **MaskingPreview** — side-by-side: original values vs masked output
- **MaskingConfigList** — table: column, policy, type, status

#### Step 5 — Model & Deploy

**Data sources:**
- `POST /{project_id}/models` — save version
- `GET /{project_id}/models` — list versions
- `POST /{project_id}/deploy?version_id=xxx` — quick deploy
- `POST /{project_id}/deployments` — request deployment
- `GET /{project_id}/deployments` — list deployments
- `POST /{project_id}/deployments/{id}/approve|reject|execute|cancel`

**Components:**
- **ModelVersionForm** — model_name, table picker, columns list (from metadata)
- **ModelVersionList** — table: version_number, table, status, created_by, created_at
- **VersionDiffView** — side-by-side comparison of two model versions' column_attributes
- **DeployPanel** — radio: immediate / with_approval / scheduled. If scheduled: datetime picker. Warehouse picker.
- **DeploymentHistory** — table: deployment_id, type, status badge, requested_by, approved_by, deployed_at, actions
- **ApprovalDialog** — approve/reject buttons, reject reason textarea

#### Step 6 — Scheduling

**Data sources:**
- `POST /{project_id}/schedule` — create schedule
- `POST /{project_id}/schedule/{id}/approve|reject|activate`
- `POST /{project_id}/task/suspend|resume`
- `GET /{project_id}/schedules` — list schedules

**Components:**
- **ScheduleForm** — cron_choice radio/dropdown, custom_cron text (if CUSTOM), warehouse text, requires_approval toggle
- **ScheduleList** — table: schedule_id, cron_expression, status badge, requested_by, actions
- **ScheduleApprovalPanel** — approve/reject buttons, reject reason
- **TaskControls** — suspend/resume buttons with current status indicator
- **CronExpressionPicker** — visual cron builder (dropdown for minute/hour/day/month/weekday)

---

### Shared / Reusable Components

| Component | Description | Used In |
|-----------|-------------|---------|
| **TableRefPicker** | Cascading: database → schema → table dropdowns | Steps 1-4, CreateProject |
| **StatusBadge** | Color-coded pill: PENDING=yellow, SUCCESS=green, FAILED=red, ROLLED_BACK=orange, ACTIVE=blue, SUSPENDED=gray | Everywhere |
| **ActivityLog** | Timeline of project events (GET /events) with filter by event_type | Sidebar or tab |
| **ConfirmDialog** | "Are you sure?" for destructive actions (execute, rollback, delete, deploy) | Steps 2-6 |
| **JsonEditor** | JSON editor for config/metadata fields | Steps 2-3, Templates |
| **TagInput** | Tag add/remove component for project tags | CreateProject, UpdateProject |
| **PaginatedTable** | Generic table with sorting, filtering, pagination | Lists everywhere |
| **LoadingOverlay** | Spinner + message for async operations | All API calls |
| **ErrorBanner** | Error display with details and retry button | All API responses |

---

## PART 4 — State Management Strategy

### Recommended approach: React Context + React Query (TanStack Query)

```
stores/
  useProjectStore.ts        → current project, wizard step
  useExploreStore.ts        → explore-specific state (selected tables, detections, etc.)
hooks/
  useProjects.ts            → React Query hooks for /api/v1/projects/*
  useExploreDesign.ts       → React Query hooks for /api/v1/explore-design/*
```

### Key query keys:
```typescript
["projects", { type, status, mine_only }]           // project list
["project", projectId]                               // project detail
["project-state", projectId]                         // wizard state
["project-versions", projectId]                      // version list
["project-events", projectId, { module, type }]      // event log
["project-deployments", projectId]                   // deployment list
["project-contributors", projectId]                  // contributor list
["explore-metadata", projectId, tables]              // table metadata
["explore-profile", projectId, db, schema, table]    // table profile
["explore-preview", projectId, db, schema, table]    // table preview
["explore-ddl-actions", projectId]                   // DDL action list
["explore-mappings", projectId]                      // column mappings
["explore-models", projectId]                        // model versions
["explore-deployments", projectId]                   // explore deployments
["explore-schedules", projectId]                     // schedules
```

### Invalidation rules:
- After create/update/delete project → invalidate `["projects"]` and `["project", id]`
- After save state → invalidate `["project-state", id]`
- After create version → invalidate `["project-versions", id]` and `["project", id]`
- After DDL add/execute/rollback → invalidate `["explore-ddl-actions", id]`
- After deploy → invalidate `["explore-deployments", id]` and `["project", id]`
- After create mapping → invalidate `["explore-mappings", id]`
- After any mutation → invalidate `["project-events", id]` (auto-refresh activity log)

---

## PART 5 — Implementation Order

**Phase 1: Foundation**
1. API clients (`projectsApi.ts`, `exploreDesignApi.ts`) with auth interceptor
2. Shared components: TableRefPicker, StatusBadge, ConfirmDialog, PaginatedTable
3. Type definitions (all interfaces + enums)

**Phase 2: Project Dashboard**
4. Project list page with create/delete
5. React Query hooks for project CRUD

**Phase 3: Wizard Core**
6. Wizard shell with step navigation + state persistence
7. Step 1: Source Explorer (metadata + profiling + preview + detection)

**Phase 4: Schema Design**
8. Step 2: Schema Clone + DDL actions

**Phase 5: Data Operations**
9. Step 3: Ingestion + Column Mappings
10. Step 4: Masking

**Phase 6: Deploy & Schedule**
11. Step 5: Model versions + Deploy workflow
12. Step 6: Scheduling + Task management

**Phase 7: Polish**
13. Activity log sidebar
14. Templates system
15. Contributors management
16. Error handling + loading states
