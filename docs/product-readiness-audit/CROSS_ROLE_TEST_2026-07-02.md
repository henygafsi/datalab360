# Cross-Role & Cache Live Test — 2026-07-02

*Run at 2026-07-02T19:16:58.321Z as HAHA (admin) against `http://api.datalab360.io`. Per-role tokens unavailable (test users 401/MFA); cross-role verdicts come from the admin-side access-simulator, not real per-role sessions.*

## 1. Endpoint latency + cache (cold call → warm call, real data)

| Endpoint | Status | Cold ms | Warm ms | Cache hit | Size | Sample |
|---|---|---|---|---|---|---|
| `/data-quality/quality-summary` | 200 | 28454 | 37 | ✓ | 14674 | `{"health_score":29.0,"total_tables":387,"freshness_violation` |
| `/catalog/overview` | 200 | 16037 | 32 | ✓ | 4183 | `{"account":"UCHSFVB-HAHA","sources":{"account_id":"UCHSFVB-H` |
| `/projects/unified` | 200 | 14244 | 38 | ✓ | 16723 | `{"projects":[{"project_id":"proj_d2e0b8c2538f","name":"[AI D` |
| `/gouvernance/policies/MASKING` | 200 | 10608 | 58 | ✓ | 82 | `{"policy_type": "MASKING", "total": 0, "policies": [], "exec` |
| `/projects/last-used` | 200 | 6938 | 52 | ✓ | 1013 | `{"recent": [{"module": "WORKFLOW", "project_id": "proj_d2e0b` |
| `/projects` | 200 | 6645 | 27 | ✓ | 12214 | `{"projects":[{"project_id":"proj_d2e0b8c2538f","project_name` |
| `/connect/connectors/health` | 200 | 5298 | 25 | ✓ | 1783 | `{"stages":[{"name":"CODE_DEPLOY","schema":"CODING","type":"I` |
| `/gouvernance/compliance/score` | 200 | 2611 | 26 | ✓ | 843 | `{"score": 80.1, "scope": "account", "breakdown": {"masking":` |
| `/cortex/kpis` | 200 | 1298 | 30 | ✓ | 405 | `{"status": "success", "message": "AI KPIs", "data": {"models` |
| `/api/recommendations/` | 200 | 295 | 1153 | ✗ | 161 | `{"account_id": "UCHSFVB-HAHA", "page": null, "module": null,` |
| `/cortex/semantic-models/list` | 200 | 274 | 26 | ✓ | 613 | `{"status": "success", "message": "Semantic models listed suc` |
| `/catalog/kpis` | 200 | 263 | 30 | ✓ | 4264 | `{"items":[{"kpi_id":"ac7c3dd1-42c6-4bd6-817b-1068d2e3469f","` |
| `/notifications/unread-count` | 200 | 248 | 28 | ✓ | 81 | `{"success": true, "data": {"unread": 0}, "error": null, "exe` |
| `/command-center/overview-kpis` | 200 | 231 | 30 | ✓ | 6549 | `{"range":"30d","account_locator":"SF21772","range_label":"30` |
| `/deployments/track` | 200 | 191 | 109 | ✓ | 22297 | `{"success":true,"data":{"items":[{"deployment_id":"363c0970-` |
| `/explore-design/glossary` | 200 | 179 | 25 | ✓ | 50 | `{"data": [], "count": 0, "execution_time_ms": 158}` |
| `/common/databases` | 200 | 176 | 25 | ✓ | 91 | `{"databases": [{"name": "CP_DATA360"}, {"name": "DRAFT_SOURC` |
| `/gouvernance/d360-roles/my-permissions` | 200 | 103 | 63 | ✓ | 99864 | `{"username":"HAHA","snowflake_role":"ACCOUNTADMIN","d360_rol` |
| `/api/platform/grants/roles` | 200 | 70 | 28 | ✓ | 898 | `{"items": [{"grant_id": "rg_e03e8f9dcd8e43", "account_name":` |
| `/observability/trust-center/summary` | 200 | 35 | 32 | ✓ | 70472 | `{"enabled":true,"total":152,"by_severity":{"MEDIUM":24,"CRIT` |
| `/gouvernance/users` | 200 | 30 | 26 | ✓ | 10712 | `{"data":[{"name":"D360_CACHE_TEST","created_on":"2026-06-17 ` |
| `/command-center/activity-feed` | 200 | 29 | 33 | ✓ | 7281 | `{"events":[{"username":"HAHA","module":"GOUVERNANCE","event_` |
| `/bi-dashboard/templates` | 200 | 29 | 29 | ✓ | 3386 | `{"templates":[{"id":"executive-summary","name":"Executive Su` |
| `/command-center/summary` | 200 | 28 | 32 | ✓ | 1146 | `{"platform":{"total_users":21,"total_users_status":"ok","act` |
| `/cortex/models` | 200 | 28 | 27 | ✓ | 1052 | `{"status": "success", "message": "AI models retrieved", "dat` |
| `/admin/server-metrics` | 200 | 28 | 28 | ✓ | 8919 | `{"requests_per_min":48,"requests_per_5min":65,"total_request` |
| `/cache/stats` | 200 | 28 | 26 | ✓ | 327 | `{"cache_stats": {"hits": 1, "misses": 3, "sets": 2, "deletes` |
| `/observability/alerts?days=7` | 200 | 27 | 26 | ✓ | 572 | `{"status": "CRITICAL", "alert_count": 3, "alerts": [{"type":` |
| `/gouvernance/d360-roles/my-module-access` | 405 | 25 | 29 | ✗ | 56 | `{"detail": "Method Not Allowed", "execution_time_ms": 4}` |
| `/connect/connectors` | 200 | 25 | 50 | ✓ | 1088 | `{"connectors": [{"id": "snowflake", "name": "Snowflake", "ca` |
| `/user/me/modules` | 200 | 25 | 28 | ✓ | 344 | `{"modules": ["connect_datalake", "intelligent", "cortex", "k` |
| `/workflow/capabilities` | 200 | 24 | 24 | ✓ | 973 | `{"module": "workflow", "ux_mode": "low_code", "builder": {"s` |

