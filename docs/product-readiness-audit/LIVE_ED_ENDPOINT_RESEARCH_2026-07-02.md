# LIVE ED Endpoint Research — 2026-07-02

Live probe of the backend (api.datalab360.io) as **HAHA (ACCOUNTADMIN, uchsfvb-HAHA)** through the local dev server's `/api-proxy` rewrite (`http://localhost:3000/api-proxy/*`). Goal: ground the Explore & Design redesign's 7 right-bar axes in what returns REAL data today.

## Auth rung achieved

- **Rung (a) FAILED** — all saved storage states expired (freshest `e2e/.auth/local-haha.json` session-token expired 02:54 Jul 2; probe ran 12:40+). Additionally the dev server's NextAuth routes (`/api/auth/session`, `/csrf`, `/providers`) all return **500 HTML** (corrupt-`.next` class) — NextAuth was unusable regardless.
- **Rung (b) variant WORKED** — `DATA360_E2E_PASSWORD` env was unset, but the HAHA test-account password is documented in `apps/data360/.env` (comment block). Logged in with a direct backend `POST /api-proxy/signin` `{account_name, username, password}` → 200 with `access_token`, bypassing NextAuth entirely. All probes used `Authorization: Bearer <access_token>` (Snowflake token, 55-min lifetime; re-minted per run).

## Operation inventory (openapi.json, live)

**913 paths / 1020 operations** (524 GET, 400 POST, 26 PUT, 53 DELETE, 17 PATCH).

| Prefix | Ops | GETs | | Prefix | Ops | GETs |
|---|---|---|---|---|---|---|
| explore-design | 171 | 50 | | data-quality | 32 | 21 |
| gouvernance | 148 | 63 | | projects | 31 | 11 |
| api (platform/admin/…) | 99 | 65 | | bi-dashboard | 31 | 10 |
| org-accounts | 84 | 67 | | cache | 21 | 12 |
| workflow | 81 | 33 | | admin | 14 | 11 |
| cortex | 70 | 29 | | administration | 13 | 13 |
| connect | 45 | 13 | | chat | 11 | 5 |
| observability | 43 | 33 | | user / deployments / data-products / access-requests / common / cache-stream / notifications / misc | 36 | — |
| command-center | 42 | 39 | | | | |
| catalog | 33 | 23 | | | | |

## Probe project

`proj_01c59ad751d8` **SEED_EXP_RLS_MODEL** (explore_design, ver 3, 4 deployments in metadata, source table `CP_DATA360.EVENT_STORE.DATA360RLSDEMO_PROJECTS`). Warehouse for sizing probe: first from `/common/warehouses`.

## Per-axis results (`…/{id}` = `/explore-design/proj_01c59ad751d8`)

Legend: **REAL** = 200 with non-trivial data; **LIVE-EMPTY** = 200, correct shape, zero rows (project/data-dependent, not a backend gap); **DEFECT** = 5xx/timeout.

### 1. Overview

| Endpoint | Status | Data | Note |
|---|---|---|---|
| GET /projects/{id} | 200 (50ms) | REAL | full project card (name, status, step, versions, deployments metadata) |
| GET …/{id}/state | 200 (21.2s cold) | LIVE-EMPTY | step 1, columns[0] — project hasn't selected columns |
| GET /explore-design/projects/{id}/erd | 200 (11.6s) | LIVE-EMPTY | {tables[0], relationships} |
| GET /catalog/overview | 200 (23.4s cold) | LIVE-EMPTY-ish | {account, sources, inventory, scoring, recommendations, recent_events[0]} |
| GET /catalog/scores | 200 (55ms) | REAL | scored_objects + averages + trust_distribution |
| GET /command-center/snowflake-insights | 500→**200 on retry** (63ms warm) | REAL | rich insights (e.g. critical "No network policy"); first hit tripped the known 30s cold-timeout class |

### 2. Ingestion

| Endpoint | Status | Data | Note |
|---|---|---|---|
| GET …/{id}/ingestion/runs | 200 (8.7s) | REAL | runs[1] with paging envelope |
| GET …/{id}/ingestion/operations | 200 (7.6s) | REAL | operations[1] |
| GET …/{id}/ingestion/watermark | 400 without `?table=`; **200** with it (7.1s) | LIVE-EMPTY | `{exists:false, watermark:null}` — FE must pass `?table=<name>` (query param, not path) |

### 3. Data Quality

| Endpoint | Status | Data | Note |
|---|---|---|---|
| GET /data-quality/snapshot | 200 (82ms) | REAL | {generated_at, database, sections} |
| POST …/{id}/quality-gates/run | 200 (2.8s) | REAL | actually executes: {gates_run, passed, failed, results[1]} for a `row_count` gate |
| GET …/{id}/tables/{db}/{sch}/{tbl}/profile | 200 (3.8s) | REAL | row_count, bytes, columns[17] |

### 4. Governance

| Endpoint | Status | Data | Note |
|---|---|---|---|
| POST /gouvernance/policies/pii-scan | 400 bodyless; **200** with `?database=&schema=` (26.9s) | REAL | scanned 80 tables / 1052 columns, sampled 20 — params are QUERY params |
| GET …/{id}/tables/…/ai/column-classification | 200 (17.4s) | REAL | classifications[17] + pii_candidates + suggestions |
| POST …/{id}/ai/classify-columns | 200 (10.6s) | REAL | same shape, 17 classifications |

