# Data360 API Documentation

## Overview

This document provides comprehensive API documentation for the Data360 frontend integration.

**Base URL:** `http://127.0.0.1:8000`

**Authentication:** All endpoints require JWT Bearer token in `Authorization` header plus:
- `X-Account-Name`: Account identifier (e.g., "ESPRIT")
- `X-Username`: Current username

---

## 1. EXPLORE-DESIGN Module

### Events & Design Operations

#### POST `/explore-design/add-event`
Add a design event (auto-creates project if needed).

**Input:**
```json
{
  "project_id": "string",           // Optional, auto-generates if not provided
  "event_type": "string",           // e.g., "TABLE_CREATED", "COLUMN_RENAMED", "SCHEMA_MODIFIED"
  "event_details": {                // Event-specific data
    "database": "string",
    "schema": "string",
    "table": "string",
    "columns": ["col1", "col2"]
  },
  "module_type": "explore-design" | "mapping" | "workflow"
}
```

**Output:**
```json
{
  "status": "success",
  "message": "Event recorded successfully",
  "project_id": "string"
}
```

**Cache Invalidation:** `EXPLORE_EVENTS`

---

#### GET `/explore-design/events/{project_id}`
Get all events for a project.

**Output:**
```json
{
  "project_id": "string",
  "events": [
    {
      "event_id": "uuid",
      "event_type": "TABLE_CREATED",
      "username": "string",
      "timestamp": "ISO-8601",
      "status": "SUCCESS",
      "details": { ... },
      "error_message": null
    }
  ]
}
```

---

### Deployments

#### POST `/explore-design/deployments`
Create a deployment for events.

**Input:**
```json
{
  "project_id": "string",
  "version": "string",               // e.g., "1.0.0", "v2.0"
  "type": "immediate" | "scheduled" | "staged",
  "event_ids": ["id1", "id2"],       // Array of event IDs to deploy
  "config": {                        // Deployment configuration
    "warehouse": "COMPUTE_WH",
    "target_database": "PROD_DB"
  }
}
```

**Output:**
```json
{
  "deployment_id": "dep_abc123xyz",
  "status": "pending_review" | "approved",
  "approval_required": true | false
}
```

**Cache Invalidation:** `DEPLOYMENTS`

---

#### GET `/explore-design/deployments/{deployment_id}`
Get deployment details.

**Output:**
```json
{
  "deployment_id": "string",
  "project_id": "string",
  "version": "string",
  "type": "immediate",
  "status": "draft" | "pending_review" | "approved" | "deploying" | "deployed" | "failed",
  "config": { ... },
  "event_ids": ["id1", "id2"],
  "created_by": "username",
  "created_at": "ISO-8601",
  "approved_by": "username" | null,
  "approved_at": "ISO-8601" | null,
  "deployed_at": "ISO-8601" | null,
  "error": "string" | null
}
```

---

#### POST `/explore-design/deployments/{deployment_id}/execute`
Execute a deployment.

**Input:**
```json
{
  "execution_mode": "dry_run" | "live"  // Optional, defaults to live
}
```

**Output:**
```json
{
  "deployment_id": "string",
  "status": "deployed",
  "execution_started": "ISO-8601"
}
```

**Cache Invalidation:** `DEPLOYMENTS`

---

#### GET `/explore-design/deployments/project/{project_id}`
List deployments for a project.

**Query Params:**
- `status`: Filter by status (optional)
- `limit`: Max results (default: 20)

**Output:**
```json
{
  "deployments": [
    {
      "deployment_id": "string",
      "project_id": "string",
      "version": "string",
      "type": "immediate",
      "status": "deployed",
      "created_by": "username",
      "created_at": "ISO-8601",
      "deployed_at": "ISO-8601"
    }
  ],
  "total": 5
}
```

---

### Approvals

#### GET `/explore-design/approvals/pending`
Get pending approval requests.

**Output:**
```json
{
  "pending": [
    {
      "approval_request_id": "apr_dep_xxx",
      "deployment_id": "dep_xxx",
      "project_id": "string",
      "version": "string",
      "type": "scheduled",
      "requested_by": "username",
      "requested_at": "ISO-8601",
      "status": "pending",
      "priority": "high" | "medium" | "low"
    }
  ],
  "total": 3
}
```

---

#### POST `/explore-design/approvals/{approval_id}/approve`
Approve a deployment.

**Input:**
```json
{
  "comment": "Approved for production"  // Optional
}
```

**Output:**
```json
{
  "success": true,
  "deployment_status": "approved"
}
```

