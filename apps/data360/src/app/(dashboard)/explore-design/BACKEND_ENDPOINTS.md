# Explore & Design - Backend API Endpoints

## Base URL
```
{API_URL}/explore-design
```

---

## Column Preview & Profiling APIs

### 1. Get Column Preview (Sample Data)

**Endpoint:** `POST /explore-design/column/preview`

**Description:** Fetches sample data values from a specific column.

**Request Body:**
```json
{
  "database": "DRAFT_SOURCE_AZURE",
  "schema": "RAW_DRAFT_AZURE",
  "table": "STOCKS_MAG",
  "column": "COD_MAGASIN",
  "sample_size": 100
}
```

**Response (200 OK):**
```json
{
  "column": "COD_MAGASIN",
  "sample_values": [1885, 7222, 2517, 9910, 4878, 4233, null, 5521, 3344, 8876],
  "total_rows": 10000,
  "sample_size": 100
}
```

**SQL Example (Snowflake):**
```sql
SELECT "COD_MAGASIN"
FROM "DRAFT_SOURCE_AZURE"."RAW_DRAFT_AZURE"."STOCKS_MAG"
TABLESAMPLE (100 ROWS)
LIMIT 100;
```

---

### 2. Get Column Profile (Statistics)

**Endpoint:** `POST /explore-design/column/profile`

**Description:** Fetches detailed statistics and profiling information for a column.

**Request Body:**
```json
{
  "database": "DRAFT_SOURCE_AZURE",
  "schema": "RAW_DRAFT_AZURE",
  "table": "STOCKS_MAG",
  "column": "COD_MAGASIN"
}
```

**Response (200 OK):**
```json
{
  "column": "COD_MAGASIN",
  "data_type": "NUMBER(38,0)",
  "total_rows": 10000,
  "null_count": 486,
  "null_percentage": 4.86,
  "distinct_count": 3690,
  "distinct_percentage": 36.9,
  "min_value": 1,
  "max_value": 99999,
  "avg_value": 5432.5,
  "min_length": 1,
  "max_length": 5,
  "avg_length": 4.2,
  "most_frequent": [
    { "value": 1001, "count": 150, "percentage": 1.5 },
    { "value": 2002, "count": 120, "percentage": 1.2 },
    { "value": 3003, "count": 95, "percentage": 0.95 },
    { "value": 4004, "count": 80, "percentage": 0.8 },
    { "value": 5005, "count": 70, "percentage": 0.7 }
  ],
  "data_quality_score": 76,
  "is_unique": false,
  "has_nulls": true
}
```

**SQL Example (Snowflake) - Combined query for all stats:**
```sql
WITH base_stats AS (
  SELECT
    COUNT(*) as total_rows,
    COUNT("COD_MAGASIN") as non_null_count,
    COUNT(*) - COUNT("COD_MAGASIN") as null_count,
    COUNT(DISTINCT "COD_MAGASIN") as distinct_count,
    MIN("COD_MAGASIN") as min_value,
    MAX("COD_MAGASIN") as max_value,
    AVG("COD_MAGASIN") as avg_value,
    MIN(LENGTH(CAST("COD_MAGASIN" AS VARCHAR))) as min_length,
    MAX(LENGTH(CAST("COD_MAGASIN" AS VARCHAR))) as max_length,
    AVG(LENGTH(CAST("COD_MAGASIN" AS VARCHAR))) as avg_length
  FROM "DRAFT_SOURCE_AZURE"."RAW_DRAFT_AZURE"."STOCKS_MAG"
),
frequent_values AS (
  SELECT
    "COD_MAGASIN" as value,
    COUNT(*) as count
  FROM "DRAFT_SOURCE_AZURE"."RAW_DRAFT_AZURE"."STOCKS_MAG"
  WHERE "COD_MAGASIN" IS NOT NULL
  GROUP BY "COD_MAGASIN"
  ORDER BY count DESC
  LIMIT 5
)
SELECT * FROM base_stats;
-- Run frequent_values query separately
```

**Data Quality Score Calculation:**
```
score = 100
- (null_percentage * 0.5)           // Penalize nulls
- (100 - distinct_percentage) * 0.2  // Reward uniqueness
- (if has_outliers: 10)              // Penalize outliers
```

---

### 3. Get Table Preview (All Data)

**Endpoint:** `POST /explore-design/table/preview`

**Description:** Fetches sample data rows from an entire table with pagination.

