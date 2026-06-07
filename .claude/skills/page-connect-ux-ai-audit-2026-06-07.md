---
name: page-connect-ux-ai-audit-2026-06-07
description: UX/AI audit skill for the Data Source Connection page — connector wizard, health strip, AI helper, right-bar redesign spec, and prioritized gap backlog.
---

## Vue

**Route:** `/data-source-connection`  
**File:** `apps/data360/src/app/(dashboard)/data-source-connection/page.tsx` (3220 lines)

The page is a full-screen connection hub for plugging external data sources into the Snowflake-backed Data360 platform. It has two top-level display states controlled by `currentStep`:

**Step 0 — Hub view (currentStep === 0)**

Top-level glass-morphism card (`bg-white/70 backdrop-blur-sm`) containing, in order:

1. **ConnectorHealthStrip** — compact roll-up bar polling `GET /connect/connectors/health`. Shows overall verdict icon (green/amber/red), pipe + stage counts, aggregate healthy/paused/stale badges, 7-day ingestion metrics (files, bytes, active pipes, failed loads, row errors, task failures from `SNOWFLAKE.ACCOUNT_USAGE`), and per-item status dots (up to 18) with tooltip. Ungated — no RBAC check.

2. **SourceCatalogSection** — collapsible accordion (collapsed by default, mounts `SourceCatalog` on first expand) for browsing already-connected tables by domain/system/data layer from `GET /connect/source-catalog`.

3. **InternalStageCreator** — quick-action widget to create a raw Snowflake internal stage (`POST /connect/stages/internal`) without any cloud credentials.

4. **Active Connections grid** — loaded via `GET /connect/stages` on mount. Cards show stage name, database.schema, and a freshness dot derived from `stageFreshnessView(freshness_status, age_hours)` (green pulse = active, amber = stale, grey = unknown). Above the grid, a horizontal tab strip lets the user click a stage to open the browse pane below.

5. **Browse pane** (inline, shown after clicking a stage tab): for `connectedProvider === 'snowflake'` a toggle switch lets the user pick between:
   - **Stages & Files** — renders `<DatalakeBrowser>` (lists stage files, preview, download, delete, upload)
   - **Databases & Tables** — renders `<SnowflakeExplorerTab>` (db → schema → table drill)

6. **Data Source Cards grid** — shown when no connections exist or when "Add Connection" is toggled. 9 provider cards: Snowflake, Azure Blob, Amazon S3, Google Cloud Storage, Databricks, Apache Iceberg, PostgreSQL, MySQL, Oracle ATP. Click transitions to Step 1 (150ms loading animation).

7. **Feature highlights** — 3 static cards: Secure Upload, Compliance Ready, Real-time Sync.

**Step 1 — Wizard view (currentStep === 1)**

Renders a Breadcrumb + StepIndicator + provider-specific form card. Each form is `max-w-lg` centered, glass-morphism. A `ValidationErrorBanner` appears above the form if `validateConnectorConfig()` finds issues.

Provider wizard flows:
- **Azure** (4–5 sub-steps): Storage Integration → Consent URL fetch → Notification Integration (optional) → Notification consent → Stage creation
- **AWS** (3 sub-steps): Storage Integration + IAM User ARN/External ID display → IAM Trust Policy guide → Stage creation
- **GCS** (3 sub-steps): Storage Integration + Service Account display → IAM guide → Stage creation (with optional Pub/Sub notification integration for Snowpipe)
- **Snowflake** (1 step): username / password / account / role form
- **Databricks** (4 sub-steps): credential form → catalog list → schema list → table multi-select → ingest
- **Iceberg** (3 sub-steps): REST catalog URI form → namespace list → table multi-select → ingest
- **PostgreSQL** (1 step): host/port/database/user/password → direct ingest to CP_DATA360.POSTGRES
- **MySQL** (1 step): host/port/database/user/password → direct ingest to CP_DATA360.MYSQL
- **Oracle ATP** (2 actions): host/port/service_name/username/password/connection_mode (TLS|Wallet|Standard) → Test Connection → Ingest to CP_DATA360.ORACLE_SAMPLE; also a "Load Sample CSVs" button (no Oracle creds needed)

**Page header** (always visible): breadcrumb, page title "Data Source Connection", subtitle, Back button (when in wizard), and an **AI button** (purple gradient, Sparkles icon) that opens the `ConnectorAiHelper` modal.

**Related links** footer: Explore & Design, Workflow.