**Cache Invalidation:** `DEPLOYMENTS`

---

#### POST `/explore-design/approvals/{approval_id}/reject`
Reject a deployment.

**Input:**
```json
{
  "comment": "Needs revision"
}
```

**Output:**
```json
{
  "success": true,
  "message": "Deployment rejected"
}
```

**Cache Invalidation:** `DEPLOYMENTS`

---

### Schema Operations

#### POST `/explore-design/schema-clone`
Create schema clone configuration.

**Input:**
```json
{
  "source_database": "string",
  "source_schema": "string",
  "target_database": "string",
  "target_schema": "string",
  "naming_strategy": "append_version" | "prefix" | "suffix",
  "include_data": false,
  "include_constraints": true,
  "include_policies": true,
  "include_grants": false,
  "warehouse": "COMPUTE_WH"
}
```

**Output:**
```json
{
  "clone_id": "uuid",
  "status": "pending",
  "ddl_statements": ["CREATE ...", "ALTER ..."],
  "tables_count": 15,
  "estimated_time": "5 minutes"
}
```

**Cache Invalidation:** `SCHEMA_CLONES`

---

### Detection

#### POST `/explore-design/detect/sensitive`
Detect sensitive columns in tables.

**Input:**
```json
{
  "project_id": "string",           // Optional
  "tables": [
    {"database": "DB", "schema": "SCH", "table": "TBL"}
  ],
  "patterns": ["email", "ssn", "phone", "address", "credit_card", "dob"],
  "sample_data": true,
  "sample_size": 100
}
```

**Output:**
```json
{
  "status": "success",
  "tables_scanned": 5,
  "detections": [
    {
      "table": "USERS",
      "column": "EMAIL",
      "sensitivity_type": "email",
      "confidence": 0.95,
      "sample_matches": 3
    }
  ]
}
```

---

#### POST `/explore-design/detect/relations`
Detect relationships between tables.

**Input:**
```json
{
  "project_id": "string",
  "source_tables": [{"database": "DB", "schema": "SCH", "table": "TBL"}],
  "target_tables": [{"database": "DB", "schema": "SCH", "table": "TBL"}],
  "detection_methods": ["naming_convention", "data_sampling", "pk_fk_analysis"]
}
```

**Output:**
```json
{
  "status": "success",
  "detected_relations": [
    {
      "source_table": "ORDERS",
      "source_column": "CUSTOMER_ID",
      "target_table": "CUSTOMERS",
      "target_column": "ID",
      "relation_type": "many-to-one",
      "confidence": 0.92
    }
  ],
  "suggestions": []
}
```

---

## 2. MAPPING Module

### Project Management

#### POST `/mapping/create_project`
Create a mapping project.

**Input:**
```json
{
  "name": "My Mapping Project"
}
```

**Output:**
```json
{
  "message": "Project created",
  "project_id": "uuid"
}
```

---

#### POST `/mapping/get_projects`
Get all projects for current user.

**Output:**
```json
{
  "projects": [
    {
      "project_id": "uuid",
      "name": "string",
      "status": "ACTIVE" | "LOCKED",
      "created_at": "ISO-8601"
    }
  ]
}
```

---

### Schema Navigation

#### GET `/mapping/databases`
List available databases.

**Output:**
```json
{
  "databases": ["DB1", "DB2", "DB3"]
}
```

---

#### GET `/mapping/schemas/{database_name}`
List schemas in a database.

**Output:**
```json
{
  "schemas": ["PUBLIC", "RAW", "STAGING"]
}
```

---

#### GET `/mapping/tables/{database_name}/{schema_name}`
List tables in a schema.

**Output:**
```json
{
  "tables": [
    {
      "name": "USERS",
      "row_count": 10000,
      "size_bytes": 1048576
    }
  ]
}
```

---

### Column Operations

#### GET `/mapping/get_table_columns`
Get columns for a table.

**Query Params:**
- `database`: Database name
- `schema`: Schema name
- `table`: Table name

**Output:**
```json
{
  "columns": [
    {
      "name": "ID",
      "data_type": "NUMBER",
      "nullable": false,
      "default": null,
      "is_primary_key": true
    }
  ]
}
```

---

#### POST `/mapping/store-selected-columns`
Store selected columns for mapping.

**Input:**
```json
{
  "project_id": "uuid",
  "database": "string",
  "schema": "string",
  "table": "string",
  "columns": ["COL1", "COL2", "COL3"]
}
```

**Output:**
```json
{
  "status": "success",
  "stored_columns": 3
}
```

---

### Deployment