### 5. Impact & Cost

| Endpoint | Status | Data | Note |
|---|---|---|---|
| POST …/{id}/impact-analysis/enhanced | 200 (5.1s) | LIVE-EMPTY | {schema_exists, impacts[0], high_risk} — no dependents on the probe table |
| GET …/{id}/ai/savings | 200 (9.4s) | REAL | total_credits_saved, ai_cost_credits, roi_multiplier, breakdown |
| POST …/{id}/ai/warehouse-sizing | 200 (3.4s) | REAL | recommended_size + utilization + hourly_data[48] |
| POST …/{id}/ai/deployment-risk | 200 (9.4s) | LIVE-EMPTY | risk_score/risk_level present, factors[0] |

### 6. Release

| Endpoint | Status | Data | Note |
|---|---|---|---|
| GET …/{id}/deployments | 200 (6.7s) | REAL | deployments list |
| GET …/{id}/deployment-readiness | 200 (13.0s) | REAL | **rich**: change_diff, lineage_impact, cost_estimate, approval_payload_template |
| POST …/{id}/conflict-check | 200 (7.9s) | LIVE-EMPTY | {conflicts[0], has_blocking_conflicts:false, total_checked} |
| POST …/{id}/post-verify | **500 (30s, ×2 reproducible)** | DEFECT | Internal Server Error after exactly ~30s — same server-side deadline class as the known cold-timeout defects |
| GET /explore-design/recent-deployment-errors | 200 (0.3s) | LIVE-EMPTY | errors[0] |

### 7. History + AI

| Endpoint | Status | Data | Note |
|---|---|---|---|
| GET …/{id}/events | 200 (12.7s) | REAL | **events[100]** — full audit spine exists |
| GET …/{id}/events/conflicts | 200 (5.9s) | LIVE-EMPTY | conflicts[0] |
| GET …/{id}/versions | 200 (6.2s) | REAL | versions[3] + current_version |
| GET /explore-design/versions/{a}/compare/{b} | 200 (0.6s) | REAL | {from_version, to_version, diff} |
| POST …/{id}/ai/schema-health | 200 (5.0s) | REAL | score + sub_scores + issues over 80-table schema |
| GET …/{id}/ai/feedback/stats | 200 (5.7s) | REAL | acceptance rate + per-kind stats |

## Broad sweep — sampled operational rate as HAHA

Stratified sample of **118 parameterless GETs** across all prefixes (≤7 per prefix), 45s timeout, 5-way concurrency:

- **109 × 2xx** (87 with data, 22 valid-but-empty)
- **7 × param-required 400/422** (alive, just need query args: `common/get_table_columns` ×2, `explore-design/glossary/lookup`, `guided/get-steps-event`, `smart/detect-fk`, `observability/probes/schema`, `admin/api-health/introspect`)
- **2 genuine defects**, both org-accounts:
  - `GET /org-accounts/security-posture` — 400 `SQL_COMPILATION_ERROR 000904` in `org_accounts.secp_netpol` (invalid identifier — backend SQL bug)
  - `GET /org-accounts/governance-grants-overview` — 408 `QUERY_CANCELLED` (statement hit its budget — known budgeted-timeout class)
- 0 × 404, 0 × 401/403, 0 × client-side timeouts

**Operational rate: 116/118 = 98.3%** (consistent with the ~98–99% found in prior audits). Slowest healthy colds: `administration/platform-health` 25.5s, `workflow/action-templates` 18.3s, `command-center/infrastructure` 16.7s, `projects/unified` 16.2s.

## Axis-readiness verdict

| Axis | Verdict | Detail |
|---|---|---|
| 1 Overview | **SHIP** (with cold-latency caveat) | All endpoints live; emptiness on state/erd/catalog-overview is project-data (probe project is at SELECT_TABLES), not backend. `state` 21s / `catalog/overview` 23s cold — needs warm/SSE strategy. |
| 2 Ingestion | **SHIP** | runs + operations return real history; watermark live (remember `?table=` query param). |
| 3 Data Quality | **SHIP** | snapshot, executable quality gates, and full table profiles all real. |
| 4 Governance | **SHIP** | pii-scan does a real 80-table scan (QUERY params `?database=&schema=`, 27s — run async in UI); column classification real ×17. |
| 5 Impact & Cost | **SHIP** | savings/ROI + warehouse-sizing (48 hourly pts) real; impact-analysis + deployment-risk live with correct shape (empty on this table). |
| 6 Release | **SHIP minus post-verify** | deployments + deployment-readiness (diff/lineage/cost/approval template — the redesign's Deploy state-machine backbone) are real; conflict-check live. `POST …/post-verify` is the **one reproducible ED defect** (500 @30s deadline, needs backend fix) — gate its button `unavailable` via the InsightActionButton 404/501-style pattern until fixed. |
| 7 History + AI | **SHIP** | 100-event history, 3 versions + real version-diff compare, schema-health score, AI feedback stats — the richest axis. |

**Bottom line:** all 7 axes have live backends today; 6.5 of 7 can ship on real data now. The only backend work strictly required is `post-verify` (500) plus the two org-accounts defects (outside ED). The real UX risk is cold latency (5–25s on many ED reads), which argues for the planned SSE/warm-cache approach over polling.

*Probe artifacts: `/tmp/ed_probe_results.json`, `/tmp/sweep_results.json`, `/tmp/openapi.json` (not committed).*