---

## Tabs actuels

The page does not use Next.js per-tab routes. The active connections are displayed as a horizontal tab strip (`<button>` elements) inline within the Step 0 view. Clicking a tab calls `browseConnection(conn)` which sets `activeConnectionId` and renders `DatalakeBrowser` or `SnowflakeExplorerTab` beneath the tab strip in the same page component. No dedicated `/data-source-connection/<tab>/page.tsx` sub-routes exist.

---

## Actions

| Action | RBAC | Endpoint | Notes |
|---|---|---|---|
| Load page | `ROLE_PERMISSIONS[role].modules.includes(1)` | `GET /connect/stages` | Redirects to `/access-denied` if no permission. Loads on mount. |
| Select provider card | same gate | — | `handleSourceSelect(id)` — 150ms transition, sets `currentStep=1` |
| AI helper modal open | same gate | — | Opens `ConnectorAiHelper`, no endpoint yet |
| AI analyze connection string | same gate | `POST /cortex/complete` (via `generateCompletion`) | Falls back to offline `matchConnectorFromText()` if Cortex unreachable |
| AI "Use this connector" | same gate | — | Pre-fills form state, calls `handleSourceSelect`, shows toast |
| Create Azure Storage Integration | same gate | `POST /connect/azure/storage_integration` | Returns `azure_consent_url` shown inline |
| Fetch Azure consent details | same gate | `GET /connect/integration?integration_name=...` | Also used for GCS/AWS integration verification |
| Create Azure Notification Integration | same gate | `POST /connect/azure/notification_integration` | Optional; enables Snowpipe |
| Create Azure Stage | same gate | `POST /connect/azure/stage` | Triggers `loadConnections()` + `silentReauth()` on success |
| Create AWS Storage Integration | same gate | `POST /connect/aws/storage_integration` | Returns `STORAGE_AWS_IAM_USER_ARN` + `STORAGE_AWS_EXTERNAL_ID` |
| Patch AWS Storage Integration | same gate | `PATCH /connect/integration/{name}` | Applies `storage_aws_external_id` before stage creation |
| Create AWS Stage | same gate | `POST /connect/aws/stage` | `load_data` + `auto_update` checkboxes |
| Create GCS Storage Integration | same gate | `POST /connect/gcs/storage_integration` | Returns `STORAGE_GCP_SERVICE_ACCOUNT` |
| Create GCS Notification Integration | same gate | `POST /connect/gcs/notification_integration` | Returns `GCP_PUBSUB_SERVICE_ACCOUNT` |
| Create GCS Stage | same gate | `POST /connect/gcs/stage` | Optional `prefix` field |
| Connect Snowflake Datalake | same gate | `POST /connect/snowflake_lake/datalake/connect` | username/password/account/role |
| Databricks test + list catalogs | same gate | `POST /connect/databricks/test`, `POST /connect/databricks/catalogs` | Sequential on single button click |
| Databricks list schemas | same gate | `POST /connect/databricks/schemas?catalog=...` | On catalog select |
| Databricks list tables | same gate | `POST /connect/databricks/tables?catalog=...&schema_name=...` | On schema select |
| Databricks ingest | same gate | `POST /connect/databricks/ingest` | 600s timeout; optional table filter |
| Iceberg test + list namespaces | same gate | `POST /connect/iceberg/test`, `POST /connect/iceberg/namespaces` | Sequential |
| Iceberg list tables | same gate | `POST /connect/iceberg/tables?namespace=...` | On namespace select |
| Iceberg ingest | same gate | `POST /connect/iceberg/ingest` | Optional table filter; target: CP_DATA360.ICEBERG |
| PostgreSQL ingest | same gate | `POST /connect/postgres/ingest` | Target: CP_DATA360.POSTGRES |
| MySQL ingest | same gate | `POST /connect/mysql/ingest` | Target: CP_DATA360.MYSQL |
| Oracle test connection | same gate | `POST /connect/oracle/test` | Returns version, table_count, latency_ms |
| Oracle ingest | same gate | `POST /connect/oracle/ingest` | Requires successful test first (button disabled until `oracleTestResult.ok`) |
| Oracle load sample CSVs | same gate | `POST /connect/oracle/sample-stage` | No Oracle credentials needed; loads to CP_DATA360.ORACLE_SAMPLE |
| Create internal stage | same gate | `POST /connect/stages/internal` | Via `InternalStageCreator` widget |
| Browse stage files | same gate | `GET /connect/stages/{stageName}/files` | Opens `DatalakeBrowser` |
| Browse Snowflake tables | same gate | (SnowflakeExplorerTab internal) | Opens `SnowflakeExplorerTab` |
| Preview file | same gate | `GET /connect/stages/{stageName}/files/{filePath}/preview` | Paginated |
| Download file | same gate | `GET /connect/stages/{stageName}/files/{filePath}/download` | Blob response |
| Delete file | same gate | `DELETE /connect/stages/{stageName}/files/{filePath}` | |
| Upload files | same gate | `POST /connect/stages/{stageName}/upload` | Multipart; `overwrite` + `path` params |
| View stage grants | same gate | `GET /connect/stages/{stageName}/grants` | |
| View connector health | ungated | `GET /connect/connectors/health` | ConnectorHealthStrip; no RBAC |
| Refresh connector health | ungated | `GET /connect/connectors/health` | Manual retry button in strip |
| Browse source catalog | same gate | `GET /connect/source-catalog` | SourceCatalogSection — lazy-loads on expand |

