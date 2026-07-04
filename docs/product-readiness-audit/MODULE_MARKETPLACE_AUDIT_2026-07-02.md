# Module Marketplace-Readiness Audit — 2026-07-02

**Frame**: each Data360 module must be sellable as a standalone product (Snowflake Native App / marketplace listing).
**Method (ground truth)**: backend routes enumerated by importing the live FastAPI app (`from app.main import app` → **1031 method+path pairs**, endpoint unwrapped through cache decorators to true source `file:line`). Front surface = **987 path references** extracted from `apps/data360/src` (`.ts/.tsx`, api-health probe catalog excluded). A route is "wired" when its normalized path appears in front source; every "unsurfaced" claim below was **individually re-verified** by grep for an actual `apiClient` call (services build paths from base-consts, so raw match alone over-reports). Wired % is a lower bound.
**Rule respected**: no new endpoints proposed anywhere — only surfacing of existing ones, cited `METHOD path [backend file:line]` (paths relative to `/Users/datalab360/Documents/data360_pro/backend/`).

Global wiring: **505+/1031 wired (~55–60%)**. Backend is ahead of the front everywhere except BI.

---

## 1. account_overview (Command Center + Org Accounts) — ready ≈ 40%

**Front**: `(dashboard)/account-overview/page.tsx` + `app/shared/command-center/` (KPI strip, ApprovalDetailModal, tabs) + `shared/org-accounts/` (accounts-table, AccountCreationWizard, credits/overview tabs). Gating thin: 3+2 `useCanPerform` calls.
**Backend**: 59/163 wired — the biggest surfacing gap of the platform (`modules/command_center` 80 routes + `modules/org_accounts` 83).

**Top 5 unsurfaced (verified zero product references)**
1. `GET /org-accounts/security-overview` [app/modules/org_accounts/router.py:1990] + `GET /org-accounts/audit/login-history` [router.py:1851] (+ `audit/query-history`:1691, `audit/access-history`:1779) — a full Security & Audit tab exists server-side.
2. `GET /command-center/kpis` [app/modules/command_center/router.py:815] + `GET /command-center/kpis/{dimension}` [router.py:777] + `GET /command-center/recommendations/{dimension}` [router.py:983] — the per-dimension KPI/reco spine the right-bar spec asks for.
3. `GET /org-accounts/anomalies` [app/modules/org_accounts/finops_router.py:711] + `GET /org-accounts/cost-simulation/{object_type}/{object_id}` [finops_router.py:1944] — FinOps anomaly feed + what-if cost simulator.
4. `GET /command-center/user-activity-monitor` [app/modules/command_center/user_monitor.py:166] (+ `/errors`:290) — per-user activity/error monitor (known 500 on deployed host; local OK).
5. `GET /command-center/cost-by-service` [router.py:1684] / `cost-by-warehouse` [router.py:1641] / `clustering-costs` [router.py:1719] / `mv-refresh-costs` [router.py:1793] — service-level cost meters.
Bonus: the entire ~30-route Snowflake object explorer (`/api/snowflake/explorer/*`, snowflake_explorer/router.py:168–1081) is in api-contracts but only partially driven by UI.

**Role-fit**: only 1 admin gate in the backend module; org-account lifecycle actions (suspend/reset-password/rotate-keys, lifecycle_router.py:186–392) are wired but front gating is thin (7 `useCanPerform` in shared/org-accounts) — a non-admin viewer sees actionable rows. No approver view here even though ApprovalDetailModal exists.
**Marketplace blockers**: `account-overview/pricing-reference.json` has **zero consumers** (dead static pricing) while live meters exist (`GET /org-accounts/credits` [router.py:2789], `metering` [router.py:749], `organization/costs` [router.py:2507]); 1 empty-state file only; module is org-admin-shaped — needs a single-account read-only story to sell.

## 2. connect (Connect Data) — ready ≈ 75%