**Request Body:**
```json
{
  "database": "DRAFT_SOURCE_AZURE",
  "schema": "RAW_DRAFT_AZURE",
  "table": "STOCKS_MAG",
  "limit": 50,
  "offset": 0
}
```

**Response (200 OK):**
```json
{
  "table": "STOCKS_MAG",
  "columns": ["COD_MAGASIN", "NOM_MAGASIN", "COD_ARTICLE", "QTE_STOCK", "DATE_MAJ"],
  "rows": [
    {
      "COD_MAGASIN": 1885,
      "NOM_MAGASIN": "Store Paris 01",
      "COD_ARTICLE": 12345,
      "QTE_STOCK": 150,
      "DATE_MAJ": "2024-01-15"
    },
    {
      "COD_MAGASIN": 7222,
      "NOM_MAGASIN": "Store Lyon 02",
      "COD_ARTICLE": 67890,
      "QTE_STOCK": 85,
      "DATE_MAJ": "2024-01-14"
    }
  ],
  "total_rows": 10000,
  "sample_size": 50,
  "offset": 0
}
```

**SQL Example (Snowflake):**
```sql
-- Get total row count
SELECT COUNT(*) as total_rows
FROM "DRAFT_SOURCE_AZURE"."RAW_DRAFT_AZURE"."STOCKS_MAG";

-- Get paginated data
SELECT *
FROM "DRAFT_SOURCE_AZURE"."RAW_DRAFT_AZURE"."STOCKS_MAG"
LIMIT 50 OFFSET 0;
```

---

### 4. Get Table Profile (All Columns)

**Endpoint:** `POST /explore-design/table/profile`

**Description:** Fetches profiling statistics for all columns in a table.

**Request Body:**
```json
{
  "database": "DRAFT_SOURCE_AZURE",
  "schema": "RAW_DRAFT_AZURE",
  "table": "STOCKS_MAG"
}
```

**Response (200 OK):**
```json
{
  "table": "STOCKS_MAG",
  "row_count": 10000,
  "column_count": 15,
  "columns": [
    {
      "column": "COD_MAGASIN",
      "data_type": "NUMBER(38,0)",
      "total_rows": 10000,
      "null_count": 486,
      "null_percentage": 4.86,
      "distinct_count": 3690,
      "distinct_percentage": 36.9,
      "data_quality_score": 76,
      "is_unique": false,
      "has_nulls": true
    },
    {
      "column": "NOM_MAGASIN",
      "data_type": "VARCHAR(255)",
      "total_rows": 10000,
      "null_count": 0,
      "null_percentage": 0,
      "distinct_count": 3690,
      "distinct_percentage": 36.9,
      "data_quality_score": 95,
      "is_unique": false,
      "has_nulls": false
    }
  ],
  "overall_quality_score": 85
}
```

---

### 4. Mark Column as Sensitive

**Endpoint:** `POST /explore-design/column/mark-sensitive`

**Description:** Marks a column as containing sensitive/PII data.

**Request Body:**
```json
{
  "project_id": "proj_12345",
  "database": "DRAFT_SOURCE_AZURE",
  "schema": "RAW_DRAFT_AZURE",
  "table": "CUSTOMERS",
  "column": "EMAIL",
  "sensitive_type": "pii_email",
  "create_event": true
}
```

**Sensitive Types:**
- `pii_email` - Email addresses
- `pii_phone` - Phone numbers
- `pii_ssn` - Social Security Numbers
- `pii_address` - Physical addresses
- `pii_dob` - Date of Birth
- `pii_name` - Personal names
- `financial_card` - Credit card numbers
- `financial_account` - Bank account numbers
- `auth_password` - Passwords/secrets
- `custom` - Custom sensitive data

**Response (200 OK):**
```json
{
  "success": true,
  "event_id": "evt_1703001234567_abc123"
}
```

---

### 5. Set Column Exclusion

**Endpoint:** `POST /explore-design/column/exclude`

**Description:** Excludes or includes a column from the modeling view.

**Request Body:**
```json
{
  "project_id": "proj_12345",
  "database": "DRAFT_SOURCE_AZURE",
  "schema": "RAW_DRAFT_AZURE",
  "table": "STOCKS_MAG",
  "column": "INTERNAL_ID",
  "excluded": true,
  "reason": "Internal Use Only"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "event_id": "evt_1703001234567_def456"
}
```