#### POST `/mapping/deploy_model`
Deploy a mapping model.

**Input:**
```json
{
  "project_id": "uuid",
  "target_database": "string",
  "target_schema": "string",
  "options": {
    "create_tables": true,
    "truncate_first": false
  }
}
```

**Output:**
```json
{
  "status": "success",
  "tables_created": 5,
  "rows_affected": 10000
}
```

---

#### POST `/mapping/schedule_deployment`
Schedule a deployment for later.

**Input:**
```json
{
  "project_id": "uuid",
  "scheduled_date": "2024-01-15T10:00:00Z",
  "mappings": [
    {
      "source_database": "string",
      "source_schema": "string",
      "source_table": "string",
      "target_database": "string",
      "target_schema": "string",
      "target_table": "string",
      "source_columns": ["COL1"],
      "target_columns": ["COL1"],
      "pk_source": ["ID"],
      "pk_target": ["ID"]
    }
  ]
}
```

**Output:**
```json
{
  "event_id": "uuid",
  "status": "PENDING_APPROVAL",
  "scheduled_date": "ISO-8601"
}
```

---

## 3. WORKFLOW Module

#### POST `/workflow/create_workflow`
Create a new workflow.

**Input:**
```json
{
  "workflow_name": "Daily ETL",
  "steps": [
    {
      "step_name": "Extract",
      "step_type": "SQL",
      "config": {
        "query": "SELECT * FROM source"
      }
    }
  ]
}
```

**Output:**
```json
{
  "workflow_id": "uuid",
  "status": "created"
}
```

---

#### GET `/workflow/get_workflows`
List user's workflows.

**Output:**
```json
{
  "workflows": [
    {
      "workflow_id": "uuid",
      "name": "Daily ETL",
      "status": "ACTIVE",
      "last_run": "ISO-8601"
    }
  ]
}
```

---

#### POST `/workflow/schedule_workflow`
Schedule a workflow with cron.

**Input:**
```json
{
  "workflow_id": "uuid",
  "cron_expression": "0 8 * * *",
  "warehouse": "COMPUTE_WH"
}
```

**Output:**
```json
{
  "task_name": "WF_DAILY_ETL",
  "status": "SCHEDULED",
  "next_run": "ISO-8601"
}
```

---

## 4. GOVERNANCE Module

#### GET `/gouvernance/users`
List Snowflake users.

**Output:**
```json
{
  "users": [
    {
      "name": "ADMIN_USER",
      "login_name": "admin@company.com",
      "disabled": false,
      "default_role": "ACCOUNTADMIN"
    }
  ]
}
```

---

#### GET `/gouvernance/roles`
List Snowflake roles.

**Output:**
```json
{
  "roles": [
    {
      "name": "DATA_ANALYST",
      "owner": "ACCOUNTADMIN",
      "granted_roles": ["PUBLIC"]
    }
  ]
}
```

---

#### GET `/gouvernance/grants`
List grants/permissions.

**Output:**
```json
{
  "grants": [
    {
      "privilege": "SELECT",
      "granted_on": "TABLE",
      "name": "USERS",
      "granted_to": "DATA_ANALYST",
      "granted_by": "ADMIN"
    }
  ]
}
```

---

## 5. CORTEX (AI/ML) Module

#### POST `/cortex/analyst/query`
Natural language query.

**Input:**
```json
{
  "question": "What are the top 10 customers by revenue?",
  "database": "ANALYTICS",
  "schema": "PUBLIC"
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "sql": "SELECT customer_name, SUM(revenue) ...",
    "results": [...],
    "explanation": "I found the top customers..."
  }
}
```

---

#### POST `/cortex/ml/forecast`
Time series forecasting.

**Input:**
```json
{
  "table": "SALES",
  "timestamp_column": "DATE",
  "value_column": "AMOUNT",
  "periods": 30
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "forecast": [
      {"date": "2024-01-01", "predicted": 1500, "lower": 1200, "upper": 1800}
    ]
  }
}
```

---

#### POST `/cortex/ml/sentiment`
Sentiment analysis.

**Input:**
```json
{
  "texts": ["Great product!", "Terrible service"]
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "results": [
      {"text": "Great product!", "sentiment": "positive", "score": 0.95},
      {"text": "Terrible service", "sentiment": "negative", "score": 0.87}
    ]
  }
}
```

---

## 6. CACHE MANAGEMENT

#### GET `/cache/stats`
Get cache statistics.

**Output:**
```json
{
  "hits": 1500,
  "misses": 200,
  "hit_rate": 0.88,
  "keys_count": 150,
  "memory_used_mb": 25.5
}
```