**Front**: single rich page `(dashboard)/data-source-connection/` (ConnectCockpit, SourceCatalog + connectors-catalog.json, DatalakeBrowser, InternalStageCreator, ConnectorAiHelper, ConnectorHealthStrip). 12 `useCanPerform` gates. Services fully wired: 40/45.
**Top unsurfaced (all verified)**
1–3. `GET /connect/snowflake_lake/databases` [app/modules/connectors/router.py:913], `GET /connect/snowflake_lake/schemas/{database_name}` [router.py:938], `GET /connect/snowflake_lake/tables/{database_name}/{schema_name}` [router.py:966] — native lake browser (DatalakeBrowser currently uses other routes).
4–5. `POST /connect/tasks/{task_name}/resume|suspend` [router.py:820/847] — wired only from `app/shared/observability/index.tsx:231`, i.e. the Connect module's own UI has no ingestion-task pause/resume; cross-module leak of a connect capability.
**Role-fit**: backend has no admin gates (mutations rely on Snowflake role of session); front gates 12 mutating buttons — viewer mode mostly OK. No approver concept (fine).
**Marketplace blockers**: **0 empty-state files** — first-run screen shows an empty cockpit; **P0 security**: real Oracle ADB admin password hardcoded at `page.tsx:941/2596` (memory: rotate + strip before any listing); health strip + catalog JSON are good packaging assets. Few cross-module deps → best standalone candidate after fixes.

## 3. explore_design (Explore & Design) — ready ≈ 55%

**Front**: flagship — `(dashboard)/explore-design/` (canvas, catalog/ sub-page Sources|Products|All, docked release cockpit, DeployStateButton 9-face, ReleasePanel 7 steps, AI Change Analyst) + `services/explore-design/index.ts` (largest service). 20 gates, 10 empty-state files (best onboarding). 121/241 wired; release/approver spine and ai/schema-health, scheduled-deployments, lineage/column, watermark, dry-run(ddl) confirmed wired.
**Top 5 unsurfaced (verified)**
1. `POST /explore-design/{project_id}/full-dry-run` [app/modules/projects/explore_design/router.py:1133] + `POST .../pre-deploy-checks` [router.py:1734] + `POST .../sql-diff` [router.py:1754] — the release-safety triad; ReleasePanel has no "simulate whole release" step.
2. `GET /explore-design/versions/{from}/compare/{to}` [lifecycle_router.py:464] + `.../migration/{to}` [:477] + `POST /explore-design/versions/{version_id}/promote` [:490] — version diff & promote (VersionHistory UI shows list only).
3. `POST /explore-design/{project_id}/cascade/rename` [router.py:1675] + `cascade/drop` [:1694] + `POST .../quality-gates/run` [router.py:1307] — safe refactors + quality gates.
4. Project collaboration spine: `GET|POST /projects/{project_id}/comments` [app/modules/projects/router.py:310/335], `POST /projects/{project_id}/lock|unlock` [router.py:996/1016], `POST /projects/seed-samples` [router.py:62] — no commenting/locking UI at all.
5. ERD persistence family: `GET|PUT /explore-design/projects/{project_id}/erd` [lifecycle_router.py:640/669] + `erd/auto-layout` [:684] — currently zero calls (canvas layout not persisted through this route).
**Defect found**: front calls `GET ${V1_EXPLORE}/ai/savings-summary` (`app/services/explore-design/index.ts:4707`) but backend exposes `GET /explore-design/{project_id}/ai/savings` [router.py:2111] — mismatch → savings meter can 404.
**Role-fit**: named-approver model wired (release_router.py:419/526 + api-contracts.ts:317); **scheduled-deployment approvals wired**; 132 approver refs backend. Gap: `GET /gouvernance/d360-roles/my-module-access` never consumed → a read-only analyst still gets full edit canvas until server rejects.
**Marketplace blockers**: hard dependency on connect (sources) and projects spine; but has docs/ dir, empty-feds, and its own AI value — flagship listing. Cost story exists via unsurfaced `ai/savings`.

