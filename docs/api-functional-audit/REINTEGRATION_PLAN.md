# Plan de réintégration — endpoints backend non-wirés (W6, détecteur raffiné)

> Source: catalogue (flag `wired` avec détecteur raffiné = matche aussi les paths template-literals). **Compteur désormais précis** (plus une borne haute).

**Total non-wirés: 517** (sur 1020 ops ; 503 wirés). Priorisé par volume.

## explore-design (147)
- `DELETE /explore-design/{project_id}/ddl-actions/{event_id}` — Remove a pending DDL action
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/preview` — Preview table data
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/columns/{column}/preview` — Preview column data
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/profile` — Profile table
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/columns/{column}/profile` — Profile column
- `POST /explore-design/{project_id}/ingestion/operations/{operation_id}/execute` — Execute an ingestion operation
- `POST /explore-design/{project_id}/ingestion/operations/{operation_id}/rollback` — Rollback an ingestion operation
- `POST /explore-design/{project_id}/deployments/{deployment_id}/cancel` — Cancel deployment
- `POST /explore-design/dynamic-tables` — Create dynamic table
- `GET /explore-design/dynamic-tables` — List dynamic tables
- `PATCH /explore-design/dynamic-tables/{name}` — Alter dynamic table
- `GET /explore-design/dynamic-tables/{name}` — Describe dynamic table
- `DELETE /explore-design/dynamic-tables/{name}` — Drop dynamic table
- `POST /explore-design/dynamic-tables/{name}/suspend` — Suspend dynamic table
- `POST /explore-design/dynamic-tables/{name}/resume` — Resume dynamic table
- `POST /explore-design/dynamic-tables/{name}/refresh` — Refresh dynamic table
- `POST /explore-design/streams` — Create stream
- `GET /explore-design/streams` — List streams
- `GET /explore-design/streams/{name}` — Describe stream
- `DELETE /explore-design/streams/{name}` — Drop stream
- `GET /explore-design/streams/{name}/data` — Consume stream data
- `GET /explore-design/tasks` — List tasks
- `GET /explore-design/tasks/{name}` — Describe task
- `PATCH /explore-design/tasks/{name}` — Alter task (resume/suspend)
- `DELETE /explore-design/tasks/{name}` — Drop task
- `POST /explore-design/tasks/{name}/suspend` — Suspend task
- `POST /explore-design/tasks/{name}/resume` — Resume task
- `POST /explore-design/event-tables` — Create event table
- `GET /explore-design/event-tables` — List event tables
- `DELETE /explore-design/event-tables/{name}` — Drop event table
- `POST /explore-design/hybrid-tables` — Create hybrid table
- `GET /explore-design/hybrid-tables` — List hybrid tables
- `DELETE /explore-design/hybrid-tables/{name}` — Drop hybrid table
- `POST /explore-design/alerts` — Create alert
- `GET /explore-design/alerts` — List alerts
- `PATCH /explore-design/alerts/{name}` — Alter alert
- `GET /explore-design/alerts/{name}` — Describe alert
- `DELETE /explore-design/alerts/{name}` — Drop alert
- `POST /explore-design/{project_id}/full-dry-run` — Combined dry-run: DDL deployment + ingestion on cloned schema
- `POST /explore-design/{project_id}/dry-run` — Dry-run DDL on cloned schema
- … +107 autres

