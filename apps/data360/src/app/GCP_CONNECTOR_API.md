# GCP (Google Cloud Storage) Connector API

## Overview

Connect Snowflake to Google Cloud Storage (GCS) buckets. The flow creates a **storage integration** (Snowflake manages auth via a GCS service account), then an **external stage** pointing to the bucket.

**Base path:** `/api/v1/connect`

**Auth:** All endpoints require Bearer token + datalake role (`ACCOUNTADMIN` or `DATA_MODELER`).

---

## Workflow

```
1. POST /connect/gcs/storage_integration   --> returns STORAGE_GCS_SERVICE_ACCOUNT
2. Grant that service account IAM access on the GCS bucket (in GCP Console)
3. POST /connect/gcs/stage                 --> creates the external stage
4. GET  /connect/integration?integration_name=...  --> verify integration properties
```

---

## Endpoints

### 1. Create GCS Storage Integration

**`POST /connect/gcs/storage_integration`**

Creates a Snowflake storage integration with `STORAGE_PROVIDER='GCS'`. Returns the GCS service account that must be granted IAM access on the bucket.

#### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `integration_name` | string | yes | Name for the storage integration |
| `bucket_name` | string | yes | GCS bucket name (without `gs://` prefix) |

#### Example Request

```json
{
  "integration_name": "GCS_MY_DATALAKE",
  "bucket_name": "my-company-datalake"
}
```

#### Output (200)

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Confirmation message |
| `integration_name` | string | Integration name created |
| `STORAGE_GCS_SERVICE_ACCOUNT` | string | Snowflake-managed GCS service account (e.g. `a]xxxx@gcpuscentral1-1234.iam.gserviceaccount.com`) |
| `instructions` | string | Next step: grant IAM role on bucket |

#### Example Response

```json
{
  "message": "GCS storage integration 'GCS_MY_DATALAKE' created.",
  "integration_name": "GCS_MY_DATALAKE",
  "STORAGE_GCS_SERVICE_ACCOUNT": "abcd1234@gcpuscentral1-xxxx.iam.gserviceaccount.com",
  "instructions": "Grant the service account 'roles/storage.objectViewer' on your GCS bucket in GCP IAM."
}
```

---

### 2. Create GCS External Stage

**`POST /connect/gcs/stage`**

Creates an external stage in Snowflake pointing to the GCS bucket via the storage integration. Optionally loads data and processes files.

#### Input

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `stage_name` | string | yes | — | Name for the external stage |
| `bucket_name` | string | yes | — | GCS bucket name |
| `integration_name` | string | yes | — | Storage integration name (from step 1) |
| `prefix` | string | no | `null` | Optional path prefix in bucket (e.g. `data/raw/`) |
| `load_data` | bool | no | `false` | Auto-load files from stage after creation |
| `auto_update` | bool | no | `false` | Set up Snowpipe for auto-ingest |

#### Example Request

```json
{
  "stage_name": "STG_GCS_DATALAKE",
  "bucket_name": "my-company-datalake",
  "integration_name": "GCS_MY_DATALAKE",
  "prefix": "raw/2024/",
  "load_data": true,
  "auto_update": false
}
```

#### Output (200)

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Confirmation message |

#### Example Response

```json
{
  "message": "GCS stage 'STG_GCS_DATALAKE' created successfully."
}
```

---

### 3. Describe Integration (shared endpoint)

**`GET /connect/integration`**

Works for all providers (AWS, Azure, GCS). Returns integration properties including `STORAGE_GCS_SERVICE_ACCOUNT` for GCS integrations.

#### Input (query params)

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `integration_name` | string | no | If omitted, lists all integration names. If provided, returns full DESC. |

#### Output (200) — with `integration_name`

```json
{
  "integration_name": "GCS_MY_DATALAKE",
  "properties": {
    "ENABLED": "true",
    "STORAGE_PROVIDER": "GCS",
    "STORAGE_ALLOWED_LOCATIONS": "gcs://my-company-datalake/",
    "STORAGE_GCS_SERVICE_ACCOUNT": "abcd1234@gcpuscentral1-xxxx.iam.gserviceaccount.com"
  },
  "azure_consent_url": null,
  "azure_multi_tenant_app_name": null
}
```

#### Output (200) — without `integration_name`

```json
{
  "integrations": ["GCS_MY_DATALAKE", "AWS_S3_PROD", "AZURE_BLOB_DEV"]
}
```

---

## Error Responses

All endpoints return standard error format on failure:

| Status | Cause |
|--------|-------|
| 401 | Missing or invalid Bearer token |
| 403 | User lacks datalake role |
| 500 | Snowflake SQL error (detail contains Snowflake error message) |

---

## GCP IAM Setup (post-integration)

After creating the storage integration, configure GCS access:

1. Copy the `STORAGE_GCS_SERVICE_ACCOUNT` from the response
2. Go to **GCP Console > Cloud Storage > your bucket > Permissions**
3. Click **Grant Access**
4. Paste the service account as the principal
5. Assign role:
   - **Storage Object Viewer** (`roles/storage.objectViewer`) — read-only
   - **Storage Object Admin** (`roles/storage.objectAdmin`) — read + write
6. Save, then create the stage via `POST /connect/gcs/stage`

---

## Snowflake SQL Reference

```sql
-- What the storage_integration endpoint runs:
CREATE OR REPLACE STORAGE INTEGRATION "GCS_MY_DATALAKE"
  TYPE = EXTERNAL_STAGE
  STORAGE_PROVIDER = 'GCS'
  ENABLED = TRUE
  STORAGE_ALLOWED_LOCATIONS = ('gcs://my-company-datalake/');

DESC INTEGRATION "GCS_MY_DATALAKE";

-- What the stage endpoint runs:
CREATE OR REPLACE STAGE {METADATA_DB}.STAGING."STG_GCS_DATALAKE"
  URL = 'gcs://my-company-datalake/raw/2024/'
  STORAGE_INTEGRATION = "GCS_MY_DATALAKE";
```