**InsightActionButton usage:** None currently. The `ConnectorHealthStrip` surfaces failure counts but does not wire them to `InsightActionButton`. This is a gap — paused pipes and load failures are natural candidates for the detect→notify→act primitive.

---

## Interventions IA

### 1. AI Connector Helper (ConnectorAiHelper modal)

**Trigger:** User clicks the purple "AI" button in the page header. Modal opens; user pastes a connection string, config file excerpt, or free-text description and clicks "Analyze".

**Two-phase analysis:**

**Phase 1 — Offline (always runs first, synchronous):**
- `matchConnectorFromText(text)` — deterministic regex/keyword heuristic in `connector-catalog-grounding.ts`. Matches URI schemes (`postgres://`, `jdbc:`, `mongodb://`), hostnames (`.snowflakecomputing.com`, `.azuredatabricks.net`), and key patterns (`bucket_name`, `aws_role_arn`, `gcp_pubsub`, etc.). Returns `{ id, fields, reason }`.

**Phase 2 — Snowflake Cortex (async, best-effort):**
- **Snowflake call:** `POST /cortex/complete` via `generateCompletion({ prompt, model: 'mistral-7b' })` (from `@/app/services/cortex/ml-features`).
- **Prompt:** A terse system prompt injecting the connector catalog index (`buildConnectorPromptSection()` — one line per connector) + user input (capped at 600 chars). Instructs model to output only JSON: `{ connector_id, fields, proposed_connector }`.
- **Cortex feature used:** `SNOWFLAKE.CORTEX.COMPLETE` via the `/cortex/complete` backend proxy, using the `mistral-7b` model variant.
- **Output:**
  - If `connector_id` is in the catalog: merges offline + Cortex-extracted fields (Cortex wins on conflicts), calls `coerceMatchToConfig()`, shows a pre-filled field preview with `validateConnectorConfig()` inline errors, and offers "Use this connector" → pre-fills the wizard form.
  - If `proposed_connector` is populated and no catalog match: shows a read-only JSON card of the proposed connector definition + a "Backend Gap" note (POST /connect/connectors register endpoint missing).
  - If nothing matches: amber "Could not identify a connector" warning.
- **Fallback:** If `/cortex/complete` throws, falls back silently to the offline match result only.

### 2. Pre-commit Validation Gate (always-on, no external AI)

**Trigger:** Every form submit / test action.
- `validateConnectorConfig(connectorId, config)` from `connector-catalog-grounding.ts` runs synchronously. Checks required fields and per-type validation rules (hostname, port range, URI scheme, account locator format).
- Output: inline `ValidationErrorBanner` with field-level error list. Blocks submit until fixed.
- Not an AI call — pure catalog-grounded rule evaluation.

### 3. Cortex-Grounded Static Tip Library (connector-catalog-grounding.ts)

**Trigger:** Passive — the catalog grounding file ships static `samples` entries that document contextual recommendations per connector type. These are currently only read by the AI helper prompt builder, not yet surfaced as a live "AI Tips" panel.

**Gap:** `GET /connect/ai-tips?connector_id={id}` endpoint is not yet wired to any panel in the page. The spec (see Redesign Right-Bar section) calls for a 1–3 recommendation panel powered by Cortex, with static fallback from the catalog grounding.

---

## Redesign Right-Bar