---

## Event Management & Deployment APIs

### 6. Add Design Event

**Endpoint:** `POST /explore-design/add-event`

**Description:** Records a design event for later deployment. Supports all event types including table creation, relationships, masking, etc.

**Request Body:**
```json
{
  "project_id": "proj_12345",
  "event_id": "evt_1703001234567_abc123",
  "event_type": "TABLE_CREATED",
  "target": {
    "database": "DWH",
    "schema": "ANALYTICS",
    "table": "DIM_CUSTOMER"
  },
  "payload": {
    "tableName": "DIM_CUSTOMER",
    "columns": [
      {
        "name": "CUSTOMER_ID",
        "dataType": "NUMBER",
        "nullable": false,
        "primaryKey": true
      },
      {
        "name": "CUSTOMER_NAME",
        "dataType": "VARCHAR",
        "nullable": false,
        "primaryKey": false
      }
    ],
    "primaryKeys": ["CUSTOMER_ID"],
    "sql": "CREATE TABLE DWH.ANALYTICS.DIM_CUSTOMER (\n  CUSTOMER_ID NUMBER NOT NULL,\n  CUSTOMER_NAME VARCHAR NOT NULL,\n  PRIMARY KEY (CUSTOMER_ID)\n);"
  },
  "module_type": "explore-design"
}
```

**Event Types Supported:**
- `TABLE_CREATED` - Create a new table
- `TABLE_RENAMED` - Rename an existing table
- `COLUMN_RENAMED` - Rename a column
- `FOREIGN_KEY_ADDED` - Add foreign key relationship
- `FOREIGN_KEY_REMOVED` - Remove foreign key
- `PRIMARY_KEY_SET` - Set primary key(s)
- `MASKING_POLICY_APPLIED` - Apply masking policy
- `TAG_APPLIED` - Tag column as sensitive
- `COLUMN_EXCLUDED` - Exclude column from modeling
- `INGESTION_MODE_SET` - Set ingestion mode