## gouvernance (106)
- `GET /gouvernance/gui-permissions` — List Gui Permissions
- `POST /gouvernance/gui-permissions` — Upsert Gui Permission
- `GET /gouvernance/gui-permissions/my-access` — Get My Page Access
- `GET /gouvernance/gui-permissions/effective/{username}` — Effective GUI page-access for an arbitrary user (admin)
- `GET /gouvernance/oauth/integrations` — List security integrations
- `POST /gouvernance/oauth/integrations` — Create OAuth/SAML security integration
- `GET /gouvernance/oauth/network-policies` — List network policies
- `GET /gouvernance/oauth/api-keys` — List service accounts with RSA keys
- `POST /gouvernance/oauth/service-users` — Create service user for PAT/API access
- `POST /gouvernance/oauth/assign-rsa-key` — Assign RSA public key to user for key pair auth
- `DELETE /gouvernance/oauth/revoke-rsa-key/{username}` — Revoke RSA key from user
- `POST /gouvernance/oauth/saml-integrations` — Create SAML2 security integration for SSO
- `DELETE /gouvernance/gui-permissions/{permission_id}` — Delete Gui Permission
- `GET /gouvernance/policies/row-access/{policy_name}/details` — Describe row access policy
- `POST /gouvernance/policies/row-access/apply` — Apply row access policy to a table
- `POST /gouvernance/policies/row-access/remove` — Remove row access policy from a table
- `POST /gouvernance/policies/row-access/replace` — Replace row access policy on a table
- `POST /gouvernance/policies/masking` — Create masking policy
- `GET /gouvernance/policies/masking/{policy_name}/details` — Describe masking policy
- `POST /gouvernance/policies/masking/apply` — Apply masking policy to a column
- `POST /gouvernance/policies/masking/remove` — Remove masking policy from a column
- `POST /gouvernance/policies/masking/replace` — Replace masking policy on a column
- `GET /gouvernance/policies/network/list` — List network policies
- `POST /gouvernance/policies/network` — Create network policy
- `GET /gouvernance/policies/network/{policy_name}/details` — Describe network policy
- `DELETE /gouvernance/policies/network/{policy_name}` — Delete network policy
- `POST /gouvernance/policies/network/{policy_name}/set-default` — Set network policy as account default
- `POST /gouvernance/policies/tags` — Create tag
- `GET /gouvernance/policies/tags/{tag_name}/details` — Describe tag
- `POST /gouvernance/policies/tags/apply` — Apply tag to an object
- `POST /gouvernance/policies/tags/remove` — Remove tag from an object
- `DELETE /gouvernance/policies/tags/{tag_name}` — Delete tag
- `GET /gouvernance/policies/password/list` — List password policies
- `POST /gouvernance/policies/password` — Create password policy
- `GET /gouvernance/policies/password/{policy_name}/details` — Describe password policy
- `POST /gouvernance/policies/password/{policy_name}/set-default` — Set password policy as account default
- `GET /gouvernance/policies/session/list` — List session policies
- `POST /gouvernance/policies/session` — Create session policy
- `GET /gouvernance/policies/session/{policy_name}/details` — Describe session policy
- `POST /gouvernance/policies/session/{policy_name}/set-default` — Set session policy as account default
- … +66 autres