---

#### POST `/cache/clear/pattern`
Clear cache by pattern.

**Input:**
```json
{
  "pattern": "mapping:*"
}
```

**Output:**
```json
{
  "cleared": 25,
  "pattern": "mapping:*"
}
```

---

#### GET `/cache/stream` (SSE)
Server-Sent Events for cache invalidation.

**Event Format:**
```
event: cache_invalidation
data: {"key": "EXPLORE_EVENTS", "timestamp": "ISO-8601", "source": "add-event"}

event: cache_invalidation
data: {"key": "DEPLOYMENTS", "timestamp": "ISO-8601", "source": "approve"}
```

**Frontend Usage:**
```typescript
const eventSource = new EventSource('/api/cache/stream');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Invalidate local cache based on key
  queryClient.invalidateQueries([data.key]);
};
```

---

## Cache Keys Reference

| Key | Description | Invalidated By |
|-----|-------------|----------------|
| `EXPLORE_EVENTS` | Design events | add-event |
| `DEPLOYMENTS` | Deployment records | deployments, approve, reject, execute |
| `SCHEMA_CLONES` | Schema clone configs | schema-clone, execute, rollback |
| `INGESTION_CONFIGS` | Ingestion settings | ingestion/adapt, create-versioned |
| `SCHEMA_VERSIONS` | Version history | promote, create-versioned |
| `TASKS` | Snowflake tasks | pause, resume |
| `MAPPING_PROJECTS` | Mapping projects | create_project, deploy_model |
| `WORKFLOWS` | Workflow definitions | create_workflow, update_workflow |

---

## Data Flow Diagrams

### Explore-Design Flow
```
[User Action]
    ↓
POST /add-event → Store in EXPLORE_DESIGN_EVENTS → Invalidate EXPLORE_EVENTS cache
    ↓
POST /deployments → Create EXPLORE_DEPLOYMENTS record → Invalidate DEPLOYMENTS cache
    ↓
(If type != immediate)
    ↓
GET /approvals/pending → Show pending approvals
    ↓
POST /approvals/{id}/approve → Update status → Invalidate DEPLOYMENTS cache
    ↓
POST /deployments/{id}/execute → Run SQL → Update status → SSE notification
```

### Mapping Flow
```
[Create Project]
    ↓
POST /create_project → Create in MAPPING_PROJECTS
    ↓
GET /databases → GET /schemas → GET /tables → Navigate schema
    ↓
POST /store-selected-columns → Store selections
    ↓
POST /add-event → Log mapping events
    ↓
POST /schedule_deployment → Schedule for approval
    ↓
POST /approve_deployment → Approve
    ↓
POST /activate_deployment → Execute mapping
```

---

## Error Handling

All endpoints return errors in this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad request (validation error)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `500` - Internal server error

---

## Frontend Integration Tips

### 1. Authentication Headers
```typescript
const headers = {
  'Authorization': `Bearer ${token}`,
  'X-Account-Name': session.account_name,
  'X-Username': session.username,
  'Content-Type': 'application/json'
};
```

### 2. SSE Cache Invalidation
```typescript
// In CacheInvalidationProvider
useEffect(() => {
  const eventSource = new EventSource(`${API_URL}/cache/stream`);

  eventSource.addEventListener('cache_invalidation', (event) => {
    const { key } = JSON.parse(event.data);
    queryClient.invalidateQueries([key]);
  });

  return () => eventSource.close();
}, []);
```

### 3. Optimistic Updates
```typescript
// For immediate feedback
const mutation = useMutation({
  mutationFn: addEvent,
  onMutate: async (newEvent) => {
    await queryClient.cancelQueries(['events']);
    const previous = queryClient.getQueryData(['events']);
    queryClient.setQueryData(['events'], (old) => [...old, newEvent]);
    return { previous };
  },
  onError: (err, newEvent, context) => {
    queryClient.setQueryData(['events'], context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries(['events']);
  }
});
```

---

## Database Tables (CP_DATA360.EVENT_STORE)

| Table | Purpose |
|-------|---------|
| `EXPLORE_DESIGN_EVENTS` | Design event log |
| `EXPLORE_DEPLOYMENTS` | Deployment records |
| `EXPLORE_PROJECTS` | Project definitions |
| `SCHEMA_CLONES` | Clone configurations |
| `INGESTION_CONFIGS` | Ingestion settings |
| `USER_ACTIVITY` | Unified activity log |

---

*Generated: 2024-12-13*
