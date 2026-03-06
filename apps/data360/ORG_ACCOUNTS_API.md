# Organization Accounts API — Frontend Integration Guide

## Overview

Multi-account monitoring for Snowflake organizations. All endpoints query **SNOWFLAKE.ORGANIZATION_USAGE** views to provide org-wide visibility into accounts, credits, storage, warehouses, compute services, and billing.

**Base path:** `/api/v1/org-accounts`

**Auth:** All endpoints require `Authorization: Bearer <token>` header.

**Common patterns:**
- All responses include `execution_time_ms: number`
- List endpoints include `count: number`
- Time-scoped endpoints accept `days: number` query param (default varies per endpoint)
- Cached via `Cache-Control` headers (TTL noted per endpoint)

---

## Endpoints Summary

### Dashboard (fast page load)

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/dashboard/overview` | 5 min | Account list + aggregated stats |
| GET | `/dashboard/usage` | 5 min | Credit + storage totals for KPI cards |
| GET | `/dashboard/trends` | 10 min | Historical credit & storage trends for charts |

### Accounts

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/accounts` | 5 min | List all accounts with filtering |
| GET | `/accounts/{account_name}` | 5 min | Single account detail + credit summary |

### Credits

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/credits` | 5 min | Credit usage per account with service breakdown |
| GET | `/credits/top` | 5 min | Top N credit consumers |
| GET | `/credits/trend` | 10 min | Daily credit usage trend |
| GET | `/credits/{account_name}` | 5 min | Credit history for one account |

### Storage

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/storage` | 10 min | Storage per account (yesterday) |
| GET | `/storage/trend` | 10 min | Daily storage trend |
| GET | `/storage/databases` | 10 min | Database-level storage breakdown |
| GET | `/storage/stages` | 10 min | Stage storage per account |

### Warehouses

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/warehouses` | 5 min | Warehouse usage across all accounts |
| GET | `/warehouses/{account_name}` | 5 min | Warehouses for one account |

### Data Transfer

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/data-transfer` | 10 min | Cross-region/cloud data transfers |

### Balance & Billing

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/balance` | 10 min | Remaining credit balance |
| GET | `/contract` | 60 min | Contract items |
| GET | `/rate-sheet` | 60 min | Current pricing rates per account |

### Metering

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/metering` | 5 min | Metering by account & service type |
| GET | `/metering/trend` | 10 min | Daily metering trend |

### Compute Services

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/services/clustering` | 10 min | Auto-clustering credits per account |
| GET | `/services/materialized-views` | 10 min | MV refresh credits per account |
| GET | `/services/pipes` | 10 min | Snowpipe usage per account |
| GET | `/services/search-optimization` | 10 min | Search optimization credits per account |
| GET | `/services/query-acceleration` | 10 min | Query acceleration credits per account |

### Health & Alerts

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/health` | 10 min | Health scores for all accounts |
| GET | `/health/{account_name}` | 5 min | Health score for one account |
| GET | `/alerts` | 2 min | Credit usage alerts |

### Replication & Anomalies

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/replication` | 10 min | Replication usage per account |
| GET | `/anomalies` | 5 min | Cost anomalies detected |

### Data Sharing

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| GET | `/reader-accounts` | 5 min | List reader accounts |
| GET | `/shares` | 5 min | List data shares |

---

## Endpoint Details

### GET `/dashboard/overview`

Fast dashboard load — accounts list + aggregated breakdown stats.

**Response:**
```json
{
  "overview": {
    "organization_name": "MY_ORG",
    "total_client_accounts": 5,
    "active_accounts": 4,
    "inactive_accounts": 1,
    "suspended_accounts": 0,
    "accounts_by_region": { "AWS_US_EAST_1": 3, "AZURE_WESTEUROPE": 1 },
    "accounts_by_edition": { "ENTERPRISE": 3, "STANDARD": 1 },
    "accounts_by_cloud": { "AWS": 3, "AZURE": 1 }
  },
  "accounts": [
    {
      "account_name": "PROD_ACCOUNT",
      "account_locator": "xy12345",
      "organization_name": "MY_ORG",
      "region": "AWS_US_EAST_1",
      "region_group": "PUBLIC",
      "cloud": "AWS",
      "edition": "ENTERPRISE",
      "account_url": "https://xy12345.snowflakecomputing.com",
      "created_on": "2023-01-15 10:30:00",
      "comment": "Production",
      "deleted_on": null,
      "scheduled_deletion_time": null,
      "is_org_admin": true,
      "is_events_account": false,
      "is_active": true
    }
  ],
  "generated_at": "2026-03-04T12:00:00",
  "execution_time_ms": 450
}
```

---

### GET `/dashboard/usage`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "total_credits_30d": 1234.56,
  "credit_account_count": 4,
  "total_storage_bytes": 5497558138880,
  "total_storage_tb": 5.0,
  "storage_account_count": 4,
  "generated_at": "2026-03-04T12:00:00",
  "credits_error": null,
  "storage_error": null
}
```