## 4. workflow — ready ≈ 70%

**Front**: `(dashboard)/workflow/` (ETLPipelineBuilder canvas, AI build docked review, WorkflowListCockpit with pending approvals, dev-tools). 18 gates, 5 empty-state files. 70/81 wired; reject/verify/cancel + contributors + git/notebooks confirmed wired via `services/workflow/index.ts`.
**Top 5 unsurfaced (verified)**
1. `POST /workflow/dry-run` [app/modules/projects/workflow/router.py:864] — pipeline simulation before save (canvas has no dry-run button).
2. `PUT /workflow/{workflow_id}/draft` [router.py:1689] + `GET .../draft` [:1724] — server-side draft autosave (AI build keeps drafts client-side only).
3. `GET /workflow/{workflow_id}/runs/summary` [router.py:1241] — per-workflow run KPIs (cockpit lists runs w/o summary).
4. `GET /workflow/blocks/{block_type}` [router.py:314] + `POST /workflow/blocks/{block_type}/render-sql` [:328] — rich block detail + SQL preview for the builder palette.
5. `POST /workflow/{workflow_id}/rollback` [router.py:1772] + `GET /workflow/jobs` [:799] — rollback to version & cross-workflow job list.
**Role-fit**: approve/reject wired and gated; contributors CRUD wired (roles per workflow). Viewer: read-only run history works; but edit canvas not disabled by module-access map (same platform gap).
**Marketplace blockers**: depends on explore-design/projects spine (`useProjectContext`) and connect sources; cost meter exists and is wired (`estimate-vs-reference` confirmed in service) — good; dev-tools/ dir should be hidden from customer builds.

## 5. gouvernance (Governance) — ready ≈ 60%

**Front**: deepest module — 9 sub-routes (`governance/{roles,users,grants,policies,projects,oauth,access-matrix,security-matrix}`) + `shared/governance` (BulkRoleBar, docked-form-panel). 52+19 gates — best-gated module. 118/177 wired.
**Top 5 unsurfaced (verified)**
1. Policy families with zero UI: `GET /gouvernance/policies/network/list` [app/modules/gouvernance/routers/governance_policies.py:1065] (+POST:1097, details:1132, set-default:1196), `GET .../password/list` [:1451] (+POST:1486), `GET .../session/list` [:1595] (+POST:1630) — closes the known "Policy Grants 405" audit: the routes now exist backend-side.
2. Policy lifecycle depth: `GET /gouvernance/policies/{policy_type}/{policy_name}/references` [governance_policies.py:2029], `POST .../unapply-all` [:2092], `PUT .../roles` [:1889] — impact-aware unapply/reassign.
3. Masking/row-access full CRUD: `POST /gouvernance/policies/masking` [:850], `masking/apply` wired but `masking/remove` [:981], `masking/replace` [:1015], `row-access/remove|replace` [:771/804] unsurfaced — apply-only UI today.
4. Platform grants intelligence: `GET /api/platform/permission-matrix` [app/modules/platform_core/router.py:738], `GET /api/platform/object-permission-matrix` [:1095], `GET /api/platform/access-simulator` [:474], `GET /api/platform/users/{username}/effective-grants` [:680] — the access-matrix page uses other feeds; simulator has no UI.
5. Object pickers for policy targeting: `GET /gouvernance/policies/objects/databases|schemas|tables|columns` [governance_policies.py:2161/2186/2212/2238] — forms currently free-type FQNs.
**Role-fit**: 115 admin-gate usages backend (strongest enforcement). **Platform-wide gap owned here**: `GET /gouvernance/d360-roles/my-module-access` [d360_roles.py:735] returns read|write|none per module but has **zero UI consumers** (only fetch_roles.ts wrapper + contracts). `GET /gouvernance/d360-roles/effective/{username}` [d360_roles.py:919] + `GET /gouvernance/gui-permissions/effective/{username}` [gui_permissions.py:193] would give admins an impersonation preview — not surfaced.
**Marketplace blockers**: sellable standalone (its own DB objects); needs `GET /gouvernance/user/mfa/status` [gouvernance.py:3849] surfaced for a security-posture tile; no pricing meter (governance is seat-priced — fine).

