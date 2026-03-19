# Explore & Design — API Integration Guide

Base path: `/api/v1/explore-design`

All endpoints require `Authorization: Bearer <token>` header.

---

## Table of Contents

1. [Phase A — Event Validation (Page 2)](#phase-a--event-validation)
2. [Phase B — Deployment Pipeline (Page 3)](#phase-b--deployment-pipeline)
3. [Phase C — Self-Serve Ingestion (Page 4)](#phase-c--self-serve-ingestion)
4. [Phase D — Event Lifecycle (Page 5)](#phase-d--event-lifecycle)
5. [AI Phase 1 — Schema Intelligence (Page 7)](#ai-phase-1--schema-intelligence)
6. [AI Phase 2 — Modeling Copilot (Page 8)](#ai-phase-2--modeling-copilot)
7. [AI Phase 3 — Cost Optimizer (Page 9)](#ai-phase-3--cost-optimizer)
8. [AI Phase 4 — Deployment Intelligence (Page 10)](#ai-phase-4--deployment-intelligence)
9. [AI Phase 5 — Continuous Learning (Page 11)](#ai-phase-5--continuous-learning)

---

## Phase A — Event Validation

### A2 — Validate FK Type Compatibility

Checks that FK source/target column types are compatible before DDL execution.

```
POST /{project_id}/validate/fk-types
```

**Input:**
```json
{
  "source_database": "ANALYTICS",
  "source_schema": "PUBLIC",
  "source_table": "ORDERS",
  "source_column": "CUSTOMER_ID",
  "target_database": "ANALYTICS",
  "target_schema": "PUBLIC",
  "target_table": "CUSTOMERS",
  "target_column": "ID"
}
```

**Output:**
```json
{
  "compatible": true,
  "source_type": "NUMBER(38,0)",
  "source_family": "NUMERIC",
  "target_type": "INTEGER",
  "target_family": "NUMERIC",
  "message": "Types are compatible (same family: NUMERIC)"
}
```

When incompatible:
```json
{
  "compatible": false,
  "source_type": "NUMBER(38,0)",
  "source_family": "NUMERIC",
  "target_type": "VARCHAR(50)",
  "target_family": "STRING",
  "message": "Incompatible types: NUMERIC → STRING"
}
```

---

### A3 — Cascade Table Rename

Auto-updates all dependent DDL events when a table is renamed.

```
POST /{project_id}/cascade/rename
```

**Input:**
```json
{
  "old_table_name": "ORDERS",
  "new_table_name": "FACT_ORDERS"
}
```

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "old_name": "ORDERS",
  "new_name": "FACT_ORDERS",
  "events_updated": 5,
  "updated_event_ids": ["EVT-001", "EVT-002", "EVT-003", "EVT-004", "EVT-005"]
}
```

### A3 — Cascade Table Drop

Marks dependent DDL events as INVALIDATED when a table is dropped.

```
POST /{project_id}/cascade/drop
```

**Input:**
```json
{
  "table_name": "ORDERS"
}
```

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "table_name": "ORDERS",
  "events_invalidated": 3,
  "invalidated_event_ids": ["EVT-002", "EVT-004", "EVT-005"]
}
```

---

### A4 — Enhanced Impact Analysis

Risk-rated impact report with recommendations before deployment.

```
POST /{project_id}/impact-analysis/enhanced
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table_name": "ORDERS",
  "ddl_type": "DROP_TABLE"
}
```

**Output:**
```json
{
  "table_name": "ORDERS",
  "ddl_type": "DROP_TABLE",
  "risk_score": 15,
  "safe_to_proceed": false,
  "impacts": [
    {
      "object_type": "VIEW",
      "object_name": "V_ORDER_SUMMARY",
      "risk_level": "HIGH",
      "recommendation": "Update view definition before deploying",
      "last_accessed": "2026-03-18T14:30:00Z"
    }
  ],
  "summary": {
    "high_risk": 2,
    "medium_risk": 1,
    "low_risk": 3,
    "total_score": 15
  }
}
```

---

## Phase B — Deployment Pipeline

### B2 — Atomic DDL Execution

Existing `POST /{project_id}/ddl-actions/execute` now accepts `atomic` parameter.

**Modified Input** (add to existing body):
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "atomic": true
}
```

When `atomic: true`: clone schema → execute all DDL on clone → swap if all succeed → auto-rollback on failure.

---

### B3 — Pre-Deployment Checks

Runs 5 automated checks before deployment.

```
POST /{project_id}/pre-deploy-checks
```

**Input:**
```json
{
  "warehouse": "COMPUTE_WH",
  "check_types": ["warehouse", "fk_types", "circular_deps", "naming", "schema_drift"]
}
```

`check_types` is optional — defaults to all 5 checks. Options: `warehouse`, `fk_types`, `circular_deps`, `naming`, `schema_drift`.

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "all_passed": false,
  "checks": [
    {
      "check": "warehouse_availability",
      "status": "PASS",
      "details": { "warehouse": "COMPUTE_WH", "state": "STARTED", "size": "MEDIUM" }
    },
    {
      "check": "fk_type_compatibility",
      "status": "PASS",
      "details": { "fk_events_checked": 3, "all_compatible": true }
    },
    {
      "check": "circular_dependency",
      "status": "FAIL",
      "details": { "cycle_detected": true, "cycle": ["TABLE_A", "TABLE_B", "TABLE_A"] }
    },
    {
      "check": "naming_convention",
      "status": "WARN",
      "details": { "violations": [{ "name": "orderDate", "expected_pattern": "^[A-Z][A-Z0-9_]*$" }] }
    },
    {
      "check": "schema_drift",
      "status": "PASS",
      "details": { "tables_checked": 5, "drifted": 0 }
    }
  ]
}
```

---

### B5 — SQL Diff Preview

Before/after column diff for pending DDL events.

```
POST /{project_id}/sql-diff
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema_name": "PUBLIC",
  "event_ids": ["EVT-001", "EVT-002"]
}
```

`event_ids` is optional — defaults to all pending events.

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "diffs": [
    {
      "event_id": "EVT-001",
      "ddl_type": "ADD_COLUMN",
      "target_table": "ORDERS",
      "before": {
        "columns": ["ORDER_ID", "CUSTOMER_ID", "AMOUNT"]
      },
      "after": {
        "columns": ["ORDER_ID", "CUSTOMER_ID", "AMOUNT", "STATUS"]
      },
      "changes": [
        { "type": "ADD_COLUMN", "column": "STATUS", "data_type": "VARCHAR(50)" }
      ]
    }
  ],
  "total_events": 2
}
```

---

## Phase C — Self-Serve Ingestion

### C1 — WHERE Clause Builder

Existing ingestion endpoints now accept `where_clauses` for filtered ingestion.

**Modified Input** (add to `POST /{project_id}/ingestion/execute` and `POST /{project_id}/ingestion/dry-run`):
```json
{
  "where_clauses": [
    { "column": "CREATED_AT", "operator": ">=", "value": "2026-01-01" },
    { "column": "STATUS", "operator": "IN", "values": ["ACTIVE", "PENDING"] },
    { "column": "AMOUNT", "operator": "BETWEEN", "value": "100", "value_end": "5000" }
  ]
}
```

Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `BETWEEN`, `LIKE`, `IS NULL`, `IS NOT NULL`.

---

### C3 — SQL Preview

Preview generated MERGE/INSERT/COPY SQL without executing.

```
POST /{project_id}/ingestion/sql-preview
```

**Input:**
```json
{
  "source_database": "RAW",
  "source_schema": "PUBLIC",
  "source_table": "ORDERS_RAW",
  "target_database": "ANALYTICS",
  "target_schema": "PUBLIC",
  "target_table": "ORDERS",
  "ingestion_mode": "INCREMENTAL",
  "mappings": [
    { "source_column": "order_id", "target_column": "ORDER_ID" },
    { "source_column": "customer_id", "target_column": "CUSTOMER_ID" }
  ],
  "where_clauses": [
    { "column": "CREATED_AT", "operator": ">=", "value": "2026-01-01" }
  ]
}
```

**Output:**
```json
{
  "sql": "MERGE INTO ANALYTICS.PUBLIC.ORDERS AS tgt USING (SELECT ...) AS src ON ...",
  "ingestion_mode": "INCREMENTAL",
  "source": "RAW.PUBLIC.ORDERS_RAW",
  "target": "ANALYTICS.PUBLIC.ORDERS",
  "estimated_columns": 2,
  "has_where_filter": true
}
```

---

### C5 — Watermark Tracking

Track last-loaded timestamps per source table for incremental loads.

#### List all watermarks

```
GET /{project_id}/watermarks
```

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "watermarks": [
    {
      "watermark_id": "WM-abc123",
      "source_fqn": "RAW.PUBLIC.ORDERS",
      "watermark_column": "UPDATED_AT",
      "last_value": "2026-03-18T10:30:00",
      "rows_loaded": 15420,
      "last_run_at": "2026-03-18T10:35:00Z",
      "updated_by": "ADMIN"
    }
  ],
  "total": 1
}
```

#### Get single watermark

```
GET /{project_id}/watermarks/{source_table_fqn}
```

Path param: `source_table_fqn` = `RAW.PUBLIC.ORDERS` (URL-encoded: `RAW.PUBLIC.ORDERS`)

**Output:**
```json
{
  "watermark_id": "WM-abc123",
  "source_fqn": "RAW.PUBLIC.ORDERS",
  "watermark_column": "UPDATED_AT",
  "last_value": "2026-03-18T10:30:00",
  "rows_loaded": 15420,
  "last_run_at": "2026-03-18T10:35:00Z",
  "updated_by": "ADMIN"
}
```

---

## Phase D — Event Lifecycle

### D3 — Audit Trail

Immutable log of all changes with old/new values.

```
GET /{project_id}/audit-trail
```

**Query params (all optional):**
| Param | Type | Description |
|-------|------|-------------|
| `entity_type` | string | Filter by entity type (TABLE, COLUMN, VIEW, etc.) |
| `entity_fqn` | string | Partial match on entity fully-qualified name |
| `action` | string | Filter by action (CREATE, ALTER, DROP, RENAME, etc.) |
| `username` | string | Filter by user |
| `from_timestamp` | string | ISO timestamp lower bound |
| `to_timestamp` | string | ISO timestamp upper bound |
| `limit` | int | Max results (default 50, max 500) |

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "entries": [
    {
      "audit_id": "AUD-abc123",
      "project_id": "PRJ-abc123",
      "event_id": "EVT-001",
      "entity_type": "TABLE",
      "entity_fqn": "ANALYTICS.PUBLIC.ORDERS",
      "action": "ALTER",
      "old_value": { "columns": ["ORDER_ID", "AMOUNT"] },
      "new_value": { "columns": ["ORDER_ID", "AMOUNT", "STATUS"] },
      "username": "ADMIN",
      "timestamp": "2026-03-18T14:30:00Z"
    }
  ],
  "total": 1,
  "limit": 50
}
```

---

### D4 — Event Templates

Reusable event bundles with `{{VARIABLE}}` substitution.

#### Create template

```
POST /event-templates
```

**Input:**
```json
{
  "template_name": "Add Dimension Table",
  "description": "Standard dimension table with audit columns",
  "category": "DIMENSION",
  "events": [
    {
      "ddl_type": "CREATE_TABLE",
      "ddl_sql": "CREATE TABLE {{DATABASE}}.{{SCHEMA}}.{{TABLE_NAME}} (ID INTEGER AUTOINCREMENT, NAME VARCHAR(255), CREATED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(), UPDATED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP())",
      "target_table": "{{DATABASE}}.{{SCHEMA}}.{{TABLE_NAME}}",
      "description": "Create dimension table {{TABLE_NAME}}",
      "priority": 1
    }
  ]
}
```

**Output:**
```json
{
  "template_id": "TPL-abc123def456",
  "template_name": "Add Dimension Table",
  "category": "DIMENSION",
  "events_count": 1
}
```

#### List templates

```
GET /event-templates?category=DIMENSION
```

**Output:**
```json
[
  {
    "template_id": "TPL-abc123def456",
    "template_name": "Add Dimension Table",
    "description": "Standard dimension table with audit columns",
    "category": "DIMENSION",
    "events": [...],
    "is_builtin": false,
    "created_by": "ADMIN",
    "created_at": "2026-03-18T14:30:00Z"
  }
]
```

#### Apply template to project

```
POST /{project_id}/event-templates/apply
```

**Input:**
```json
{
  "template_id": "TPL-abc123def456",
  "target_database": "ANALYTICS",
  "target_schema": "PUBLIC",
  "variable_overrides": {
    "TABLE_NAME": "DIM_CUSTOMER"
  }
}
```

Variables `{{DATABASE}}` and `{{SCHEMA}}` are auto-set from `target_database`/`target_schema`. Additional variables can be overridden.

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "template_id": "TPL-abc123def456",
  "template_name": "Add Dimension Table",
  "events_created": 1,
  "events": [
    {
      "event_id": "EVT-new001",
      "ddl_type": "CREATE_TABLE",
      "target_table": "ANALYTICS.PUBLIC.DIM_CUSTOMER",
      "status": "PENDING"
    }
  ]
}
```

---

## AI Phase 1 — Schema Intelligence

> Cortex cost: ~0.009 credits/session

### 1.1 — Smart Column Classification

Classifies columns into semantic categories using Cortex mistral-7b.

```
POST /{project_id}/ai/classify-columns
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "CUSTOMERS"
}
```

Optional: `profile_data` (dict) — pre-computed column profiling data to enrich classification.

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "classifications": [
    {
      "column": "EMAIL",
      "data_type": "VARCHAR",
      "category": "PII",
      "sub_category": "email_address",
      "confidence": 0.95,
      "suggestion": "Consider masking policy"
    },
    {
      "column": "TOTAL_SPEND",
      "data_type": "NUMBER",
      "category": "METRIC",
      "sub_category": "monetary_value",
      "confidence": 0.88,
      "suggestion": null
    }
  ],
  "cortex_credits": 0.0001
}
```

**Categories:** `PII`, `METRIC`, `DIMENSION`, `KEY`, `AUDIT`, `TECHNICAL`, `UNKNOWN`

---

### 1.2 — Relationship Discovery

Discovers potential FK relationships using column name similarity and Cortex embeddings.

```
POST /{project_id}/ai/discover-relationships
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "tables": ["ORDERS", "CUSTOMERS", "PRODUCTS"]
}
```

`tables` is optional — defaults to all tables in the schema.

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "relationships": [
    {
      "source_table": "ORDERS",
      "source_column": "CUSTOMER_ID",
      "target_table": "CUSTOMERS",
      "target_column": "ID",
      "confidence": 0.92,
      "discovery_method": "name_pattern",
      "suggested_fk": "ALTER TABLE ORDERS ADD CONSTRAINT FK_ORDERS_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES CUSTOMERS(ID)"
    }
  ],
  "tables_analyzed": 3,
  "cortex_credits": 0.003
}
```

---

### 1.3 — Schema Health Score

Calculates a composite health score based on completeness, naming, and type efficiency.

```
POST /{project_id}/ai/schema-health
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC"
}
```

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "overall_score": 72,
  "sub_scores": {
    "completeness": {
      "score": 85,
      "details": {
        "tables_with_pk": 8,
        "tables_total": 10,
        "columns_with_comments": 45,
        "columns_total": 120
      }
    },
    "naming": {
      "score": 60,
      "violations": [
        { "table": "ORDERS", "column": "orderDate", "issue": "Not UPPER_SNAKE_CASE" }
      ]
    },
    "type_efficiency": {
      "score": 70,
      "suggestions": [
        { "table": "ORDERS", "column": "STATUS", "current": "VARCHAR(1000)", "suggested": "VARCHAR(50)", "reason": "Max observed length: 20" }
      ]
    }
  },
  "recommendations": [
    "Add primary keys to 2 tables",
    "Fix 5 naming violations",
    "Optimize 3 oversized VARCHAR columns"
  ],
  "cortex_credits": 0.005
}
```

---

## AI Phase 2 — Modeling Copilot

> 3 features at ZERO cost (pure Python), 1 uses Cortex (~0.0001 credits)

### 2.1 — Table Column Suggestions

Suggests columns for a new table based on purpose description using Cortex AI.

```
POST /{project_id}/ai/suggest-columns
```

**Input:**
```json
{
  "table_purpose": "Track customer orders with line items and shipping",
  "domain": "ecommerce",
  "existing_tables": ["CUSTOMERS", "PRODUCTS"]
}
```

**Output:**
```json
{
  "table_purpose": "Track customer orders with line items and shipping",
  "suggested_columns": [
    { "name": "ORDER_ID", "type": "INTEGER", "role": "primary_key", "nullable": false },
    { "name": "CUSTOMER_ID", "type": "INTEGER", "role": "foreign_key", "references": "CUSTOMERS.ID" },
    { "name": "ORDER_DATE", "type": "TIMESTAMP_LTZ", "role": "dimension", "nullable": false },
    { "name": "TOTAL_AMOUNT", "type": "NUMBER(18,2)", "role": "metric", "nullable": false },
    { "name": "STATUS", "type": "VARCHAR(50)", "role": "dimension", "nullable": false },
    { "name": "SHIPPING_ADDRESS", "type": "VARCHAR(500)", "role": "attribute", "nullable": true },
    { "name": "CREATED_AT", "type": "TIMESTAMP_LTZ", "role": "audit", "nullable": false },
    { "name": "UPDATED_AT", "type": "TIMESTAMP_LTZ", "role": "audit", "nullable": false }
  ],
  "cortex_credits": 0.0001
}
```

---

### 2.2 — Naming Convention Checker (ZERO COST)

Checks names against convention rules using pure Python regex.

```
POST /{project_id}/ai/check-naming
```

**Input:**
```json
{
  "names": ["ORDER_ID", "customerName", "order-date", "TOTAL_AMOUNT"],
  "entity_type": "column",
  "convention": "UPPER_SNAKE"
}
```

`entity_type`: `table` | `column` | `schema`
`convention`: `UPPER_SNAKE` | `lower_snake` | `camelCase` | `PascalCase`

**Output:**
```json
{
  "convention": "UPPER_SNAKE",
  "entity_type": "column",
  "total": 4,
  "valid": 2,
  "invalid": 2,
  "results": [
    { "name": "ORDER_ID", "valid": true, "suggested": null },
    { "name": "customerName", "valid": false, "suggested": "CUSTOMER_NAME" },
    { "name": "order-date", "valid": false, "suggested": "ORDER_DATE" },
    { "name": "TOTAL_AMOUNT", "valid": true, "suggested": null }
  ],
  "cortex_credits": 0
}
```

---

### 2.3 — Data Type Optimizer (ZERO COST)

Suggests optimized data types based on actual data patterns.

```
POST /{project_id}/ai/optimize-types
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "ORDERS"
}
```

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "ORDERS",
  "optimizations": [
    {
      "column": "STATUS",
      "current_type": "VARCHAR(1000)",
      "suggested_type": "VARCHAR(50)",
      "reason": "Max observed length is 20 characters",
      "savings_estimate": "~60% storage reduction for this column"
    },
    {
      "column": "AMOUNT",
      "current_type": "FLOAT",
      "suggested_type": "NUMBER(18,2)",
      "reason": "Monetary values should use fixed precision to avoid rounding errors",
      "savings_estimate": null
    }
  ],
  "cortex_credits": 0
}
```

---

### 2.4 — SCD Type Recommender

Recommends SCD type based on table structure and optional business context.

```
POST /{project_id}/ai/recommend-scd
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "business_context": "We need to track all address changes for compliance"
}
```

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "CUSTOMERS",
  "recommended_type": "SCD_TYPE2",
  "confidence": 0.85,
  "reasoning": "Table has temporal indicators (UPDATED_AT) and business context requires full history tracking for compliance. SCD Type 2 preserves complete change history.",
  "alternatives": [
    { "type": "SCD_TYPE1", "fit_score": 0.3, "reason": "Would lose history, not suitable for compliance" },
    { "type": "SCD_TYPE3", "fit_score": 0.5, "reason": "Tracks only current+previous, insufficient for full audit trail" }
  ],
  "implementation_hints": {
    "effective_date_column": "EFFECTIVE_FROM",
    "expiration_date_column": "EFFECTIVE_TO",
    "current_flag_column": "IS_CURRENT",
    "tracking_columns": ["ADDRESS", "CITY", "STATE", "ZIP_CODE"]
  },
  "cortex_credits": 0.0001
}
```

---

## AI Phase 3 — Cost Optimizer

> Total: ~0.005 credits/session

### 3.1 — Warehouse Sizing Analyzer

Analyzes warehouse query history and recommends optimal sizing.

```
POST /{project_id}/ai/warehouse-sizing
```

**Input:**
```json
{
  "warehouse": "COMPUTE_WH",
  "lookback_days": 30
}
```

**Output:**
```json
{
  "warehouse": "COMPUTE_WH",
  "current_size": "LARGE",
  "lookback_days": 30,
  "analysis": {
    "total_queries": 15420,
    "avg_execution_time_ms": 3200,
    "p95_execution_time_ms": 12000,
    "avg_queue_time_ms": 150,
    "peak_concurrency": 8,
    "utilization_pct": 35
  },
  "recommendation": {
    "suggested_size": "MEDIUM",
    "reason": "Average utilization is 35% — warehouse is over-provisioned. MEDIUM handles your P95 workload with acceptable queue times.",
    "estimated_savings_pct": 50,
    "estimated_savings_credits": 120.5
  },
  "cortex_credits": 0.002
}
```

---

### 3.2 — Clustering Key Suggestions

Suggests optimal clustering keys based on query patterns and data distribution.

```
POST /{project_id}/ai/clustering-keys
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "ORDERS"
}
```

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "ORDERS",
  "current_clustering": null,
  "suggestions": [
    {
      "columns": ["ORDER_DATE", "CUSTOMER_ID"],
      "score": 0.88,
      "reason": "ORDER_DATE is used in 85% of range filters; CUSTOMER_ID appears in 60% of joins",
      "estimated_scan_reduction_pct": 70
    }
  ],
  "sql": "ALTER TABLE ANALYTICS.PUBLIC.ORDERS CLUSTER BY (ORDER_DATE, CUSTOMER_ID)",
  "cortex_credits": 0.001
}
```