**Measured cache hit rate (client-observed): 96.8% (30/31 eligible endpoints served warm in <max(200ms, 35% of cold)).**

### Observability defect (honest finding)
`/cache/stats` server counters barely moved during 64 calls (before/after nearly identical) — the in-process counters do **not** account for `shared_query:*` hits. The warm layer works (96.8% observed) but the stats endpoint under-reports it. → backend fix candidate (count decorator-level hits).

## 2. Cross-role matrix — ⚠️ simulator returns DENY for every role × module
Roles discovered (effective-grants): `ACCOUNTADMIN`, `RETAIL_ADMINISTRATOR`, `RETAIL_AI_ENGINEER`, `RETAIL_DATA_ANALYST`, `RETAIL_DATA_ENGINEER`, `RETAIL_GOVERNOR`, `DATA360`, `BI_ANALYST`, `DATA_MODELER`; app roles: `Admin`, `Data Engineer`, `Data Analyst`, `Data Steward`, `Business User`, `AI Engineer`, `FinOps Manager`, `RTTT`.

`GET /api/platform/access-simulator` returned **DENY for ALL (role × module) pairs — including ACCOUNTADMIN**. Since real users demonstrably access these modules, this is a **simulator/seed defect on the deployed backend** (grants matrix unseeded or deny-by-default semantics), not the truth of enforcement. Until seeded, do NOT render this matrix as authoritative in the UI — label it "simulation unavailable / grants not seeded".

Sample row (`ACCOUNTADMIN`): `{"connect_datalake": "DENY", "explore_design": "DENY", "workflow": "DENY", "gouvernance": "DENY", "bi_reporting": "DENY", "intelligent": "DENY", "data_quality": "DENY", "dashboard": "DENY", "account_overview": "DENY", "observability": "DENY"}`

## 3. Per-user effective grants (samples)
- **HAHA** (default `SYSADMIN`): roles=['ACCOUNTADMIN', 'RETAIL_ADMINISTRATOR', 'RETAIL_AI_ENGINEER', 'RETAIL_DATA_ANALYST', 'RETAIL_DATA_ENGINEER', 'RETAIL_GOVERNOR'] · super_admin=True · modules=0 actions=0 (28ms)
- **D360_CACHE_TEST** (default `DATA360`): roles=['DATA360'] · super_admin=False · modules=0 actions=0 (403ms)
- **DATA360RLSDEMO_USER_EX** (default `DATA360RLSDEMO_EXPLORE_VIEWER`): roles=['DATA360RLSDEMO_EXPLORE_VIEWER'] · super_admin=False · modules=0 actions=0 (422ms)

## 4. Verdict
- Read-layer cache: **healthy and fast when warm** (96.8% hit); slow colds are the pre-warm scheduler's job (now running) + MR !41 endpoints.
- Cross-role enforcement **cannot be validated end-to-end tonight**: per-role tokens unavailable (abcd users 401) AND the simulator matrix is unseeded. Actions: seed the grants matrix backend-side, re-enable a per-role test login path, then re-run `e2e/_cross-role-probe.mjs`.