## 6. bi_reporting (Business Reporting) — ready ≈ 85%

**Front**: `(dashboard)/bi-dashboard/` + `[projectId]` route, BiSmartRightBar (no-popup editor), smart filters, share/snapshot. 31 gates. **39/39 backend routes wired — only fully-surfaced module** (pages/widgets/filters/shares CRUD + data-products subscribe/refresh all confirmed).
**Unsurfaced**: none. Remaining work is UX depth, not wiring.
**Role-fit**: BI backend is runtime-gated now (2026-07-02 memory); viewer gets consume mode via shares; snapshot gated. Gap: no explicit "viewer" dashboard landing (consume-only list) — relies on edit page with disabled buttons.
**Marketplace blockers**: hard dependency on projects spine for `[projectId]`; draft/publish + preselect-source still pending (BI restructure memory); `POST /data-products/{product_id}/subscribe` [app/modules/projects/data_products.py:957] is wired — the literal marketplace primitive exists; build the empty-state gallery around it (1 empty-state file today).

## 7. intelligent (AI Intelligence) — ready ≈ 65%

**Front**: `(dashboard)/intelligent/` — 10 tab content files (cortex-chat, semantic-models, ai-advisor, advanced-ml, snowpark-services, query-analytics, ml-features, local-analytics, ai-prompt-console). 27 gates. 72/94 wired; snowpark suspend/resume/auto-stop, finetune jobs, agents/semantic-views, conversations all confirmed wired.
**Top 5 unsurfaced (verified)**
1. `POST /cortex/ml/document-ai/upload` [app/modules/intelligence/cortex/router.py:2816] + `POST /cortex/ml/document-ai/extract-to-table` [:2869] — advanced-ml tab creates models but has no upload→extract flow (the demo-able feature).
2. `POST /api/recommendations/{reco_id}/dismiss` [app/modules/recommendations/router.py:294] — snooze/reopen/apply wired, dismiss missing → insights list can't be cleaned.
3. `GET /api/recommendations/capabilities` [recommendations/router.py:161] — lets the front disable unavailable reco actions instead of 404-ing (fits InsightActionButton contract).
4. `GET /api/recommendations/glossary` [recommendations/router.py:138] — reco-type descriptions for helper copy (marketplace descriptive help, zero cost).
5. `GET /cortex/explore/schemas` [cortex/router.py:2501] — schema browser for prompt-console grounding.
**Role-fit**: **0 backend admin gates in the module** — Snowpark/service mutations rely on front gating (27) + Snowflake role; a crafted API call by an analyst reaches suspend/delete. Sellability requires the gouvernance module's action-registry to cover `intelligent` actions (registry exists — mapping/org_accounts registry memory).
**Marketplace blockers**: `AiCostBadge` + `ai-store.ts` read **static `costs-reference.json`** while a live meter exists: `GET /org-accounts/cortex-costs` [app/modules/org_accounts/router.py:2165] — swap to live for honest pricing; brand rule OK (module name "AI Intelligence"), but tab component names leak "cortex" in code only.

## 8. data_quality (Data Health) — ready ≈ 70%