---

### 3.3 — Materialization Strategy

Recommends whether to use table, view, materialized view, or dynamic table.

```
POST /{project_id}/ai/materialization
```

**Input:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "V_ORDER_SUMMARY"
}
```

**Output:**
```json
{
  "database": "ANALYTICS",
  "schema": "PUBLIC",
  "table": "V_ORDER_SUMMARY",
  "current_type": "VIEW",
  "recommendation": {
    "suggested_type": "DYNAMIC_TABLE",
    "reason": "High read frequency (500 queries/day) with moderate source change rate. Dynamic table auto-refreshes and reduces compute by avoiding repeated aggregation.",
    "estimated_savings_credits": 15.2,
    "refresh_lag": "5 minutes"
  },
  "alternatives": [
    { "type": "MATERIALIZED_VIEW", "fit_score": 0.7, "tradeoff": "Limited to simple queries, no joins" },
    { "type": "VIEW", "fit_score": 0.4, "tradeoff": "Current state — recomputes on every read" },
    { "type": "TABLE", "fit_score": 0.5, "tradeoff": "Requires manual refresh pipeline" }
  ],
  "cortex_credits": 0.001
}
```

---

### 3.4 — Ingestion Mode Optimizer

Recommends optimal ingestion mode based on table characteristics.

```
POST /{project_id}/ai/ingestion-mode
```

**Input:**
```json
{
  "database": "RAW",
  "schema": "PUBLIC",
  "table": "ORDERS_RAW"
}
```

**Output:**
```json
{
  "database": "RAW",
  "schema": "PUBLIC",
  "table": "ORDERS_RAW",
  "analysis": {
    "row_count": 5000000,
    "has_timestamp_columns": true,
    "timestamp_columns": ["CREATED_AT", "UPDATED_AT"],
    "has_primary_key": true,
    "estimated_daily_inserts_pct": 2,
    "estimated_daily_updates_pct": 5
  },
  "recommendation": {
    "mode": "INCREMENTAL",
    "watermark_column": "UPDATED_AT",
    "reason": "Table has 5M rows with only ~7% daily changes. Incremental loads using UPDATED_AT watermark will reduce scan by ~93%.",
    "estimated_scan_reduction_pct": 93
  },
  "alternatives": [
    { "mode": "FULL_REFRESH", "fit_score": 0.2, "reason": "Scans all 5M rows every run — expensive" },
    { "mode": "SCD_TYPE2", "fit_score": 0.6, "reason": "Good if history tracking is needed" }
  ],
  "cortex_credits": 0.001
}
```

---

## AI Phase 4 — Deployment Intelligence

> Total: ~0.003 credits

### 4.1 — Deployment Risk Scorer

Scores deployment risk based on DDL action types and dependent objects.

```
POST /{project_id}/ai/deployment-risk
```

**Input:**
```json
{
  "ddl_actions": [
    { "ddl_type": "DROP_TABLE", "target_table": "ORDERS", "ddl_sql": "DROP TABLE ORDERS" },
    { "ddl_type": "ADD_COLUMN", "target_table": "CUSTOMERS", "ddl_sql": "ALTER TABLE CUSTOMERS ADD COLUMN EMAIL VARCHAR(255)" }
  ]
}
```

**Output:**
```json
{
  "overall_risk": "HIGH",
  "risk_score": 78,
  "max_score": 100,
  "actions": [
    {
      "ddl_type": "DROP_TABLE",
      "target_table": "ORDERS",
      "risk_level": "CRITICAL",
      "risk_score": 70,
      "factors": [
        "DROP_TABLE is destructive and irreversible",
        "Table has 3 dependent views",
        "Table was queried 500 times in the last 30 days"
      ],
      "mitigation": "Create backup before dropping. Consider renaming instead of dropping."
    },
    {
      "ddl_type": "ADD_COLUMN",
      "target_table": "CUSTOMERS",
      "risk_level": "LOW",
      "risk_score": 8,
      "factors": ["ADD_COLUMN is non-destructive"],
      "mitigation": null
    }
  ],
  "recommendation": "HIGH risk deployment — recommend dry-run first and schedule during low-traffic window",
  "cortex_credits": 0.002
}
```

---

### 4.2 — Deployment Schedule Optimizer

Finds optimal deployment window based on warehouse usage patterns.

```
POST /{project_id}/ai/deploy-schedule
```

**Input:**
```json
{
  "warehouse": "COMPUTE_WH",
  "preferred_window_hours": 4
}
```

**Output:**
```json
{
  "warehouse": "COMPUTE_WH",
  "optimal_window": {
    "day_of_week": "SUNDAY",
    "start_hour_utc": 2,
    "end_hour_utc": 6,
    "avg_utilization_pct": 5,
    "avg_concurrent_queries": 0.3
  },
  "alternative_windows": [
    {
      "day_of_week": "SATURDAY",
      "start_hour_utc": 3,
      "end_hour_utc": 7,
      "avg_utilization_pct": 8,
      "avg_concurrent_queries": 0.5
    }
  ],
  "avoid_windows": [
    {
      "day_of_week": "MONDAY",
      "start_hour_utc": 9,
      "end_hour_utc": 17,
      "reason": "Peak usage period — avg 85% utilization"
    }
  ],
  "cortex_credits": 0.001
}
```

---

## AI Phase 5 — Continuous Learning

> ZERO Cortex cost — pure Python

### 5.1 — Suggestion Feedback

Record and query user feedback on AI suggestions.

#### Record feedback

```
POST /{project_id}/ai/feedback
```

**Input:**
```json
{
  "feature": "classify_columns",
  "suggestion_id": "SUG-abc123",
  "accepted": true,
  "reason": "Classification was accurate"
}
```

**Output:**
```json
{
  "feedback_id": "FB-abc123",
  "project_id": "PRJ-abc123",
  "feature": "classify_columns",
  "suggestion_id": "SUG-abc123",
  "accepted": true,
  "recorded_at": "2026-03-18T14:30:00Z"
}
```

#### Get feedback stats

```
GET /{project_id}/ai/feedback/stats?feature=classify_columns
```

`feature` query param is optional — omit for all features.

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "stats": [
    {
      "feature": "classify_columns",
      "total": 50,
      "accepted": 42,
      "rejected": 8,
      "acceptance_rate": 0.84
    },
    {
      "feature": "suggest_clustering_keys",
      "total": 12,
      "accepted": 10,
      "rejected": 2,
      "acceptance_rate": 0.83
    }
  ],
  "overall_acceptance_rate": 0.84
}
```