## api (69)
- `POST /api/data360/track` — Frontend event tracking (batched)
- `GET /api/snowflake/explorer/tree` — Database/schema tree
- `GET /api/snowflake/explorer/schemas/{database}/{schema}/lineage` — Schema-level lineage graph
- `GET /api/snowflake/explorer/schemas/{database}/{schema}/governance` — Schema-level governance rollup
- `GET /api/snowflake/explorer/schemas/{database}/{schema}/audit` — Audit events for all objects in a schema
- `GET /api/snowflake/explorer/databases/{database}/lineage` — Database-level lineage graph
- `GET /api/snowflake/explorer/databases/{database}/governance` — Database-level governance rollup
- `GET /api/snowflake/explorer/databases/{database}/audit` — Audit events for all objects in a database
- `POST /api/snowflake/explorer/sync` — Trigger a metadata refresh
- `GET /api/snowflake/explorer/sync/status` — Latest sync status
- `GET /api/snowflake/explorer/sync/{sync_id}` — Single sync run status
- `GET /api/snowflake/explorer/sync/history` — Past sync runs (newest first)
- `GET /api/snowflake/explorer/audit-views` — Predefined audit categories with live counts
- `POST /api/snowflake/explorer/selection-review` — Aggregator across a set of selected object_ids
- `GET /api/snowflake/explorer/recent-activity` — Account-wide unified activity feed (paginated)
- `POST /api/snowflake/explorer/objects/bulk-action` — Apply a bulk action across selected objects (dry-run default)
- `GET /api/snowflake/explorer/objects/export` — Stream the current /objects result as CSV
- `GET /api/snowflake/explorer/recent-activity/export` — Stream the recent-activity feed as CSV
- `GET /api/snowflake/explorer/scoring/definitions` — Health/risk/governance scoring formulas
- `POST /api/snowflake/explorer/cache/install` — Create/refresh the DATA360 cache tables (idempotent)
- `POST /api/recommendations/analyze` — Recompute + upsert + return recos for a scope
- `GET /api/recommendations/` — List stored active recommendations
- `GET /api/recommendations/glossary` — Inspect the registered glossary (signals → actions)
- `GET /api/recommendations/capabilities` — Recommendations module capability hint (UX gating)
- `GET /api/recommendations/{reco_id}` — Get one reco by id
- `POST /api/recommendations/{reco_id}/acknowledge` — Mark a reco as acknowledged
- `POST /api/recommendations/{reco_id}/snooze` — Snooze a reco until a future date
- `POST /api/recommendations/{reco_id}/resolve` — Mark a reco as resolved
- `POST /api/recommendations/{reco_id}/dismiss` — Dismiss a reco (false-positive / N/A)
- `POST /api/recommendations/{reco_id}/reopen` — Reopen a resolved/dismissed reco
- `POST /api/recommendations/{reco_id}/apply` — Apply a recommendation's remediation (mark-applied + return its SQL)
- `POST /api/recommendations/cache/install` — Create EVENT_STORE.AI_RECOMMENDATIONS (idempotent)
- `GET /api/workspace/investigation-modes` — Static catalog of pre-built filter presets
- `GET /api/workspace/saved-views` — List the current user's saved filter snapshots
- `POST /api/workspace/saved-views` — Create a saved view
- `PATCH /api/workspace/saved-views/{view_id}` — Update a saved view
- `DELETE /api/workspace/saved-views/{view_id}` — Delete a saved view
- `POST /api/workspace/touch` — Record that the user opened an object
- `GET /api/workspace/recently-opened` — List recently-opened objects (current user)
- `GET /api/workspace/watchlist` — List watchlisted objects (current user)
- … +29 autres

## org-accounts (68)
- `GET /org-accounts/accounts/audit` — Consolidated per-account audit (credits+storage+queries+logins)
- `GET /org-accounts/credits/trend` — Daily credit trend
- `GET /org-accounts/health` — Health scores
- `GET /org-accounts/alerts` — Alerts
- `GET /org-accounts/metering` — Metering per account
- `GET /org-accounts/platform-activity` — Data360 platform activity
- `GET /org-accounts/projects-overview` — Projects & deployments overview
- `POST /org-accounts/row-timestamps/activate` — Activate row timestamps on all supported tables
- `GET /org-accounts/row-timestamps/status` — Check row timestamp support per table
- `GET /org-accounts/cross-account/usage` — Cross-account usage costs
- `GET /org-accounts/audit/query-history` — DQL audit trail from ACCOUNT_USAGE
- `GET /org-accounts/audit/access-history` — Data access audit trail
- `GET /org-accounts/audit/login-history` — Authentication audit trail
- `GET /org-accounts/filter-options` — Filter options for Command Center
- `GET /org-accounts/security-overview` — Security posture overview
- `GET /org-accounts/cortex-costs` — Cortex AI cost breakdown
- `GET /org-accounts/performance-overview` — Performance KPI rollup
- `GET /org-accounts/governance-grants-overview` — Grants rollup (governance)
- `GET /org-accounts/data-operations-overview` — Data-operations rollup
- `GET /org-accounts/security-posture` — Security posture (Trust Center-style)
- `GET /org-accounts/credit-forecast` — Credit usage forecast
- `GET /org-accounts/usage-analytics` — Usage analytics breakdown
- `GET /org-accounts/events` — Platform events audit trail
- `GET /org-accounts/organization/costs` — Org costs by account in currency
- `GET /org-accounts/organization/warehouse-credits` — Org warehouse credits per account
- `GET /org-accounts/organization/storage` — Org storage per account
- `GET /org-accounts/organization/remaining-balance` — Org remaining credit balance
- `GET /org-accounts/dashboard/trends` — Org-wide trends (credits + storage)
- `GET /org-accounts/credits` — Org credits aggregate (last N days)
- `GET /org-accounts/warehouses/{account_name}` — Per-account warehouse cost
- `GET /org-accounts/logins` — Recent login activity (org-wide)
- `GET /org-accounts/logins/failed` — Failed login attempts
- `GET /org-accounts/logins/{account_name}` — Per-account login history
- `GET /org-accounts/reader-accounts` — Reader accounts (managed accounts)
- `POST /org-accounts/reader-accounts` — Create a reader (managed) account (orgadmin only)
- `GET /org-accounts/shares` — Outbound + inbound shares
- `GET /org-accounts/storage/trend` — Daily storage trend (org-wide)
- `GET /org-accounts/storage/databases` — Per-database storage
- `GET /org-accounts/storage/stages` — Per-account stage storage
- `GET /org-accounts/warehouses` — Org-wide warehouse usage
- … +28 autres