**Front**: single page `(dashboard)/data-quality/` + components (Profiler wired 2026-07-01). Only 5 gates. 28/32 wired.
**All 4 unsurfaced (verified)**
1. `GET /data-quality/run-history` [app/modules/data_quality/router.py:455] — DQ run audit trail; page shows current results only.
2. `POST /data-quality/tables/{database}/{schema}/{table}/optimize` [router.py:2076] — one-click remediation after a failed check (detect→act CTA fit).
3. `POST /data-quality/dmf/associate` [app/modules/data_quality/dmf_lifecycle_router.py:94] — note: front associates DMFs via `/gouvernance/policies/dmf/associate` (services/governance/dmf.ts) — dual route; standalone DQ listing must use its own module route to avoid a governance dependency.
4. `POST /data-quality/dmf/custom` [dmf_lifecycle_router.py:123] — custom metric creation absent from UI.
**Role-fit**: no backend admin gates; 5 front gates is thin — viewer sees run buttons. No approver flow (fine for DQ).
**Marketplace blockers**: single-page module needs the run-history + scheduling story to justify standalone pricing; per-project dmf-check is wired (`services/data-quality/index.ts:53`) — good; 1 empty-state file.

## 9. observability — ready ≈ 70%

**Front**: best sub-page structure — `alerts/ budget/ dependencies/ freshness/ lineage/ slo/ trust-center/` + ObservabilityCockpit. 6 gates, 4 empty-state files. 44/56 wired; deployment-tracking spine (`/deployments/track/*` incl. approve/reject/execute/rollback) confirmed wired via `services/deployments/index.ts` (TRACK const).
**Top unsurfaced (verified)**
1. `GET /observability/lineage/cross-module` [app/modules/observability/router.py:296] — the cross-module lineage graph (access-patterns is wired; this one is not).
2. `GET /observability/activity/summary` [router.py:349] — in contracts (api-contracts.ts:705) but no component calls it — cockpit KPI header candidate.
3. `GET /observability/cost/warehouse-usage` [router.py:404] — in contracts (:709), unconsumed — budget/ page still lacks its live meter.
4. `GET /observability/probes/changes` [router.py:1153] — change-detection feed for trust-center.
5. `GET|PUT /api/data360/platform-config/{key}` [app/modules/observability/config_router.py:105/142] — runtime config editor (admin-gated backend-side, 16 admin gates in module).
**Role-fit**: approver actions surfaced in deploy-app (uses `?include_approvals_for_me=true`), good; SLO/alert ack should be role-gated in front (only 6 gates for 7 sub-pages).
**Marketplace blockers**: read-heavy → easiest viewer story of all modules; needs alert→notification channel setup UX for standalone ops teams; depends on deployment events from explore-design/workflow for full value (document as "works best with").

## 10. administration — ready ≈ 60% (internal-admin product, not a marketplace listing)

**Front**: `(dashboard)/administration/` (access-center, feature-governance, embedded matrix/config/activity tabs, `?tab=` synced) + `admin/` (api-health, platform-health). 7 gates. 58/82 wired; `/administration/performance/{account}/*` family confirmed wired via `services/admin-performance` + api-contracts.ts:1260.
**Top unsurfaced (verified)**
1. Entire personal-workspace layer: `GET|POST /api/workspace/saved-views` [app/modules/user_workspace/router.py:93/119] (+PATCH/DELETE :142/169), `GET|POST /api/workspace/watchlist` [:252/273], `GET /api/workspace/recently-opened` [:220], `GET /api/workspace/investigation-modes` [:67] — zero consumers; this is cross-module stickiness (saved views on every module), not an admin feature.
2. `GET /api/administration/overview` [app/modules/administration/router.py:224] — one-call admin KPI header.
3. `GET /cache-stream/available-keys` [app/modules/cache/routers/cache_stream.py:233] + `POST /cache-stream/test-invalidation` [:250] — SSE debugging panel for the cache tab.
4. `GET /administration/performance/audit/by-account` [performance_router.py:370] — cross-account perf audit (other perf routes wired; this one not).
5. `GET /cache/keys/{key}` + `DELETE /cache/keys/{key}` [app/modules/cache/routers/cache_management.py:172/190] — key-level cache inspection.
**Role-fit**: admin-only by design (9+18 admin gates); correct.
**Marketplace note**: not sellable standalone; it is the operator console bundled with any module. The user_workspace routes should be *moved conceptually* to every module's UX, not sold here.