---

### 5.2 — Savings Dashboard

Aggregated view of AI-driven cost savings.

```
GET /{project_id}/ai/savings?days=30
```

**Output:**
```json
{
  "project_id": "PRJ-abc123",
  "period_days": 30,
  "total_estimated_savings_credits": 245.7,
  "total_actual_savings_credits": 198.3,
  "by_feature": [
    {
      "feature": "warehouse_sizing",
      "actions": 3,
      "estimated_savings": 120.5,
      "actual_savings": 105.2
    },
    {
      "feature": "materialization",
      "actions": 5,
      "estimated_savings": 75.2,
      "actual_savings": 63.1
    },
    {
      "feature": "clustering_keys",
      "actions": 2,
      "estimated_savings": 50.0,
      "actual_savings": 30.0
    }
  ],
  "roi_multiplier": 245
}
```

---

## Cost Summary

| Phase | Features | Cortex Cost |
|-------|----------|-------------|
| Phase 1: Schema Intelligence | 1.1, 1.2, 1.3 | ~0.009 credits/session |
| Phase 2: Modeling Copilot | 2.1 (Cortex), 2.2, 2.3, 2.4 | ~0.0001 credits (3 are zero-cost) |
| Phase 3: Cost Optimizer | 3.1, 3.2, 3.3, 3.4 | ~0.005 credits |
| Phase 4: Deployment Intelligence | 4.1, 4.2 | ~0.003 credits |
| Phase 5: Continuous Learning | 5.1, 5.2 | 0 credits (pure Python) |
| **Total** | **16 features** | **~0.02 credits/session** |