## command-center (32)
- `GET /command-center/summary` — Executive summary — all-module KPIs
- `GET /command-center/module-health` — Per-module health status
- `GET /command-center/infrastructure` — Snowflake infrastructure snapshot
- `GET /command-center/cost-breakdown` — Comprehensive cost intelligence
- `GET /command-center/security-audit` — Security & audit intelligence
- `GET /command-center/filter-options` — Smart filter options with counts
- `GET /command-center/audit/query-history` — Query history audit table
- `GET /command-center/audit/access-history` — Data access audit trail
- `GET /command-center/audit/login-history` — Login audit trail
- `GET /command-center/profiling/column` — Profile a column — distinct values, nulls, distribution
- `GET /command-center/kpis/{dimension}` — Exhaustive KPI scorecards + auditable detail table for one dimension (dq|gov|perf|cost)
- `GET /command-center/kpis` — All four KPI dimensions (dq+gov+perf+cost) in one call
- `GET /command-center/projects/{project_id}/scores` — Per-project DQ/COST/PERF/GOV scores, each flagged scope=project|account
- `GET /command-center/projects/{project_id}/rollup` — Per-project precomputed KPI rollup (DQ·PERF·GOV·STORAGE+COST+recos), cheap table read
- `GET /command-center/recommendations` — Actionable recommendations + CTAs across DQ/GOV/PERF/STORAGE/COST
- `GET /command-center/recommendations/{dimension}` — Recommendations + CTAs for one dimension (dq|gov|perf|storage|cost)
- `GET /command-center/dwh-proposal` — DWH improvement proposal — all pain points + audit/workflow CTAs (gov · dedup · perf · cost · DQ)
- `GET /command-center/overview-kpis` — Consolidated Overview-tab payload (9 cards + 6 donuts + 2 panels)
- `GET /command-center/tabs/{tab}` — Consolidated per-tab payload (kpis+charts+tables)
- `GET /command-center/cost-by-warehouse` — Per-warehouse credit cost (compute/cloud split)
- `GET /command-center/cost-by-service` — Credit cost by service type
- `GET /command-center/clustering-costs` — Per-table auto-clustering cost
- `GET /command-center/pipe-usage` — Per-pipe Snowpipe cost & throughput
- `GET /command-center/mv-refresh-costs` — Per-MV refresh cost
- `GET /command-center/task-history` — Per-task execution + serverless cost
- `GET /command-center/table-storage` — Per-table storage breakdown (active/TT/failsafe/clone + est $)
- `GET /command-center/role-hierarchy` — Role inheritance tree + per-role priv/user counts
- `GET /command-center/object-lineage` — Real 1-hop object lineage graph (OBJECT_DEPENDENCIES + ACCESS_HISTORY)
- `GET /command-center/object-enrichment` — Per-object USAGE + attributed COST + project/product tag link (single FULL-OUTER payload)
- `GET /command-center/snowflake-insights` — AI analysis of Snowflake features → actionable, coherently-routed insights
- `GET /command-center/user-activity-monitor` — Per-user activity & error rollup from EVENT_STORE.USER_REQUESTS
- `GET /command-center/user-activity-monitor/errors` — Recent per-user errors from EVENT_STORE.USER_REQUESTS