---

## Cross-module priority list (top 15, every action maps to an EXISTING endpoint)

| # | Action | Existing endpoint(s) | Why first |
|---|--------|----------------------|-----------|
| 1 | Consume the module-access map to render read-only mode (viewer persona) platform-wide | `GET /gouvernance/d360-roles/my-module-access` [d360_roles.py:735] — 0 UI consumers today | Every module's viewer story; blocks all standalone listings |
| 2 | Fix explore-design savings mismatch (front `/ai/savings-summary` → backend route) | `GET /explore-design/{project_id}/ai/savings` [explore_design/router.py:2111] | Live ROI meter broken; 1-line service fix |
| 3 | Release-safety step in ReleasePanel | `POST /explore-design/{project_id}/full-dry-run` [:1133], `pre-deploy-checks` [:1734], `sql-diff` [:1754] | Flagship module's trust gap |
| 4 | Governance policy families UI (network/password/session) | `GET /gouvernance/policies/network/list` [:1065], `password/list` [:1451], `session/list` [:1595] | Closes historical 405 audit; enterprise checklist items |
| 5 | Account Security & Audit tab | `GET /org-accounts/security-overview` [:1990], `audit/login-history` [:1851], `audit/access-history` [:1779] | Sales-blocking compliance view, read-only |
| 6 | Live AI pricing meter (replace static JSON) | `GET /org-accounts/cortex-costs` [org_accounts/router.py:2165] | Honest per-module pricing for the AI listing |
| 7 | Per-dimension KPI/reco spine on account-overview | `GET /command-center/kpis/{dimension}` [:777], `recommendations/{dimension}` [:983] | Powers the standardized right-bar across modules |
| 8 | Workflow dry-run + server draft | `POST /workflow/dry-run` [:864], `PUT/GET /workflow/{id}/draft` [:1689/1724] | Builder trust + crash-safe editing |
| 9 | Version compare & promote (ED) | `GET /explore-design/versions/{a}/compare/{b}` [lifecycle_router.py:464], `POST versions/{id}/promote` [:490] | Completes the release story |
| 10 | DQ run-history + one-click optimize | `GET /data-quality/run-history` [:455], `POST /data-quality/tables/{db}/{s}/{t}/optimize` [:2076] | Standalone DQ needs an audit trail + act CTA |
| 11 | Reco lifecycle completion + capability gating | `POST /api/recommendations/{id}/dismiss` [:294], `GET /api/recommendations/capabilities` [:161] | Insights layer consistency (InsightActionButton) |
| 12 | Access simulator + permission matrix UI | `GET /api/platform/access-simulator` [platform_core/router.py:474], `permission-matrix` [:738] | Differentiating governance demo |
| 13 | Document AI upload→extract flow | `POST /cortex/ml/document-ai/upload` [:2816], `extract-to-table` [:2869] | The AI module's most demo-able capability |
| 14 | Saved views + watchlist in every module header | `GET|POST /api/workspace/saved-views` [user_workspace/router.py:93/119], `watchlist` [:252/273] | Cross-module retention; zero backend work |
| 15 | Connect lake browser + in-module task pause/resume | `GET /connect/snowflake_lake/databases` [:913] (+schemas/tables :938/:966), `POST /connect/tasks/{name}/suspend|resume` [:847/:820] | Completes Connect standalone; today resume lives only in observability UI |

**Standing marketplace blockers (not endpoint work)**: Oracle password hardcoded in `data-source-connection/page.tsx:941/2596` (rotate + strip — P0 before any listing); Connect has zero empty-state files; `account-overview/pricing-reference.json` dead static file (delete or wire); intelligence-module mutations have no backend role gates (cover via action registry before standalone AI listing); all modules hard-depend on the `/projects` spine + auth/session + cache SSE — package these as the shared "Data360 Core" runtime in any per-module Native App split (per the Terraform/SPCS scaffold).
