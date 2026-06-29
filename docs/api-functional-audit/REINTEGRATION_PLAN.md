# Plan de réintégration — endpoints backend non-wirés (W6)

> Source: `missing-endpoints.json` (openapi déployé vs `api-contracts.ts`). Réintégration = ajouter au contrat + service typé, puis surfacer. Front-only, sûr.

**Total non-wirés: 691** (sur 913 ops). Priorisé par volume.

> ⚠️ **CAVEAT (vérifié W6 batch 2)** : ce compteur est une **BORNE HAUTE**. Le détecteur `wired` ne capte que les chemins littéraux dans `api-contracts.ts` ; il **rate les chemins construits par template-literals interpolés** (ex. `/observability/cost/monitors/${enc(name)}`). Exemple mesuré : sur 25 "non-wirés" observability, **23 étaient en réalité déjà wirés**, 2 seulement absents. ⇒ le vrai besoin de réintégration est **nettement < 752**. Raffiner le détecteur (préfixes de templates) est un suivi prudent à part. Valider chaque batch manuellement avant de wirer (éviter les doublons).

## explore-design (146)
- `POST /explore-design/{project_id}/ddl-actions` — Submit DDL actions
- `POST /explore-design/{project_id}/ddl-actions/execute` — Execute DDL actions
- `DELETE /explore-design/{project_id}/ddl-actions/{event_id}` — Remove a pending DDL action
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/preview` — Preview table data
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/columns/{column}/preview` — Preview column data
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/profile` — Profile table
- `GET /explore-design/{project_id}/tables/{database}/{schema}/{table}/columns/{column}/profile` — Profile column
- `GET /explore-design/{project_id}/versions` — List project versions
- `POST /explore-design/{project_id}/ingestion/schedule` — Schedule ingestion
- `POST /explore-design/{project_id}/ingestion/execute` — Execute ingestion
- `POST /explore-design/{project_id}/ingestion/operations` — Create ingestion operation for approval workflow
- `POST /explore-design/{project_id}/ingestion/operations/{operation_id}/execute` — Execute an ingestion operation
- `POST /explore-design/{project_id}/ingestion/operations/{operation_id}/rollback` — Rollback an ingestion operation
- `POST /explore-design/{project_id}/deployments/{deployment_id}/approve` — Approve deployment
- `POST /explore-design/{project_id}/deployments/{deployment_id}/reject` — Reject deployment
- `POST /explore-design/{project_id}/deployments/{deployment_id}/execute` — Execute deployment
- `POST /explore-design/{project_id}/deployments/{deployment_id}/cancel` — Cancel deployment
- `GET /explore-design/recent-deployment-errors` — Recent deployment errors
- `POST /explore-design/dynamic-tables` — Create dynamic table
- `PATCH /explore-design/dynamic-tables/{name}` — Alter dynamic table
- `POST /explore-design/dynamic-tables/{name}/suspend` — Suspend dynamic table
- `POST /explore-design/dynamic-tables/{name}/resume` — Resume dynamic table
- `POST /explore-design/dynamic-tables/{name}/refresh` — Refresh dynamic table
- `POST /explore-design/streams` — Create stream
- `GET /explore-design/streams/{name}` — Describe stream
- `GET /explore-design/streams/{name}/data` — Consume stream data
- `GET /explore-design/tasks` — List tasks
- `GET /explore-design/tasks/{name}` — Describe task
- `POST /explore-design/tasks/{name}/suspend` — Suspend task
- `POST /explore-design/tasks/{name}/resume` — Resume task
- `POST /explore-design/event-tables` — Create event table
- `DELETE /explore-design/event-tables/{name}` — Drop event table
- `POST /explore-design/hybrid-tables` — Create hybrid table
- `DELETE /explore-design/hybrid-tables/{name}` — Drop hybrid table
- `POST /explore-design/alerts` — Create alert
- `PATCH /explore-design/alerts/{name}` — Alter alert
- `POST /explore-design/{project_id}/full-dry-run` — Combined dry-run: DDL deployment + ingestion on cloned schema
- `POST /explore-design/{project_id}/dry-run` — Dry-run DDL on cloned schema
- `POST /explore-design/{project_id}/post-verify` — Verify deployment results
- `POST /explore-design/{project_id}/impact-analysis` — Analyze downstream impact
- … +106 autres

## gouvernance (100)
- `GET /gouvernance/gui-permissions` — List Gui Permissions
- `GET /gouvernance/gui-permissions/my-access` — Get My Page Access
- `GET /gouvernance/gui-permissions/effective/{username}` — Effective GUI page-access for an arbitrary user (admin)
- `GET /gouvernance/oauth/integrations` — List security integrations
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
- `POST /gouvernance/policies/aggregation` — Create aggregation policy
- `GET /gouvernance/policies/aggregation/{policy_name}/details` — Describe aggregation policy
- … +60 autres

## api (78)
- `POST /api/data360/track` — Frontend event tracking (batched)
- `GET /api/snowflake/explorer/tree` — Database/schema tree
- `GET /api/snowflake/explorer/objects/{object_id}` — Object detail (drawer summary)
- `GET /api/snowflake/explorer/objects/{object_id}/columns` — Object columns
- `GET /api/snowflake/explorer/objects/{object_id}/lineage` — Object lineage (upstream/downstream)
- `GET /api/snowflake/explorer/objects/{object_id}/impact` — Object impact analysis
- `GET /api/snowflake/explorer/objects/{object_id}/governance` — Tags + policies coverage for an object
- `GET /api/snowflake/explorer/objects/{object_id}/usage` — Object usage summary + time series
- `GET /api/snowflake/explorer/objects/{object_id}/audit` — Audit events for an object
- `GET /api/snowflake/explorer/objects/{object_id}/ddl` — GET_DDL for the object
- `GET /api/snowflake/explorer/objects/{object_id}/health` — Object health checks
- `GET /api/snowflake/explorer/objects/{object_id}/deep-dive` — Catalog deep-dive (object → product → project → dependencies)
- `GET /api/snowflake/explorer/objects/{object_id}/actions` — Catalog actions (right-rail affordances for this object)
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
- `GET /api/snowflake/explorer/objects/{object_id}/quality` — Data quality checks for an object
- `GET /api/snowflake/explorer/objects/{object_id}/timeline` — Unified event timeline for an object
- `POST /api/snowflake/explorer/objects/bulk-action` — Apply a bulk action across selected objects (dry-run default)
- `GET /api/snowflake/explorer/objects/export` — Stream the current /objects result as CSV
- `GET /api/snowflake/explorer/recent-activity/export` — Stream the recent-activity feed as CSV
- `GET /api/snowflake/explorer/objects/{object_id}/open-in-snowflake` — Build a Snowsight deep-link for the object
- `GET /api/snowflake/explorer/scoring/definitions` — Health/risk/governance scoring formulas
- `POST /api/snowflake/explorer/cache/install` — Create/refresh the DATA360 cache tables (idempotent)
- `POST /api/recommendations/analyze` — Recompute + upsert + return recos for a scope
- `GET /api/recommendations/` — List stored active recommendations
- `GET /api/recommendations/glossary` — Inspect the registered glossary (signals → actions)
- `GET /api/recommendations/capabilities` — Recommendations module capability hint (UX gating)
- `GET /api/recommendations/{reco_id}` — Get one reco by id
- `POST /api/recommendations/{reco_id}/acknowledge` — Mark a reco as acknowledged
- … +38 autres

## org-accounts (73)
- `GET /org-accounts/accounts/audit` — Consolidated per-account audit (credits+storage+queries+logins)
- `GET /org-accounts/credits/trend` — Daily credit trend
- `GET /org-accounts/health` — Health scores
- `GET /org-accounts/health/{account_name}` — Account health
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
- `GET /org-accounts/shares` — Outbound + inbound shares
- `DELETE /org-accounts/accounts/{account_name}` — Drop a Snowflake account (orgadmin only, hard with grace period)
- `GET /org-accounts/credits/top` — Top credit-consuming accounts
- `GET /org-accounts/storage/trend` — Daily storage trend (org-wide)
- `GET /org-accounts/storage/databases` — Per-database storage
- … +33 autres

## workflow (47)
- `GET /workflow/blocks/{block_type}` — Single ETL block detail (rich)
- `POST /workflow/blocks/{block_type}/render-sql` — Render a block's SQL from params (pure, no execution)
- `POST /workflow/events/resource-cleanup` — Record a dedicated resource-cleanup event (test harness)
- `GET /workflow/{workflow_id}/block-events` — Per-block run trace (panel run-history)
- `GET /workflow/{workflow_id}/contributors` — List workflow contributors
- `DELETE /workflow/{workflow_id}/contributors/{username}` — Remove workflow contributor
- `GET /workflow/{workflow_id}/steps` — Get workflow steps
- `PUT /workflow/{workflow_id}/steps/{step_id}` — Update workflow step
- `GET /workflow/jobs` — List async jobs
- `POST /workflow/{workflow_id}/compile` — Compile workflow
- `POST /workflow/{workflow_id}/validate` — Validate workflow
- `POST /workflow/dry-run` — Stateless dry-run from a graph body (no persistence)
- `POST /workflow/{workflow_id}/dry-run` — Dry-run a saved workflow (compile+validate, no execute)
- `POST /workflow/{workflow_id}/pre-check` — Pre-deployment preconditions
- `POST /workflow/{workflow_id}/post-verify` — Verify each block's output after execute
- `GET /workflow/{workflow_id}/dag` — DAG structure (nodes + AFTER edges) from compiled steps
- `GET /workflow/{workflow_id}/cost-summary` — Credits consumed by this workflow's task(s)
- `POST /workflow/{workflow_id}/cancel` — Cancel a running workflow/run
- `GET /workflow/{workflow_id}/tasks/{task_id}/logs` — Task run history / logs
- `POST /workflow/{workflow_id}/tasks/{task_id}/retry` — Re-run a failed task (EXECUTE TASK)
- `GET /workflow/compute-pools/{name}` — Compute pool detail
- `GET /workflow/{workflow_id}/clone-data-tests` — Test-real-life via zero-copy clone (per ETL block)
- `GET /workflow/{workflow_id}/runs/summary` — Workflow-global run metrics (front contract alias)
- `GET /workflow/{workflow_id}/runs` — List workflow runs
- `POST /workflow/{workflow_id}/runs/{run_id}/analyze` — AI-analyze a failed run
- `POST /workflow/{workflow_id}/schedule` — Schedule workflow as Snowflake task
- `POST /workflow/{workflow_id}/schedule/pause` — Pause (suspend) scheduled workflow task
- `POST /workflow/{workflow_id}/schedule/resume` — Resume scheduled workflow task
- `GET /workflow/{workflow_id}/task-status` — Get task execution history and stats
- `GET /workflow/{workflow_id}/schedules` — Get schedules for a workflow
- `GET /workflow/{workflow_id}/versions` — List workflow versions
- `PUT /workflow/{workflow_id}/draft` — Autosave workflow draft (no new version)
- `POST /workflow/{workflow_id}/rollback` — Rollback workflow to a prior version
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/approve` — Approve workflow deployment
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/reject` — Reject workflow deployment
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/execute` — Execute approved workflow deployment
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/cancel` — Cancel workflow deployment
- `POST /workflow/{workflow_id}/deployments/{deployment_id}/verify` — Verify workflow deployment results
- `POST /workflow/{workflow_id}/estimate-vs-reference` — Estimate workflow cost (compute/storage/AI) vs a reference table baseline
- `POST /workflow/{workflow_id}/validate-block` — Per-block pre-flight validate — used by the FE as the user edits a block
- … +7 autres

## cortex (32)
- `GET /cortex/conversations` — List the caller's AI chat exchanges (newest first)
- `GET /cortex/conversations/{conversation_id}` — Read one AI chat exchange (prompt + response)
- `POST /cortex/code-generate` — Generate code via Cortex with model picker (Python/SQL/YAML/JSON/TS/Bash)
- `POST /cortex/synthesize-rows` — Cortex generates ≤1000 synthetic rows matching a target schema
- `POST /cortex/icon-suggest` — Cortex picks the best Lucide icon name for a chart/title
- `GET /cortex/semantic-models/{model_name}` — Get semantic model
- `POST /cortex/ml/sentiment` — ML sentiment analysis
- `POST /cortex/ml/translate` — ML translation
- `POST /cortex/ml/summarize` — ML text summarization
- `POST /cortex/explore/tables` — Explore tables
- `GET /cortex/explore/databases` — List databases
- `GET /cortex/explore/schemas` — List schemas
- `GET /cortex/ml/finetune/jobs/{job_id}` — Describe fine-tuning job
- `POST /cortex/ml/finetune/jobs/{job_id}/cancel` — Cancel fine-tuning job
- `POST /cortex/ml/document-ai/upload` — Upload document for AI processing
- `POST /cortex/ml/document-ai/extract-to-table` — Extract document data and insert into table
- `GET /cortex/ml/classification/{model_name}/metrics` — Get model evaluation metrics
- `DELETE /cortex/ml/classification/{model_name}` — Drop classification model
- `POST /cortex/ml/top-insights/{name}/analyze` — Run Top Insights analysis
- `PATCH /cortex/snowpark/compute-pools/{name}` — Alter compute pool (scaling / auto-suspend)
- `POST /cortex/snowpark/compute-pools/{name}/suspend` — Suspend compute pool
- `POST /cortex/snowpark/compute-pools/{name}/resume` — Resume compute pool
- `GET /cortex/snowpark/services/{name}` — Describe a container service (full definition)
- `GET /cortex/snowpark/services/{name}/status` — Get service status and container health
- `GET /cortex/snowpark/services/{name}/logs` — Get container logs
- `GET /cortex/snowpark/endpoints/{service_name}` — List service endpoints
- `POST /cortex/snowpark/services/{name}/suspend` — Suspend SPCS service (stops billing, preserves state)
- `POST /cortex/snowpark/services/{name}/resume` — Resume a suspended SPCS service
- `POST /cortex/snowpark/services/{name}/auto-stop` — Schedule automatic suspend or drop of SPCS service after N seconds
- `GET /cortex/agents` — List Cortex Agents
- `GET /cortex/semantic-views` — List Semantic Views
- `GET /cortex/vectors/columns` — List vector embedding columns

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

## observability (25)
- `GET /observability/lineage` — Data lineage
- `GET /observability/lineage/access-patterns` — Access pattern analysis
- `GET /observability/lineage/cross-module` — Cross-module lineage explorer
- `GET /observability/activity/summary` — Activity summary
- `GET /observability/cost/warehouse-usage` — Warehouse cost usage
- `GET /observability/cost/daily-credits` — Daily credit usage
- `GET /observability/performance/metrics` — Performance metrics
- `GET /observability/performance/slow-queries` — Slow queries
- `GET /observability/dependencies` — Get object dependencies
- `GET /observability/dependencies/graph` — Get dependency graph
- `GET /observability/lineage/with-tasks` — Intelligent lineage with tasks
- `GET /observability/tasks/importable` — List importable tasks
- `GET /observability/slo-tracking` — SLO compliance — query success rate, P95 latency, task success rate
- `GET /observability/alerts` — Threshold breach alerts — failed queries, slow queries, task failures, credit spikes
- `GET /observability/probes/table` — Probe table freshness using row timestamps
- `GET /observability/probes/schema` — Probe all tables in a schema
- `GET /observability/probes/changes` — Detect changes since timestamp
- `POST /observability/probes/batch-check` — Batch check data freshness for multiple tables
- `GET /observability/sensors/all` — Batch sensor check — all modules in one call
- `GET /observability/alerts/cross-module` — Cross-Module Alerts
- `POST /observability/slo` — Define a user SLO
- `POST /observability/alerts/{alert_id}/ack` — Acknowledge an alert
- `GET /observability/cost/monitors/{name}` — Get a resource monitor (FinOps)
- `POST /observability/cost/monitors/{name}/assign` — Assign a warehouse to a resource monitor (FinOps)
- `PUT /observability/budgets/{name}` — Update a spend budget (FinOps)

## catalog (22)
- `GET /catalog/objects/{object_id}/360` — Object 360 — superset of /deep-dive (adds usage, finops, recos, scores)
- `GET /catalog/objects/{object_id}/scores` — Persisted scores for one object (None if never computed)
- `POST /catalog/objects/{object_id}/scores/recompute` — Compute + persist scores for one object
- `POST /catalog/objects/{object_id}/clustering/apply` — Apply a clustering-key recommendation — ALTER TABLE <fqn> CLUSTER BY (<cols>)
- `POST /catalog/recommendations/{reco_id}/apply` — Mark a recommendation as applied + cascade cache invalidation
- `GET /catalog/objects/{object_fqn}/history` — Per-object history — UNION of PROJECT_EVENTS + USER_REQUESTS + ACCOUNT_USAGE.ACCESS_HISTORY
- `GET /catalog/products/{product_id}/overview` — Product card + scoring + counts
- `GET /catalog/products/{product_id}/lineage` — Anchor table + 1-hop neighbours
- `GET /catalog/products/{product_id}/assets` — Objects bound to this product
- `GET /catalog/products/{product_id}/kpis` — KPIs bound to product
- `POST /catalog/products/{product_id}/recommend-model` — Queue a Cortex model proposal for this product
- `POST /catalog/products/{product_id}/generate-kpis` — Auto-generate KPI drafts for a product
- `POST /catalog/products/{product_id}/publish` — Flip product DRAFT → PUBLISHED + emit event
- `GET /catalog/kpis/{kpi_id}` — Get one KPI
- `POST /catalog/kpis/{kpi_id}/validate` — Flip KPI DRAFT → VALIDATED
- `GET /catalog/refresh/{run_id}` — Refresh run status
- `GET /catalog/tables/{database}/{schema}/{table}/context` — SmartRightBar Section 1 — table context (stats + tags + cost/dq)
- `GET /catalog/tables/{database}/{schema}/{table}/governance` — SmartRightBar Section 3 — tags, masking/RLS policies, PII flags
- `GET /catalog/tables/{database}/{schema}/{table}/lineage` — SmartRightBar Section 4 — 1-hop upstream + downstream lineage
- `GET /catalog/tables/{database}/{schema}/{table}/ownership` — SmartRightBar Section 6 — owner role + top reader users 30d
- `GET /catalog/tables/{database}/{schema}/{table}/ingestion` — SmartRightBar Section 5 — last loads + tasks/streams (best-effort)
- `GET /catalog/profile/{database}/{schema}/{table}` — Per-column null % + approx distinct (sampled ≤1000 rows, no full scan)

## bi-dashboard (19)
- `GET /bi-dashboard/{project_id}` — Get dashboard design
- `POST /bi-dashboard/{project_id}/pages` — Add page
- `PUT /bi-dashboard/{project_id}/pages/{page_id}` — Update page
- `POST /bi-dashboard/{project_id}/widgets` — Add widget to page
- `PUT /bi-dashboard/{project_id}/widgets/{widget_id}` — Update widget
- `POST /bi-dashboard/{project_id}/filters` — Add filter
- `DELETE /bi-dashboard/{project_id}/filters/{filter_id}` — Delete filter
- `POST /bi-dashboard/{project_id}/snapshot` — Save dashboard design as version
- `POST /bi-dashboard/{project_id}/render` — Batch render all widgets on a page
- `POST /bi-dashboard/charts/data` — Get chart data
- `POST /bi-dashboard/{dashboard_id}/drill-through` — Drill through widget data
- `GET /bi-dashboard/{dashboard_id}/cost` — Per-dashboard query cost (credits/bytes)
- `GET /bi-dashboard/{project_id}/status` — Get dashboard publish status
- `POST /bi-dashboard/{project_id}/publish` — Publish dashboard (draft → live)
- `POST /bi-dashboard/{project_id}/unpublish` — Unpublish dashboard (live → draft)
- `GET /bi-dashboard/{project_id}/shares` — List dashboard share grants
- `POST /bi-dashboard/{project_id}/share` — Share dashboard with a user or role
- `DELETE /bi-dashboard/{project_id}/shares/{share_id}` — Revoke a dashboard share grant
- `GET /bi-dashboard/{project_id}/export` — Export dashboard config + widget data as JSON

## cache (19)
- `GET /cache/svc-health` — Service account health check
- `GET /cache/stats` — Cache statistics
- `GET /cache/test-connection` — Test cache connection
- `POST /cache/clear/pattern` — Clear cache by pattern
- `POST /cache/clear/all` — Clear all cache
- `GET /cache/keys` — List cache keys
- `GET /cache/keys/{key}` — Get cache key value
- `POST /cache/warmup` — Warm up cache
- `GET /cache/health` — Cache health check
- `GET /cache/performance` — Cache performance stats
- `GET /cache/refresh/status` — Cache refresh status
- `POST /cache/refresh/start` — Start cache refresh
- `POST /cache/refresh/stop` — Stop cache refresh
- `POST /cache/refresh/trigger/{job_name}` — Trigger refresh job
- `POST /cache/warmup/trigger` — Trigger cache warmup
- `GET /cache/dashboard` — Cache dashboard
- `GET /cache/breakdown` — Cache key breakdown by class
- `GET /cache/invalidations` — Recent cache invalidations
- `GET /cache/kpis` — Granular cache KPIs

## projects (18)
- `POST /projects/seed-samples` — Seed sample E&D + Workflow projects (owner/editor/viewer) — super-admin
- `POST /projects/{project_id}/events` — Add project event
- `POST /projects/{project_id}/contributors` — Add contributor
- `GET /projects/{project_id}/comments` — List project comments (threaded)
- `DELETE /projects/{project_id}/comments/{comment_id}` — Delete a project comment (soft)
- `PATCH /projects/{project_id}/events/bulk-update` — Bulk update events
- `GET /projects/{project_id}/deployments/{deployment_id}` — Deployment full detail
- `PUT /projects/{project_id}/deployments/{deployment_id}/steps/{step}` — Persist a wizard step result
- `POST /projects/{project_id}/deployments/{deployment_id}/approve` — Approve deployment
- `POST /projects/{project_id}/deployments/{deployment_id}/reject` — Reject deployment
- `POST /projects/{project_id}/deployments/{deployment_id}/execute` — Execute deployment
- `POST /projects/{project_id}/rollback` — Rollback project version
- `GET /projects/{project_id}/runs` — List project runs
- `GET /projects/{project_id}` — Get a project
- `POST /projects/{project_id}/lock` — Lock project for editing
- `POST /projects/{project_id}/unlock` — Release project editing lock
- `POST /projects/{project_id}/rls` — Create + apply a row-access policy to a project table
- `DELETE /projects/{project_id}/rls/{binding_id}` — Unapply a row-access binding

## connect (13)
- `PATCH /connect/integration/{integration_name}` — Edit storage integration (ALTER STORAGE INTEGRATION)
- `POST /connect/tasks/{task_name}/resume` — Resume a suspended task
- `POST /connect/tasks/{task_name}/suspend` — Suspend a running task
- `GET /connect/snowflake_lake/databases` — ✅ Step 2: Choose database
- `GET /connect/snowflake_lake/schemas/{database_name}` — ✅ Step 3: Choose schema
- `GET /connect/snowflake_lake/tables/{database_name}/{schema_name}` — ✅ Step 4: Choose table
- `GET /connect/stages/{stage_name}/grants` — List grants on a stage (governance)
- `GET /connect/stages/{stage_name}/files/{file_path}/preview` — Preview file content (Datalake Browser)
- `GET /connect/stages/{stage_name}/files/{file_path}/download` — Download file (Datalake Browser)
- `DELETE /connect/stages/{stage_name}/files/{file_path}` — Delete file (Datalake Browser)
- `GET /connect/connectors/{connector_id}` — Connector detail (catalog entry + best-effort last-sync)
- `POST /connect/connectors/{connector_id}/test` — Validate connector connectivity config (no fake success)
- `POST /connect/connectors/{connector_id}/sync` — Trigger a connector sync (EXECUTE TASK) — 409 if no target

## administration (13)
- `GET /administration/performance/{account}/overview` — Account-grain performance KPIs (USER_REQUESTS)
- `GET /administration/performance/{account}/by-endpoint` — Per-endpoint (method, path) performance rollup
- `GET /administration/performance/{account}/by-user` — Per-user activity rollup
- `GET /administration/performance/{account}/by-cache` — Cache hit/miss rollup pivoted on a validated axis
- `GET /administration/performance/{account}/by-module` — Per-module performance rollup
- `GET /administration/performance/{account}/errors` — Most-recent errors and RBAC denials
- `GET /administration/performance/{account}/user/{username}` — Per-user performance drill-down
- `GET /administration/performance/{account}/by-tab` — Workload rollup per tab (actions behind each tab)
- `GET /administration/performance/{account}/tab/{tab}` — All workloads behind one tab: endpoints, actions, users
- `GET /administration/performance/audit/by-account` — Endpoint audit by account (super-admin: cross-account)
- `GET /administration/performance/{account}/events` — Data360 events audit (USER_ACTIVITY) by module × type
- `GET /administration/performance/{account}/events/feed` — Most-recent Data360 events with all columns
- `GET /administration/platform-health` — Account-grain platform-health KPIs (ACCOUNT_USAGE, caller connection — no SVC needed)

## data-quality (9)
- `GET /data-quality/run-history` — Past quality-check runs
- `POST /data-quality/projects/{project_id}/dmf-check` — Run built-in DMF check
- `GET /data-quality/projects/{project_id}/dmf-results` — Get DMF results for table
- `GET /data-quality/projects/{project_id}/dmf-suggest` — Suggest DMFs for table
- `POST /data-quality/dmf/suggest` — Suggest DMFs for a table (POST)
- `POST /data-quality/tables/{database}/{schema}/{table}/optimize` — Optimize a table (RECLUSTER if clustered, else no-op + suggestion)
- `POST /data-quality/auto-profile` — Auto-profile a table (refresh column stats)
- `POST /data-quality/dmf/associate` — Associate a DMF with table column(s)
- `POST /data-quality/dmf/custom` — Create a custom Data Metric Function

## deployments (8)
- `POST /deployments/track` — Start a deployment lifecycle
- `PATCH /deployments/track/{deployment_id}/step` — Advance current step or record per-step errors
- `POST /deployments/track/{deployment_id}/complete` — Finalize a deployment (SUCCEEDED/FAILED/CANCELLED)
- `GET /deployments/track/{deployment_id}` — Get current state of a deployment
- `POST /deployments/track/{deployment_id}/approve` — Approve a pending deployment
- `POST /deployments/track/{deployment_id}/reject` — Reject a pending deployment
- `POST /deployments/track/{deployment_id}/execute` — Execute (run) an approved deployment
- `POST /deployments/track/{deployment_id}/rollback` — Roll a deployment's project back to a prior version

## admin (7)
- `GET /admin/api-health/runs/{run_id}` — Stored endpoint rows + summary + slowest-N for one persisted run
- `GET /admin/service-account/health` — Service Account Health
- `GET /admin/svc-registry` — Get Svc Registry
- `GET /admin/endpoint-usage` — Top API endpoints by request count
- `GET /admin/usage-by` — AUDIT_LOG request counts grouped by a dimension
- `GET /admin/server-metrics` — Live in-process server metrics
- `GET /admin/api-health/introspect` — Snowflake query + related events behind a probed api-health call

## data-products (6)
- `GET /data-products/{product_id}` — Get data product detail
- `POST /data-products/{product_id}/publish` — Publish a data product as a Snowflake SHARE (CREATE SHARE + GRANT … TO SHARE)
- `POST /data-products/{product_id}/refresh` — Refresh a stale data product's backing object (ALTER DYNAMIC TABLE … REFRESH)
- `POST /data-products/{product_id}/subscribe` — Subscribe to a data product (real ALTER SHARE … ADD ACCOUNTS grant)
- `GET /data-products/{product_id}/lineage` — Data product lineage (OBJECT_DEPENDENCIES around TABLE_FQN)
- `GET /data-products/{product_id}/consumers` — Data product consumers (subscriber accounts + recent readers)

## cache-stream (5)
- `GET /cache-stream/stream` — Cache SSE stream
- `GET /cache-stream/last-invalidation/{cache_key}` — Last invalidation time
- `GET /cache-stream/stats` — Cache stream stats
- `GET /cache-stream/available-keys` — Available cache keys
- `POST /cache-stream/test-invalidation` — Test cache invalidation

## chat (5)
- `GET /chat/conversations/{conversation_id}` — Get conversation
- `POST /chat/conversations/{conversation_id}/messages` — Send message
- `POST /chat/conversations/{conversation_id}/read` — Mark as read
- `POST /chat/conversations/{conversation_id}/attachments` — Upload attachment
- `GET /chat/conversations/{conversation_id}/participants` — Get conversation participants

## notifications (5)
- `GET /notifications` — List current user's notifications
- `GET /notifications/unread-count` — Cheap unread counter for the bell badge
- `PATCH /notifications/{notification_id}/read` — Mark a single notification as read
- `POST /notifications/mark-all-read` — Mark every unread notification as read
- `POST /notifications/broadcast` — Publish a notification — fan-out happens server-side

## common (4)
- `GET /common/schemas/{database_name}` — ✅ Step 3: Choose schema
- `GET /common/tables/{database_name}/{schema_name}` — ✅ Step 4: Choose table
- `GET /common/get_table_columns/` — Get table columns (trailing slash)
- `GET /common/get_table_columns` — Get table columns

## access-requests (2)
- `POST /access-requests/{request_id}/approve` — Owner approves → executes a real Snowflake GRANT
- `POST /access-requests/{request_id}/deny` — Owner denies the request

## health (1)
- `GET /health` — Health check

## ready (1)
- `GET /ready` — Readiness check

## analytics (1)
- `GET /analytics/user-activity/summary` — User activity summary KPIs

