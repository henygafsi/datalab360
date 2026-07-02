# Integration Registry — backend endpoints not yet wired in the frontend (2026-07-02)

Live backend: **1025 operations** (917 paths) at api.datalab360.io / local :8000.
Frontend coverage after full-tree verification: **~91%** (932 ops with a real caller).
**93 operations confirmed zero-caller.** Method: each candidate re-grepped by distinctive tail token across `apps/data360/src` (contracts + services + dashboard pages + hooks), resolving `const PREFIX/BASE` and helper-arg path composition.

## TIER 1 — high leverage, ship next (verified zero-caller, clear journey gap)

| Journey it completes | Method | Path | Purpose |
|---|---|---|---|
| **Personal Workspace (whole module, 0% wired)** | GET/POST/PATCH/DELETE | `/api/workspace/saved-views[/{view_id}]` | Saved filter snapshots CRUD |
| | GET/POST/DELETE | `/api/workspace/watchlist[/{object_id}]` | Watchlisted objects |
| | GET | `/api/workspace/recently-opened` | Recently-opened objects |
| | GET | `/api/workspace/investigation-modes` | Pre-built filter presets |
| | POST | `/api/workspace/touch` | Record object opened |
| **Connect → Snowflake-lake source (wizard steps 2–4)** | GET | `/connect/snowflake_lake/databases` | Choose database |
| | GET | `/connect/snowflake_lake/schemas/{database_name}` | Choose schema |
| | GET | `/connect/snowflake_lake/tables/{database_name}/{schema_name}` | Choose table |
| **RBAC / Access admin (matrix + simulator missing)** | GET | `/api/platform/permission-matrix` | Users × module/page/tab effective-access grid |
| | GET | `/api/platform/object-permission-matrix` | Users × data-object × privilege grid |
| | GET | `/api/platform/access-simulator` | "What would role X see on page/tab?" |
| | GET | `/api/platform/me/grants` | Effective grant bundle for current user |
| | GET | `/api/platform/users/{username}/effective-grants` · `/object-grants` | Per-user effective / object grants |
| | GET/POST | `/api/platform/grants/roles` · `/data-scope` | Role-capability flags / data-scope grants |
| **Governance → Policies (4 unwired families)** | POST | `/gouvernance/policies/{network,session,password,aggregation}` | Create policy |
| | POST | `/gouvernance/policies/{network,session,password}/{name}/set-default` | Set account default |
| | GET | `/gouvernance/policies/{type}/{name}/details` (7 types) | Describe policy |
| **Workflow reliability** | GET/PUT | `/workflow/{id}/draft` | Crash-safe autosave/restore |
| | POST | `/workflow/{id}/tasks/{task_id}/retry` | Re-run failed task |
| | POST | `/workflow/{id}/deployments/{deployment_id}/{verify,cancel}` | Post-deploy verify / cancel |
| **Recommendations loop** | POST | `/api/recommendations/{reco_id}/apply` | Apply remediation (mark-applied + SQL) |
| **Data Quality actions** | POST | `/data-quality/dmf/custom` | Author custom Data Metric Function |
| | POST | `/data-quality/tables/{db}/{schema}/{table}/optimize` | Recluster/optimize |
| | GET | `/data-quality/run-history` | Past quality-check runs |
| **Project RLS** | GET/POST/DELETE | `/projects/{project_id}/rls[/{binding_id}]` | Row-access bindings |
| **Catalog remediation** | POST | `/catalog/objects/{object_id}/clustering/apply` | Apply clustering-key reco |

## TIER 2 — observability / admin depth
- Snowflake Explorer rollups (19 ops): `/api/snowflake/explorer/{tree,recent-activity,sync/*,objects/bulk-action,selection-review}` + db/schema-level audit/governance/lineage. (A generic `/api/snowflake/explorer/${path}` passthrough can reach some ad-hoc; none surfaced as a feature.)
- Administration performance audit (6): `/administration/performance/audit/*`, `/api/administration/overview`.
- Task lifecycle (4): `/connect/tasks/{name}/{suspend,resume}`, `/explore-design/tasks/{name}/{suspend,resume}`.
- Command-center unified KPI (1): `/command-center/kpis`.

## TIER 3 — internal / duplicate / infra (do not surface)
`/workflow/{id}/rollback` (dup of wired `/projects/{id}/rollback`); `*/cache/install` bootstraps; `/cache-stream/{available-keys,last-invalidation,test-invalidation}`; `/workflow/jobs`, `/workflow/events/resource-cleanup`; `/projects/seed-samples`; `/api/recommendations/{capabilities,glossary}`; `/health`, `/ready`, `/api/refresh-state`.

## Per-prefix coverage
explore-design 175/177 (99%) · gouvernance 135/149 (91%) · org-accounts 83/83 · workflow 73/81 (90%) · cortex 70/70 · connect 40/45 (89%) · observability 43/43 · command-center 41/42 · **snowflake-explorer 19/38 (50%)** · catalog 32/33 · data-quality 29/32 (91%) · projects 27/31 (87%) · bi-dashboard 31/31 · **platform 11/22 (50%)** · cache 21/21 · administration 11/17 (65%) · admin 14/14 · recommendations 8/12 (67%) · data360 11/11 · **workspace 0/11 (0%)** · chat/user/deployments/data-products/access-requests/notifications 51/51.

## Dead FE contracts (referenced by FE, absent from live openapi — cleanup)
`/admin/cache/warm-status` (→`/admin/cache/warm`) · `/catalog/views/{...}/ddl` (→`/catalog/objects/{id}/ddl`) · `/sources/detected-models` (`/sources/*` gone) · `/bi/sales/{dashboard,overview}` (→`bi-dashboard/*`) · `/metadata/init_metadata` · `/gouvernance/{get_src_table_storage_info,get_stage_storage_info,get_user_info}` · flat `/explore-design/{deploy_schema,deployments,deployments/{id}/execute}` (→project-scoped + `/deployments/track/*`) · `/api-proxy/gouvernance/{disable_user,enable_user}` (→`/gouvernance/{enable,disable}_user/`).
Renamed-not-dead (update call shape): `/explore-design/{events,validate-events,projects}` → project-scoped equivalents.