---

### GET `/dashboard/trends`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "credits": [
    { "usage_date": "2026-02-01", "total_credits": 45.2, "active_accounts": 3 }
  ],
  "storage": [
    {
      "usage_date": "2026-02-01",
      "total_bytes": 5497558138880,
      "total_tb": 5.0,
      "total_credits": 23.0,
      "account_count": 4
    }
  ],
  "period_days": 30,
  "generated_at": "2026-03-04T12:00:00",
  "execution_time_ms": 800
}
```

---

### GET `/accounts`

**Query params:** `status` ("active"|"inactive"), `edition`, `cloud`, `region`, `search`

**Response:**
```json
{
  "accounts": [
    {
      "account_name": "PROD_ACCOUNT",
      "account_locator": "xy12345",
      "organization_name": "MY_ORG",
      "region": "AWS_US_EAST_1",
      "region_group": "PUBLIC",
      "edition": "ENTERPRISE",
      "account_url": "https://xy12345.snowflakecomputing.com",
      "created_on": "2023-01-15 10:30:00",
      "comment": "Production",
      "deleted_on": null,
      "is_org_admin": true,
      "is_events_account": false,
      "is_active": true
    }
  ],
  "count": 4,
  "filters_applied": { "status": "active", "edition": null, "cloud": null, "region": null, "search": null },
  "execution_time_ms": 300
}
```

---

### GET `/accounts/{account_name}`

**Response:**
```json
{
  "account": { "ACCOUNT_NAME": "PROD_ACCOUNT", "REGION": "AWS_US_EAST_1", "..." : "..." },
  "credits": { "TOTAL_CREDITS": 500.0, "COMPUTE_CREDITS": 400.0, "CLOUD_SERVICES_CREDITS": 100.0 },
  "storage": null,
  "logins": null,
  "queries": null,
  "warehouses": [],
  "health": null,
  "alerts": [],
  "execution_time_ms": 200
}
```

---

### GET `/credits`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "total_credits": 1234.56,
  "accounts": [
    {
      "account_name": "PROD_ACCOUNT",
      "account_locator": "xy12345",
      "region": "",
      "total_credits": 800.0,
      "compute_credits": 650.0,
      "cloud_services_credits": 150.0,
      "by_service": {}
    }
  ],
  "account_count": 4,
  "execution_time_ms": 350
}
```

---

### GET `/credits/top`

**Query params:** `days` (default: 30), `limit` (default: 10, max: 50)

**Response:**
```json
{
  "period_days": 30,
  "top_consumers": [
    { "account_name": "PROD_ACCOUNT", "total_credits": 800.0 }
  ],
  "count": 4,
  "execution_time_ms": 200
}
```

---

### GET `/credits/trend`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "trend": [
    { "usage_date": "2026-02-01", "total_credits": 45.2, "active_accounts": 3 }
  ],
  "data_points": 30,
  "execution_time_ms": 250
}
```

---

### GET `/credits/{account_name}`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "account_name": "PROD_ACCOUNT",
  "period_days": 30,
  "history": [
    { "usage_date": "2026-02-01", "total_credits": 25.0, "active_accounts": 1 }
  ],
  "count": 30,
  "execution_time_ms": 200
}
```

---

### GET `/storage`