The page currently has no right-bar panel. All connector detail, credential output, and actions are inline within the wizard card or the health strip. The redesign spec adds a persistent right panel (visible when a stage/connection is selected) with the following sections:

### Details

When a connector card is clicked (or a stage tab is active), the right bar shows:

- **Integration name** — display name from `conn.name` (stage name from Snowflake)
- **Stage name** — same; also shows `database_name.schema_name.stage_name` for fully-qualified reference
- **Connector type badge** — from `conn.connector_type` (AWS/AZURE/GCS/SNOWFLAKE/etc.), rendered as a coloured badge (currently shown inline in the tab strip)
- **Freshness dot + age_hours label** — from `stageFreshnessView(conn.freshness_status, conn.age_hours)`. Shows: green pulse "Active · Xh ago", amber "Idle · Xd ago", grey "Unknown". Source: `GET /connect/stages` list response fields `freshness_status` and `age_hours`.
- **`last_checked` timestamp** — from `conn.last_checked` (currently populated from `last_altered` in stage items and `last_loaded` in pipe items via the health endpoint). Display as relative time.

**Cloud credential block (post-creation only):** After a cloud connector wizard completes, the critical credentials are currently lost when the user navigates back to the hub. The right-bar should surface them in a copyable `<code>` block:

| Provider | Credential shown | State key |
|---|---|---|
| AWS | `STORAGE_AWS_IAM_USER_ARN` + `STORAGE_AWS_EXTERNAL_ID` | `awsIamUserArn`, `awsExternalId` |
| GCS | `STORAGE_GCP_SERVICE_ACCOUNT` | `gcsServiceAccount` |
| GCS (Snowpipe) | `GCP_PUBSUB_SERVICE_ACCOUNT` | `gcsPubsubServiceAccount` |
| Azure | Consent URL + Multi-tenant App Name | `azureStorageConsentUrl`, `azureStorageMultiTenantAppName` |

Copy button: `navigator.clipboard.writeText(value)` + toast "Copied!".

**Source catalog live inventory:** A collapsible sub-section pulling `GET /connect/source-catalog` to show existing integration count per provider type (e.g. "3 AWS stages · 1 GCS stage · 2 Snowflake connections"). Lazy-loaded on expand. Source is the same `SourceCatalog` component already in `SourceCatalogSection`.

### Actions

Three action buttons in the right-bar (visible when a stage is selected):

1. **Browse files** — opens `DatalakeBrowser` on the selected stage. Already implemented via `browseConnection()` + `setSnowflakeBrowseView('files')`. Right-bar button just mirrors this action.

2. **Browse tables** — opens `SnowflakeExplorerTab` on the selected stage. Already implemented via `setSnowflakeBrowseView('tables')`. Right-bar button mirrors this.

3. **Promote to pipeline** — NEW. Button label "Promote to Snowpipe". On click: `POST /connect/pipes/promote` with body `{ stage_name }`. Backend creates a Snowpipe + Task + notification integration from the selected stage. On success: toast "Pipeline created — Snowpipe is now ingesting from {stage_name}", refresh ConnectorHealthStrip. On error: show inline error. This action is the primary P1 gap (see Henry Tasks).

### Status SSE

The right-bar subscribes to the following SSE channels when a stage is selected. Each channel drives a live status indicator row:

| Channel | Drives |
|---|---|
| `connect:health:{stage_name}` | Stage health dot (green/amber/red) |
| `connect:pipe:{pipe_name}:status` | Pipe status chip (Running/Paused) |
| `connect:ingest:{connector_id}:progress` | Progress bar for active ingestion jobs |
| `connect:stage:{stage_name}:freshness` | Freshness dot + age_hours label live update |

Implementation pattern: `useEffect` subscribing to `EventSource` on `{stage_name}` change; teardown on unmount or stage switch.

### AI Tips

Panel powered by `GET /connect/ai-tips?connector_id={id}`. Displays 1–3 contextual recommendations for the selected connector. Examples:

- "This S3 stage has 0 active pipes — add a Snowpipe to automate ingestion"
- "Your Oracle connection has no CDC stream — consider adding a Snowflake stream on the target table"
- "GCS service account has Storage Object Viewer role — upgrade to Storage Object Admin to enable COPY INTO write-back"

**Cortex feature used:** `SNOWFLAKE.CORTEX.COMPLETE` via `/cortex/complete`, using the stage/connector metadata as context. Falls back to the static tip library in `connector-catalog-grounding.ts` (the `samples` array and per-connector `description` fields) when Cortex is unreachable or the endpoint returns no tips.

