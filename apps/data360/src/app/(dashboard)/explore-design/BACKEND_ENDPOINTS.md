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

### 3. Get Table Profile (All Columns)

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