**Response:**
```json
{
  "total_storage_bytes": 5497558138880,
  "total_storage_tb": 5.0,
  "accounts": [
    {
      "account_name": "PROD_ACCOUNT",
      "account_locator": "xy12345",
      "total_bytes": 3298534883328,
      "storage_credits": 15.5,
      "total_tb": 3.0
    }
  ],
  "account_count": 4,
  "execution_time_ms": 300
}
```

---

### GET `/storage/trend`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "trend": [
    {
      "usage_date": "2026-02-01",
      "total_bytes": 5497558138880,
      "total_tb": 5.0,
      "total_credits": 23.0,
      "account_count": 4
    }
  ],
  "data_points": 30,
  "execution_time_ms": 280
}
```

---

### GET `/storage/databases`

Database-level storage breakdown (yesterday's snapshot).

**Response:**
```json
{
  "databases": [
    {
      "account_name": "PROD_ACCOUNT",
      "database_name": "ANALYTICS_DB",
      "database_bytes": 1099511627776,
      "failsafe_bytes": 549755813888,
      "database_tb": 1.0
    }
  ],
  "count": 12,
  "execution_time_ms": 400
}
```

---

### GET `/storage/stages`

Stage storage per account (yesterday's snapshot).

**Response:**
```json
{
  "stages": [
    {
      "account_name": "PROD_ACCOUNT",
      "stage_bytes": 107374182400,
      "stage_tb": 0.000098
    }
  ],
  "count": 3,
  "execution_time_ms": 200
}
```

---

### GET `/warehouses`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "warehouses": [
    {
      "account_name": "PROD_ACCOUNT",
      "warehouse_name": "COMPUTE_WH",
      "total_credits": 200.0,
      "compute_credits": 180.0,
      "cloud_credits": 20.0,
      "metering_hours": 0
    }
  ],
  "execution_time_ms": 350
}
```

---

### GET `/warehouses/{account_name}`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "account_name": "PROD_ACCOUNT",
  "period_days": 30,
  "warehouses": [
    {
      "warehouse_name": "COMPUTE_WH",
      "total_credits": 200.0,
      "compute_credits": 180.0,
      "cloud_credits": 20.0,
      "metering_hours": 0
    }
  ],
  "count": 3,
  "execution_time_ms": 250
}
```

---

### GET `/data-transfer`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "usage_days": 30,
  "total_bytes": 10737418240,
  "total_tb": 0.00001,
  "transfers": [
    {
      "account_name": "PROD_ACCOUNT",
      "account_locator": "xy12345",
      "source_cloud": "AWS",
      "source_region": "us-east-1",
      "target_cloud": "AZURE",
      "target_region": "westeurope",
      "transfer_type": "COPY",
      "usage_date": "2026-03-01",
      "total_bytes": 5368709120,
      "total_tb": 0.000005
    }
  ],
  "execution_time_ms": 300
}
```

---

### GET `/balance`

**Response:**
```json
{
  "organization_name": "MY_ORG",
  "contract_number": "12345",
  "date": "2026-03-04",
  "currency": "USD",
  "free_credits_remaining": 500.0,
  "capacity_balance": 10000.0,
  "on_demand_consumption": 1234.56,
  "rollover_balance": 200.0,
  "execution_time_ms": 150
}
```

---

### GET `/contract`

**Response:**
```json
{
  "contracts": [
    {
      "organization_name": "MY_ORG",
      "contract_number": "12345",
      "start_date": "2025-01-01",
      "end_date": "2026-12-31",
      "expiration_date": "2027-01-31",
      "contract_item": "Capacity",
      "currency": "USD",
      "amount": 50000.0,
      "contract_modified_date": "2025-01-01"
    }
  ],
  "count": 2,
  "execution_time_ms": 100
}
```

---

### GET `/rate-sheet`

Latest pricing rates per account.

**Response:**
```json
{
  "rates": [
    {
      "account_name": "PROD_ACCOUNT",
      "account_locator": "xy12345",
      "region": "AWS_US_EAST_1",
      "service_level": "ENTERPRISE",
      "usage_type": "compute",
      "service_type": "WAREHOUSE_METERING",
      "currency": "USD",
      "effective_rate": 3.0,
      "rating_type": "compute",
      "billing_type": "consumption",
      "is_adjustment": false
    }
  ],
  "count": 20,
  "execution_time_ms": 200
}
```

---