**Response (200 OK):**
```json
{
  "success": true,
  "event_id": "evt_1703001234567_abc123",
  "project_id": "proj_12345",
  "status": "pending",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### 7. Get Project Events

**Endpoint:** `GET /explore-design/events/{project_id}?status=pending&event_type=TABLE_CREATED`

**Description:** Retrieves all events for a project with optional filters.

**Query Parameters:**
- `status` (optional): Filter by status (pending, validated, applied, failed)
- `event_type` (optional): Filter by event type

**Response (200 OK):**
```json
{
  "project_id": "proj_12345",
  "events": [
    {
      "event_id": "evt_1703001234567_abc123",
      "event_type": "TABLE_CREATED",
      "target": {
        "database": "DWH",
        "schema": "ANALYTICS",
        "table": "DIM_CUSTOMER"
      },
      "payload": { ... },
      "status": "pending",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "summary": {
    "total": 10,
    "pending": 8,
    "validated": 2,
    "failed": 0,
    "applied": 0
  }
}
```

---

### 8. Validate Events

**Endpoint:** `POST /explore-design/events/validate`

**Description:** Validates events before deployment.

**Request Body:**
```json
{
  "project_id": "proj_12345",
  "event_ids": ["evt_1703001234567_abc123", "evt_1703001234567_def456"],
  "dry_run": true
}
```

**Response (200 OK):**
```json
{
  "results": [
    {
      "event_id": "evt_1703001234567_abc123",
      "valid": true,
      "sql": "CREATE TABLE DWH.ANALYTICS.DIM_CUSTOMER ...",
      "warnings": ["Table does not exist yet (will be created)"]
    },
    {
      "event_id": "evt_1703001234567_def456",
      "valid": false,
      "error": "Column EMAIL does not exist in table CUSTOMERS"
    }
  ],
  "summary": {
    "total": 2,
    "valid": 1,
    "invalid": 1
  }
}
```

---

### 9. Create Deployment

**Endpoint:** `POST /explore-design/deployments`

**Description:** Creates a deployment record.

**Request Body:**
```json
{
  "project_id": "proj_12345",
  "version": "v1.2.0",
  "deployment_type": "immediate",
  "events": [
    {
      "event_id": "evt_1703001234567_abc123",
      "event_type": "TABLE_CREATED",
      "sql": "CREATE TABLE ...",
      "target": { ... },
      "payload": { ... }
    }
  ],
  "rollback_on_error": true,
  "created_by": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "deployment_id": "deploy_1703001234567_xyz789",
  "status": "pending",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### 10. Execute Deployment

**Endpoint:** `POST /explore-design/deployments/{deployment_id}/execute`

**Description:** Executes a deployment.

**Request Body:**
```json
{
  "execution_mode": "immediate",
  "dry_run": false
}
```

**Response (200 OK):**
```json
{
  "deployment_id": "deploy_1703001234567_xyz789",
  "status": "success",
  "results": [
    {
      "event_id": "evt_1703001234567_abc123",
      "status": "applied",
      "sql_executed": "CREATE TABLE ...",
      "execution_time_ms": 250
    }
  ],
  "summary": {
    "applied": 5,
    "failed": 0,
    "skipped": 0
  }
}
```

---

### 11. Immediate Deployment

**Endpoint:** `POST /explore-design/deploy/immediate`

**Description:** Creates and immediately executes a deployment.

**Request Body:**
```json
{
  "project_id": "proj_12345",
  "events": [ ... ],
  "rollback_on_error": true,
  "created_by": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "deployment_id": "deploy_1703001234567_xyz789",
  "status": "success",
  "results": [ ... ],
  "summary": { ... }
}
```

---

### 12. Schedule Deployment

**Endpoint:** `POST /explore-design/schedule-deployment`

**Description:** Schedules a deployment for future execution.

**Request Body:**
```json
{
  "workflow_name": "Weekly DWH Update",
  "scheduled_date": "2024-01-20T02:00:00Z",
  "deployment_method": "REPLACE_EXISTING",
  "project_id": "proj_12345",
  "events": [ ... ],
  "created_by": "user@example.com",
  "description": "Scheduled deployment for new tables and relationships",
  "module_type": "explore-design",
  "requires_approval": false
}
```

**Response (200 OK):**
```json
{
  "schedule_id": "sched_1703001234567_abc123",
  "status": "SCHEDULED",
  "workflow_name": "Weekly DWH Update",
  "scheduled_date": "2024-01-20T02:00:00Z",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## TypeScript Service Functions

These are already implemented in `services/explore-design/index.ts`:

```typescript
// Column Preview
export async function getColumnPreview(
  database: string,
  schema: string,
  table: string,
  column: string,
  sampleSize: number = 100
): Promise<ColumnPreviewData>

// Table Preview (all data with pagination)
export async function getTablePreview(
  database: string,
  schema: string,
  table: string,
  limit: number = 50,
  offset: number = 0
): Promise<TablePreviewData>

// Column Profile
export async function getColumnProfile(
  database: string,
  schema: string,
  table: string,
  column: string
): Promise<ColumnProfile>

// Table Profile (all columns)
export async function getTableProfile(
  database: string,
  schema: string,
  table: string
): Promise<TableProfileResponse>

// Mark Column Sensitive
export async function markColumnSensitive(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  column: string,
  sensitiveType: string,
  createEvent: boolean = true
): Promise<{ success: boolean; event_id?: string }>

// Set Column Exclusion
export async function setColumnExclusion(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  column: string,
  excluded: boolean,
  reason?: string
): Promise<{ success: boolean; event_id?: string }>
```

---

## TypeScript Interfaces

```typescript
export interface ColumnPreviewData {
  column: string;
  sample_values: any[];
  total_rows: number;
  sample_size: number;
}

export interface TablePreviewData {
  table: string;
  columns: string[];
  rows: Record<string, any>[];
  total_rows: number;
  sample_size: number;
  offset: number;
}

export interface ColumnProfile {
  column: string;
  data_type: string;
  total_rows: number;
  null_count: number;
  null_percentage: number;
  distinct_count: number;
  distinct_percentage: number;
  min_value?: any;
  max_value?: any;
  avg_value?: number;
  min_length?: number;
  max_length?: number;
  avg_length?: number;
  most_frequent?: Array<{ value: any; count: number; percentage: number }>;
  data_quality_score: number;
  is_unique: boolean;
  has_nulls: boolean;
}
```

---

## Error Responses

**400 Bad Request:**
```json
{
  "error": "Invalid request",
  "message": "Missing required field: column"
}
```

**404 Not Found:**
```json
{
  "error": "Not found",
  "message": "Table STOCKS_MAG not found in schema RAW_DRAFT_AZURE"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal error",
  "message": "Failed to execute query on Snowflake"
}
```