## cortex (22)
- `GET /cortex/conversations` — List the caller's AI chat exchanges (newest first)
- `GET /cortex/conversations/{conversation_id}` — Read one AI chat exchange (prompt + response)
- `POST /cortex/code-generate` — Generate code via Cortex with model picker (Python/SQL/YAML/JSON/TS/Bash)
- `POST /cortex/synthesize-rows` — Cortex generates ≤1000 synthetic rows matching a target schema
- `POST /cortex/icon-suggest` — Cortex picks the best Lucide icon name for a chart/title
- `POST /cortex/ml/sentiment` — ML sentiment analysis
- `POST /cortex/ml/translate` — ML translation
- `POST /cortex/ml/summarize` — ML text summarization
- `POST /cortex/explore/tables` — Explore tables
- `GET /cortex/explore/databases` — List databases
- `GET /cortex/explore/schemas` — List schemas
- `POST /cortex/ml/document-ai/upload` — Upload document for AI processing
- `POST /cortex/ml/document-ai/extract-to-table` — Extract document data and insert into table
- `POST /cortex/snowpark/compute-pools/{name}/suspend` — Suspend compute pool
- `POST /cortex/snowpark/compute-pools/{name}/resume` — Resume compute pool
- `GET /cortex/snowpark/endpoints/{service_name}` — List service endpoints
- `POST /cortex/snowpark/services/{name}/suspend` — Suspend SPCS service (stops billing, preserves state)
- `POST /cortex/snowpark/services/{name}/resume` — Resume a suspended SPCS service
- `POST /cortex/snowpark/services/{name}/auto-stop` — Schedule automatic suspend or drop of SPCS service after N seconds
- `GET /cortex/agents` — List Cortex Agents
- `GET /cortex/semantic-views` — List Semantic Views
- `GET /cortex/vectors/columns` — List vector embedding columns

## workflow (14)
- `GET /workflow/blocks/{block_type}` — Single ETL block detail (rich)
- `POST /workflow/blocks/{block_type}/render-sql` — Render a block's SQL from params (pure, no execution)
- `POST /workflow/events/resource-cleanup` — Record a dedicated resource-cleanup event (test harness)
- `GET /workflow/jobs` — List async jobs
- `POST /workflow/dry-run` — Stateless dry-run from a graph body (no persistence)
- `POST /workflow/{workflow_id}/pre-check` — Pre-deployment preconditions
- `POST /workflow/{workflow_id}/post-verify` — Verify each block's output after execute
- `POST /workflow/{workflow_id}/tasks/{task_id}/retry` — Re-run a failed task (EXECUTE TASK)
- `GET /workflow/{workflow_id}/runs/summary` — Workflow-global run metrics (front contract alias)
- `PUT /workflow/{workflow_id}/draft` — Autosave workflow draft (no new version)
- `GET /workflow/{workflow_id}/draft` — Restore the latest autosaved draft
- `POST /workflow/{workflow_id}/rollback` — Rollback workflow to a prior version
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/cancel` — Cancel workflow deployment
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/verify` — Verify workflow deployment results

## projects (10)
- `POST /projects/seed-samples` — Seed sample E&D + Workflow projects (owner/editor/viewer) — super-admin
- `GET /projects/{project_id}/comments` — List project comments (threaded)
- `POST /projects/{project_id}/comments` — Add a project comment
- `DELETE /projects/{project_id}/comments/{comment_id}` — Delete a project comment (soft)
- `PUT /projects/{project_id}/deployments/{deployment_id}/steps/{step}` — Persist a wizard step result
- `POST /projects/{project_id}/lock` — Lock project for editing
- `POST /projects/{project_id}/unlock` — Release project editing lock
- `POST /projects/{project_id}/rls` — Create + apply a row-access policy to a project table
- `GET /projects/{project_id}/rls` — List a project's row-access bindings
- `DELETE /projects/{project_id}/rls/{binding_id}` — Unapply a row-access binding