### GET `/metering`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "metering": [
    {
      "account_name": "PROD_ACCOUNT",
      "service_type": "WAREHOUSE_METERING",
      "compute_credits": 180.0,
      "cloud_services_credits": 20.0,
      "total_credits": 200.0,
      "cloud_adjustment": -5.0,
      "total_billed": 195.0
    }
  ],
  "count": 8,
  "execution_time_ms": 300
}
```

---

### GET `/metering/trend`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "trend": [
    {
      "usage_date": "2026-02-01",
      "compute_credits": 35.0,
      "cloud_services_credits": 5.0,
      "total_credits": 40.0,
      "total_billed": 38.0,
      "account_count": 4
    }
  ],
  "data_points": 30,
  "execution_time_ms": 250
}
```

---

### GET `/services/clustering`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "clustering": [
    {
      "account_name": "PROD_ACCOUNT",
      "total_credits": 12.5,
      "bytes_reclustered": 107374182400,
      "rows_reclustered": 50000000
    }
  ],
  "count": 2,
  "execution_time_ms": 200
}
```

---

### GET `/services/materialized-views`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "materialized_views": [
    { "account_name": "PROD_ACCOUNT", "total_credits": 5.2 }
  ],
  "count": 1,
  "execution_time_ms": 180
}
```

---

### GET `/services/pipes`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "pipes": [
    {
      "account_name": "PROD_ACCOUNT",
      "total_credits": 8.0,
      "total_bytes_inserted": 53687091200,
      "total_files_inserted": 1500
    }
  ],
  "count": 2,
  "execution_time_ms": 200
}
```

---

### GET `/services/search-optimization`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "search_optimization": [
    { "account_name": "PROD_ACCOUNT", "total_credits": 3.0 }
  ],
  "count": 1,
  "execution_time_ms": 180
}
```

---