Every feature has independent ON/OFF toggle. Zero-cost features (2.2, 2.3, 5.1, 5.2) use pure Python — no Cortex calls.

---

## Endpoint Summary Table

| # | Method | Path | Feature | Cost |
|---|--------|------|---------|------|
| 1 | POST | `/{project_id}/validate/fk-types` | A2: FK Type Check | — |
| 2 | POST | `/{project_id}/cascade/rename` | A3: Cascade Rename | — |
| 3 | POST | `/{project_id}/cascade/drop` | A3: Cascade Drop | — |
| 4 | POST | `/{project_id}/impact-analysis/enhanced` | A4: Enhanced Impact | — |
| 5 | POST | `/{project_id}/pre-deploy-checks` | B3: Pre-Deploy Checks | — |
| 6 | POST | `/{project_id}/sql-diff` | B5: SQL Diff | — |
| 7 | POST | `/{project_id}/ingestion/sql-preview` | C3: SQL Preview | — |
| 8 | GET | `/{project_id}/watermarks` | C5: List Watermarks | — |
| 9 | GET | `/{project_id}/watermarks/{fqn}` | C5: Get Watermark | — |
| 10 | GET | `/{project_id}/audit-trail` | D3: Audit Trail | — |
| 11 | POST | `/event-templates` | D4: Create Template | — |
| 12 | GET | `/event-templates` | D4: List Templates | — |
| 13 | POST | `/{project_id}/event-templates/apply` | D4: Apply Template | — |
| 14 | POST | `/{project_id}/ai/classify-columns` | 1.1: Column Classification | 0.0001 |
| 15 | POST | `/{project_id}/ai/discover-relationships` | 1.2: Relationship Discovery | 0.003 |
| 16 | POST | `/{project_id}/ai/schema-health` | 1.3: Schema Health Score | 0.005 |
| 17 | POST | `/{project_id}/ai/suggest-columns` | 2.1: Table Suggestions | 0.0001 |
| 18 | POST | `/{project_id}/ai/check-naming` | 2.2: Naming Checker | 0 |
| 19 | POST | `/{project_id}/ai/optimize-types` | 2.3: Type Optimizer | 0 |
| 20 | POST | `/{project_id}/ai/recommend-scd` | 2.4: SCD Recommender | 0.0001 |
| 21 | POST | `/{project_id}/ai/warehouse-sizing` | 3.1: Warehouse Sizing | 0.002 |
| 22 | POST | `/{project_id}/ai/clustering-keys` | 3.2: Clustering Keys | 0.001 |
| 23 | POST | `/{project_id}/ai/materialization` | 3.3: Materialization | 0.001 |
| 24 | POST | `/{project_id}/ai/ingestion-mode` | 3.4: Ingestion Mode | 0.001 |
| 25 | POST | `/{project_id}/ai/deployment-risk` | 4.1: Risk Scorer | 0.002 |
| 26 | POST | `/{project_id}/ai/deploy-schedule` | 4.2: Schedule Optimizer | 0.001 |
| 27 | POST | `/{project_id}/ai/feedback` | 5.1: Record Feedback | 0 |
| 28 | GET | `/{project_id}/ai/feedback/stats` | 5.1: Feedback Stats | 0 |
| 29 | GET | `/{project_id}/ai/savings` | 5.2: Savings Dashboard | 0 |