Panel anatomy: collapsed by default (accordion), header "AI Recommendations", spinner while loading, tip cards with icon + text + optional CTA button linking to the relevant action.

### History

A collapsible "Ingest History" sub-section in the right-bar running the following query against `SNOWFLAKE.ACCOUNT_USAGE`:

```sql
SELECT stage_name, pipe_name, status, rows_loaded, error_count, last_load_time
FROM SNOWFLAKE.ACCOUNT_USAGE.COPY_HISTORY
WHERE stage_name = '{stage_name}'
ORDER BY last_load_time DESC
LIMIT 50
```

Rendered as a compact data table with columns: pipe_name, status badge (Loaded/PartiallyLoaded/LoadFailed), rows_loaded (formatted), error_count (red if >0), last_load_time (relative). Pagination: "Load more" button. Error rows have a "Retry" button wiring to `POST /connect/pipes/{pipe_name}/retry-errors` (P1 gap).

---

## Henry Tasks

### P1 — Critical gaps (must ship before production)

1. **Pipes grid (SHOW PIPES) with pause/resume actions**
   - View: grid of all Snowpipes under the account with columns: pipe_name, status (Running/Paused), definition, last_ingested_timestamp, error_count.
   - Pause: `PATCH /connect/pipes/{pipe_name}/status` body `{ action: "pause" }` → badge turns amber.
   - Resume: `PATCH /connect/pipes/{pipe_name}/status` body `{ action: "resume" }` → badge turns green.
   - Source: `GET /connect/pipes` (SHOW PIPES wrapper).
   - Currently the ConnectorHealthStrip shows degraded pipe count but there is no UI to act on it.

2. **Tasks and Streams grid (SHOW TASKS / SHOW STREAMS)**
   - Tasks grid: `GET /connect/tasks` — columns: task_name, schedule, state (started/suspended), last_committed_on, error_count. Toggle state via `POST /connect/streams/pair`.
   - Streams grid: `GET /connect/streams` — columns: stream_name, source_table, mode (delta/insert_only), stale, stale_after.
   - Pairing action: `POST /connect/streams/pair` — creates a CDC stream on a target table for a selected connector.

3. **One-click promote external stage to ingestion pipeline**
   - "Promote to Snowpipe" button in the right-bar Actions section.
   - `POST /connect/pipes/promote` body `{ stage_name: string }`.
   - Backend creates: COPY_INTO pipe, Task on cron schedule, notification integration (if stage has a cloud event notification).
   - Currently: zero UI surface. Users must use SQL.

4. **COPY_HISTORY error inspector with retry**
   - Inline history panel in the right-bar (see History spec above).
   - `GET /connect/pipes/{pipe_name}/copy-history` — returns COPY_HISTORY rows for the pipe.
   - `POST /connect/pipes/{pipe_name}/retry-errors` — re-queues failed load rows.
   - Currently: no UI; users cannot see or retry load errors from the product.

5. **Security: remove hardcoded Oracle password from default state**
   - File: `page.tsx` line 924.
   - The `oracleFormData` initial state hardcodes `password: 'Henuch*1991!'` (a real credential).
   - Fix: set `password: ''` in the initial state (same as the reset in `handleBackToProviderSelection`).
   - The `SAMPLE_PRESETS.data360_atp` object at line 2578 also contains the same credential — replace with `password: ''` and show a "(demo password not stored)" hint, or remove the preset entirely.
   - No backend change required. Pure frontend fix.

6. **Connector health deep-link to per-source ingest lag panel**
   - `GET /connect/connectors/{id}/health-detail` — returns per-connector lag, error breakdown, recent load timestamps.
   - Currently the health strip shows a single overall verdict; there is no drill-down per connector.
   - UX: clicking a status dot in ConnectorHealthStrip should open a slide-over (or the right-bar Detail section) with the health-detail payload.

### P2 — High-value additions

7. **Streaming connectors tile grid (Kafka, Kinesis, Event Hubs)**
   - New provider category "Streaming" with tile cards (Kafka, Amazon Kinesis, Azure Event Hubs).
   - Test: `POST /connect/streaming/{provider}/test` body `{ broker/endpoint, auth }`.
   - Ingest: `POST /connect/streaming/{provider}/ingest` body `{ topic/stream, target_table }`.
   - Currently: no streaming connectors. All existing connectors are batch/stage-based.