### GET `/services/query-acceleration`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "query_acceleration": [
    { "account_name": "PROD_ACCOUNT", "total_credits": 2.5 }
  ],
  "count": 1,
  "execution_time_ms": 180
}
```

---

### GET `/health`

**Response:**
```json
{
  "health_scores": [
    {
      "account_name": "PROD_ACCOUNT",
      "overall_score": 50.0,
      "status": "warning",
      "cost_score": 50.0,
      "issues": ["High credit consumption"],
      "recommendations": ["Review warehouse auto-suspend settings"],
      "last_assessed": "2026-03-04T12:00:00"
    }
  ],
  "count": 4,
  "execution_time_ms": 500
}
```

Health scoring: `overall_score = cost_score` (0-100, based on credit consumption). Status: `healthy` (>=80), `warning` (>=60), `critical` (<60).

---

### GET `/health/{account_name}`

Returns a single health score object (same shape as items in `/health` response). Returns `status: "unknown"` if account not found.

---

### GET `/alerts`

**Query params:** `days` (default: 7)

**Response:**
```json
{
  "period_days": 7,
  "alerts": [
    {
      "account_name": "PROD_ACCOUNT",
      "alert_type": "critical",
      "title": "High Credit Usage",
      "message": "PROD_ACCOUNT used 650.0 credits in 7 days",
      "metric_value": 650.0,
      "threshold": 100,
      "timestamp": "2026-03-04T12:00:00"
    }
  ],
  "count": 2,
  "execution_time_ms": 300
}
```

Alert types: `warning` (>100 credits), `critical` (>500 credits).

---

### GET `/replication`

**Query params:** `days` (default: 30)

**Response:**
```json
{
  "period_days": 30,
  "replication": [
    {
      "account_name": "PROD_ACCOUNT",
      "total_credits": 15.0,
      "total_bytes_transferred": 107374182400
    }
  ],
  "count": 1,
  "execution_time_ms": 200
}
```

---

### GET `/anomalies`

**Query params:** `days` (default: 30)

Returns only rows where the anomaly detection algorithm flagged `IS_ANOMALY = TRUE`.

**Response:**
```json
{
  "period_days": 30,
  "anomalies": [
    {
      "date": "2026-02-28",
      "account_name": "DEV_ACCOUNT",
      "account_locator": "ab67890",
      "region": "AWS_US_EAST_1",
      "actual_value": 250.0,
      "currency": "USD",
      "upper_bound": 120.0,
      "lower_bound": 30.0,
      "forecasted_value": 75.0
    }
  ],
  "count": 3,
  "execution_time_ms": 250
}
```

---

### GET `/reader-accounts`

**Response:**
```json
{
  "reader_accounts": [
    {
      "name": "READER_1",
      "cloud": "AWS",
      "region": "us-east-1",
      "created_on": "2024-06-15 09:00:00",
      "comment": "Partner reader"
    }
  ],
  "count": 2,
  "execution_time_ms": 150
}
```

---

### GET `/shares`

**Response:**
```json
{
  "shares": [
    {
      "name": "SALES_SHARE",
      "database_name": "SALES_DB",
      "owner": "ACCOUNTADMIN",
      "kind": "OUTBOUND",
      "created_on": "2024-03-01 08:00:00",
      "comment": "Shared with partner"
    }
  ],
  "count": 3,
  "execution_time_ms": 150
}
```

---

## Snowflake Views Used

| Endpoint Group | Snowflake View |
|---|---|
| Dashboard, Accounts | `ORGANIZATION_USAGE.ACCOUNTS` |
| Credits, Dashboard, Alerts, Health | `ORGANIZATION_USAGE.USAGE_IN_CURRENCY_DAILY` |
| Storage, Dashboard | `ORGANIZATION_USAGE.STORAGE_DAILY_HISTORY` |
| Warehouses | `ORGANIZATION_USAGE.WAREHOUSE_METERING_HISTORY` |
| Data Transfer | `ORGANIZATION_USAGE.DATA_TRANSFER_HISTORY` |
| Balance | `ORGANIZATION_USAGE.REMAINING_BALANCE_DAILY` |
| Contract | `ORGANIZATION_USAGE.CONTRACT_ITEMS` |
| Rate Sheet | `ORGANIZATION_USAGE.RATE_SHEET_DAILY` |
| Metering | `ORGANIZATION_USAGE.METERING_DAILY_HISTORY` |
| Database Storage | `ORGANIZATION_USAGE.DATABASE_STORAGE_USAGE_HISTORY` |
| Stage Storage | `ORGANIZATION_USAGE.STAGE_STORAGE_USAGE_HISTORY` |
| Clustering | `ORGANIZATION_USAGE.AUTOMATIC_CLUSTERING_HISTORY` |
| Materialized Views | `ORGANIZATION_USAGE.MATERIALIZED_VIEW_REFRESH_HISTORY` |
| Pipes | `ORGANIZATION_USAGE.PIPE_USAGE_HISTORY` |
| Search Optimization | `ORGANIZATION_USAGE.SEARCH_OPTIMIZATION_HISTORY` |
| Query Acceleration | `ORGANIZATION_USAGE.QUERY_ACCELERATION_HISTORY` |
| Replication | `ORGANIZATION_USAGE.REPLICATION_GROUP_USAGE_HISTORY` |
| Anomalies | `ORGANIZATION_USAGE.ANOMALIES_IN_CURRENCY_DAILY` |

---

## Frontend Integration Notes

1. **Dashboard page load order:** Call `/dashboard/overview` first (fast, gives account list), then `/dashboard/usage` and `/dashboard/trends` in parallel for KPI cards and charts.

2. **Filtering pattern:** `/accounts` supports server-side filtering via query params. All other list endpoints return full data — filter client-side if needed.

3. **Time periods:** Most endpoints default to 30 days. Alerts default to 7 days. Provide a date range picker that maps to the `days` param.

4. **Empty data:** Endpoints return empty arrays (not errors) when no data exists. Some compute service endpoints may return `[]` if the org doesn't use that feature (e.g., no materialized views = empty response).

5. **Error handling:** If a Snowflake view is inaccessible, the endpoint still returns 200 with empty data (queries fail silently). Check `count: 0` to detect this. `/dashboard/usage` explicitly returns `credits_error` / `storage_error` fields.

6. **Byte conversions:** Storage endpoints return both raw bytes and TB values. Use TB for display (`total_tb`, `database_tb`, `stage_tb`).

7. **Anomalies:** `actual_value > upper_bound` means overspend anomaly. Show as alert cards. Compare `actual_value` vs `forecasted_value` for severity.