## deployments (9)
- `POST /deployments/track` — Start a deployment lifecycle
- `GET /deployments/track` — List the caller's active deployments (owned or pending approval)
- `PATCH /deployments/track/{deployment_id}/step` — Advance current step or record per-step errors
- `POST /deployments/track/{deployment_id}/complete` — Finalize a deployment (SUCCEEDED/FAILED/CANCELLED)
- `GET /deployments/track/{deployment_id}` — Get current state of a deployment
- `POST /deployments/track/{deployment_id}/approve` — Approve a pending deployment
- `POST /deployments/track/{deployment_id}/reject` — Reject a pending deployment
- `POST /deployments/track/{deployment_id}/execute` — Execute (run) an approved deployment
- `POST /deployments/track/{deployment_id}/rollback` — Roll a deployment's project back to a prior version

## data-quality (6)
- `GET /data-quality/run-history` — Past quality-check runs
- `POST /data-quality/dmf/suggest` — Suggest DMFs for a table (POST)
- `POST /data-quality/tables/{database}/{schema}/{table}/optimize` — Optimize a table (RECLUSTER if clustered, else no-op + suggestion)
- `POST /data-quality/auto-profile` — Auto-profile a table (refresh column stats)
- `POST /data-quality/dmf/associate` — Associate a DMF with table column(s)
- `POST /data-quality/dmf/custom` — Create a custom Data Metric Function

## admin (6)
- `GET /admin/service-account/health` — Service Account Health
- `GET /admin/svc-registry` — Get Svc Registry
- `GET /admin/endpoint-usage` — Top API endpoints by request count
- `GET /admin/usage-by` — AUDIT_LOG request counts grouped by a dimension
- `GET /admin/server-metrics` — Live in-process server metrics
- `GET /admin/api-health/introspect` — Snowflake query + related events behind a probed api-health call

## connect (5)
- `POST /connect/tasks/{task_name}/resume` — Resume a suspended task
- `POST /connect/tasks/{task_name}/suspend` — Suspend a running task
- `GET /connect/snowflake_lake/databases` — ✅ Step 2: Choose database
- `GET /connect/snowflake_lake/schemas/{database_name}` — ✅ Step 3: Choose schema
- `GET /connect/snowflake_lake/tables/{database_name}/{schema_name}` — ✅ Step 4: Choose table

## cache-stream (5)
- `GET /cache-stream/stream` — Cache SSE stream
- `GET /cache-stream/last-invalidation/{cache_key}` — Last invalidation time
- `GET /cache-stream/stats` — Cache stream stats
- `GET /cache-stream/available-keys` — Available cache keys
- `POST /cache-stream/test-invalidation` — Test cache invalidation

## administration (5)
- `GET /administration/performance/{account}/by-tab` — Workload rollup per tab (actions behind each tab)
- `GET /administration/performance/{account}/tab/{tab}` — All workloads behind one tab: endpoints, actions, users
- `GET /administration/performance/audit/by-account` — Endpoint audit by account (super-admin: cross-account)
- `GET /administration/performance/{account}/events` — Data360 events audit (USER_ACTIVITY) by module × type
- `GET /administration/performance/{account}/events/feed` — Most-recent Data360 events with all columns

## notifications (5)
- `GET /notifications` — List current user's notifications
- `GET /notifications/unread-count` — Cheap unread counter for the bell badge
- `PATCH /notifications/{notification_id}/read` — Mark a single notification as read
- `POST /notifications/mark-all-read` — Mark every unread notification as read
- `POST /notifications/broadcast` — Publish a notification — fan-out happens server-side

## bi-dashboard (2)
- `POST /bi-dashboard/charts/data` — Get chart data
- `GET /bi-dashboard/{dashboard_id}/cost` — Per-dashboard query cost (credits/bytes)

## health (1)
- `GET /health` — Health check

## ready (1)
- `GET /ready` — Readiness check

## catalog (1)
- `POST /catalog/objects/{object_id}/clustering/apply` — Apply a clustering-key recommendation — ALTER TABLE <fqn> CLUSTER BY (<cols>)

## analytics (1)
- `GET /analytics/user-activity/summary` — User activity summary KPIs

## cache (1)
- `GET /cache/kpis` — Granular cache KPIs

## observability (1)
- `POST /observability/slo` — Define a user SLO