8. **Polaris namespace wizard + write mode picker for Iceberg**
   - Extend the Iceberg wizard with a "Polaris" REST catalog option.
   - Create namespace: `POST /connect/iceberg/polaris/namespace` body `{ catalog_name, namespace, properties }`.
   - Snapshot history: `GET /connect/iceberg/snapshot-history?namespace={ns}&table={t}` — shows Iceberg table snapshots with row counts and timestamps.
   - Write mode picker: READ_ONLY | APPEND | MERGE (maps to Snowflake Iceberg table write options).

9. **SQL Server and MariaDB JDBC connectors**
   - SQL Server: `POST /connect/sqlserver/ingest` body `{ host, port, database, user, password, tables? }`.
   - MariaDB: `POST /connect/mariadb/ingest` body `{ host, port, database, user, password, tables? }`.
   - Both follow the same single-step wizard pattern as PostgreSQL/MySQL.

### P3 — Nice to have

10. **SHOW INTEGRATIONS tile counts on connector catalog**
    - `GET /connect/integrations/summary` — returns per-provider integration counts.
    - Surface as badge overlays on the DataSourceCard tiles in the hub view (e.g. "3 active" badge on the AWS card).
    - Currently the cards are static; there is no count of existing integrations per provider type.

---

## Snowflake Features

- **External Stages** (`CREATE STAGE ... URL=... STORAGE_INTEGRATION=...`): AWS S3, Azure Blob, GCS — created via the wizard steps and backend `POST /connect/{provider}/stage`.
- **Internal Stages** (`CREATE STAGE ...` without URL): created via `InternalStageCreator` → `POST /connect/stages/internal`.
- **Storage Integrations** (`CREATE STORAGE INTEGRATION ...`): AWS, Azure, GCS — created via `POST /connect/{provider}/storage_integration`. Properties surfaced: `STORAGE_AWS_IAM_USER_ARN`, `STORAGE_AWS_EXTERNAL_ID`, `STORAGE_GCP_SERVICE_ACCOUNT`.
- **Notification Integrations** (`CREATE NOTIFICATION INTEGRATION ...`): Azure (Event Grid + Storage Queue) and GCS (Pub/Sub) — for Snowpipe auto-ingest. Properties surfaced: `GCP_PUBSUB_SERVICE_ACCOUNT`, `azure_consent_url`, `azure_multi_tenant_app_name`.
- **Snowpipe** (`CREATE PIPE ... AUTO_INGEST=TRUE`): enabled via `auto_update=true` on AWS/GCS/Azure stage forms. Monitored in ConnectorHealthStrip via `SNOWFLAKE.ACCOUNT_USAGE` pipe status.
- **COPY INTO** (batch ingest): used by Databricks, Iceberg, PostgreSQL, MySQL, Oracle, and direct stage-to-table loads.
- **COPY_HISTORY** (`SNOWFLAKE.ACCOUNT_USAGE.COPY_HISTORY`): queried in the History right-bar panel spec (SELECT stage_name, pipe_name, status, rows_loaded, error_count, last_load_time).
- **ACCOUNT_USAGE views**: `COPY_HISTORY`, stage/pipe metadata — surfaced in ConnectorHealthStrip metrics (files_inserted_7d, bytes_inserted_7d, failed_loads_7d, row_errors_7d, tasks_failed_1d).
- **Tasks** (`CREATE TASK ... SCHEDULE=...`): created as part of the "Promote to Pipeline" flow (P1 gap). Monitored via `GET /connect/tasks`.
- **Streams** (`CREATE STREAM ... ON TABLE ...`): CDC primitives. Pairable via `POST /connect/streams/pair` (P1 gap). Monitored via `GET /connect/streams`.
- **Cortex Complete** (`SNOWFLAKE.CORTEX.COMPLETE`): used in `ConnectorAiHelper` via `POST /cortex/complete` proxy, model `mistral-7b`. Analyzes user-pasted connection strings and extracts connector config fields or proposes new connector definitions.
- **Iceberg tables** (`CREATE ICEBERG TABLE ... CATALOG=...`): managed via the Iceberg wizard (REST catalog URI, warehouse, credential, namespace, table selection → `POST /connect/iceberg/ingest`).
- **ALTER STORAGE INTEGRATION**: patched via `PATCH /connect/integration/{name}` to update `storage_aws_external_id` after IAM Trust Policy setup (AWS wizard step 2→3 transition).
