# Henry — Backend Capability Delegation (Alice — 2026-06-08)

> **Scope shift from prior delegations.** Path coverage is 100% and method-level is
> tracked elsewhere. This audit asks a different question: *where does the UI/spec PROMISE
> a capability that the backend cannot truly deliver yet?* — and where Snowpark Python
> (stored procs / UDFs) or deeper governance unlocks real value.
>
> **Honesty headline (learned from the 27→1 correction):** I did NOT force five equal
> gaps. Grounded against live backend code, the reality is **2 genuine capability deltas
> (A, D) + 1 small wiring task (B) + 2 areas that are largely/fully DONE (C, E) with only
> optional enhancements.** Each block below leads with *what already exists*, then the
> narrow delta. Do not read this as "5 missing features."

## Global KPIs

| KPI | Value |
|-----|-------|
| capability_gaps_found | 2 genuine (A per-object cost, D governance simulation) + 1 wiring (B) |
| areas_already_covered | 2 (C anomaly ML shipped, E semantic-model gen shipped) |
| snowpark_opportunities | 3 — all NET-NEW infra (no existing Python sproc/UDF pattern to reuse) |
| snowpark_required (vs nice-to-have) | 0 required · 3 optional enhancements |
| gov_enrichments | 3 (RLS who-can-see sim, masking impact preview, least-privilege rec) |
| fastapi_routes_proposed | 6 (1 cost-sim, 1 dry-run wiring + 1 temp-tables helper, 3 governance, 0 for C/E) |
| areas_audited | A–E (cost prevision, workflow validation, anomaly ML, governance depth, modeling) |

## Snowpark reality check (read before any "Snowpark" task)

The only thing called "Snowpark" in this backend is **Snowpark Container Services**
(`intelligence/cortex/snowpark_services.py` = compute-pools / SPCS / Streamlit) plus a
single `from snowflake.snowpark import Session` string inside a workflow template
(`workflow/services.py:3087`). **There is NO established Python stored-proc / UDF pattern
to reuse.** Every Snowpark-Python proposal below is therefore net-new infra: a
Snowpark-enabled warehouse, package allow-listing (`PACKAGES`), and anaconda
provisioning. Treat all three as *optional enhancements*, not blockers — the SQL/Cortex
paths already deliver the promised capability. Flagged per task as `[SNOWPARK: net-new]`.

---

## A — Per-object / per-project cost prevision  ·  PRIORITY 1 (the differentiator)

**Promise source:** roadmap-verified Phase 3 — `GET /finops/cost-simulation/{object}?days=30`,
"test along 30 days before pay". Surfaced by the InsightActionButton `cost:` annotation
made clickable.

**What EXISTS today (verified):**
- `GET /org-accounts/credit-forecast?days_back=N` (`org_accounts/router.py:1784`) —
  already does a **30-day projection via linear regression** over
  `SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY`, returns
  `{daily_avg, trend_direction, slope_per_day, projected_30d_total, budget_at_risk, history, forecast}`.
  FE contract: `API.accountOverview.creditForecast` (api-contracts.ts:579).
- `_wizard_cost_estimate(entry, rows, cursor)` (`connectors/router.py:3635`) — per-action
  credit estimate from a cost-model formula + a live 7-day `AVG(CREDITS_USED)` baseline
  from `WAREHOUSE_METERING_HISTORY`, returns `{est_credits_low, est_credits_high, basis, live_baseline_avg_credits}`.
- Per-service spend by `SERVICE_TYPE` (`finops_router._service_spend`, mounts under `/org-accounts`).

**The TRUE gap:** both existing pieces are **account-wide** (forecast) or **one-shot
heuristic** (wizard estimate). Neither scopes a 30-day projection to a SPECIFIC object
or project, which is exactly what the "preview before you commit this pipeline/clone/
fine-tune" UX promises. There is no per-object attribution baseline.

**Henry task A:**
- **Method + path:** `GET /org-accounts/cost-simulation/{object_type}/{object_id}?days=30`
  **DECISION (resolves the spec/reality conflict):** the roadmap + task both name
  `/finops/cost-simulation/...`, but **there is no `/finops` router** — `finops_router`
  mounts under `prefix="/org-accounts"` (`finops_router.py:35`), and the only existing
  cost contract entry (`creditForecast`) already lives under `/org-accounts`. Register the
  new route in `org_accounts/finops_router.py` so it inherits that module gate and sits
  beside `credit-forecast`. Add a fresh `api-contracts.ts` entry
  (`API.accountOverview.costSimulation`) — a new entry is needed regardless of prefix.
- **Technique:** pure SQL. Baseline from
  `SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY` (per-warehouse/per-query credit
  attribution — already used in `catalog/services/rightbar.py`, `workflow/services.py`)
  joined to the object's recent queries; OR per-warehouse
  `WAREHOUSE_METERING_HISTORY` filtered to the warehouse the object runs on. Apply the
  **same linear-regression projection** as `credit-forecast` to the object-scoped daily
  series, plus low/high bands from `_wizard_cost_estimate`'s formula for objects with no
  history yet (new pipeline = no baseline → fall back to formula band, never a bare 0).
- **Reuse:** copy the regression block from `get_credit_forecast` (router.py:1818-1835);
  copy the band + `basis` discipline from `_wizard_cost_estimate`; reuse
  `QUERY_ATTRIBUTION_HISTORY` query shape from `catalog/services/rightbar.py`.
- **Response shape:**
  ```json
  {"object_type":"workflow","object_id":"...","days":30,"method":"linear_regression|formula_band",
   "basis":"<human string, always present>","daily_avg":..,"projected_total":..,
   "band":{"low":..,"high":..},"budget_at_risk":bool,"history":[{date,credits}],"forecast":[..]}
  ```
- **Cost/risk:** `QUERY_ATTRIBUTION_HISTORY` has ACCOUNT_USAGE latency (≈45 min–3 h) and
  requires the role to hold the IMPORTED PRIVILEGES grant on `SNOWFLAKE` DB. Degrade per
  field to null + `method:"formula_band"` when the view is ungranted — never 500, never a
  fake 0 (matches the no-static-placeholders rule).
- **Verify on live wh:** does the connecting role have `SELECT` on
  `SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY` (and is data non-empty for the test
  object)? If not, confirm the formula-band fallback path returns a populated `basis`.

---

## B — Workflow validation strategy actually materializes  ·  PRIORITY 2 (small, high leverage)

**Promise source:** shipped FE — `WorkflowSmartPanel` submit selector
**clone (prod) / temp-tables (pipeline)**; event `workflow_validation_submitted`.
`POST /workflow/{id}/dry-run {mode: standard|clone|temp_tables}`.

**What EXISTS today (verified):**
- `POST /workflow/{id}/dry-run` (`workflow/router.py:765`) **accepts and validates `mode`**
  but the handler docstring is explicit: *"Both compile+validate identically here; `mode`
  is recorded so the deploy path can honor the chosen strategy."* → `workflow_dry_run`
  (services.py:3713) only compiles + validates, **no materialization**.
- **`run_workflow_clone_data_tests` ALREADY does the full clone path** (services.py:3972):
  `CREATE SCHEMA ... CLONE` (zero-copy) per touched (db,schema), runs the compiled SQL
  rewritten to the clone, row-count diffs each block, `DROP` every clone in `finally`
  (idempotent, never leaves a clone behind). Exposed as `GET /workflow/{id}/clone-data-tests`
  (FE contract `API.workflow.cloneDataTests`, api-contracts.ts:239).

**The TRUE gap:** `mode=clone` is recorded but **does not dispatch** to the clone engine
that already exists, and there is **no `temp_tables` materialization path** at all. So the
prod-vs-pipeline selector the user clicks is cosmetic.

**Henry task B (two small pieces):**
- **B1 — wire clone:** in `api_workflow_dry_run` (router.py:765), when `mode=="clone"`,
  call the existing `run_workflow_clone_data_tests(cursor, workflow_id, username)` and
  merge its per-block `{rows_in, rows_out, diff, status}` into the dry-run response under a
  `materialized_validation` key. Zero new SQL — pure dispatch. **Reuse:** the function is
  already imported in router.py (line 63).
- **B2 — temp_tables path:** add `run_workflow_temp_table_tests(cursor, project_id, username)`
  in `workflow/services.py` mirroring `run_workflow_clone_data_tests` but using
  `CREATE TEMP TABLE <clone> AS SELECT * FROM <source> LIMIT <sample>` for **source-pipeline
  sampling** (cheap, session-scoped, auto-dropped on session close) instead of
  `CREATE SCHEMA ... CLONE`. Rewrite the compiled SQL onto the temp tables, run, diff,
  rely on session teardown + an explicit `DROP TABLE` in `finally`.
  **Reuse:** copy the object-collection (`_collect_workflow_objects`), SQL-rewrite, and
  diff scaffolding from `run_workflow_clone_data_tests` (services.py:3991-4031) verbatim;
  swap the DDL.
- **Technique:** SQL only (`CREATE TABLE ... CLONE` zero-copy / `CREATE TEMP TABLE ... AS`).
  No Snowpark.
- **Response shape:** existing dry-run body + `"materialized_validation": {"mode":"clone|temp_tables","blocks":[{block,type,rows_in,rows_out,diff,status}],"teardown":"ok"}`.
- **Cost/risk:** clone is zero-copy (storage-only until divergence) — cheap; temp-table
  sampling spends compute on the `LIMIT` scan. Both must guarantee teardown — the clone
  path already proves the `finally`-drop pattern. Risk: a workflow that targets prod tables
  must NEVER run un-cloned — gate B1 so clone is the only mode that touches real schemas.
- **Verify on live wh:** run B1 on a 2-block workflow → confirm the clone schema appears
  during the run and is **gone** after (`SHOW SCHEMAS LIKE '%_WF_CLONETEST_%'` returns
  empty). For B2 confirm temp tables don't survive the session.

---

## C — DQ anomaly detection  ·  ALREADY DONE (optional Snowpark enhancement only)

**Promise source:** `POST /data-quality/anomaly-detection` (DQ SmartRightBar anomalies).

**What EXISTS today (verified):** **fully implemented** (`data_quality/router.py:2210`).
Creates a `(TS, Y)` training view, `CREATE SNOWFLAKE.ML.ANOMALY_DETECTION IF NOT EXISTS`,
then `CALL ...!DETECT_ANOMALIES`, returns flagged rows, logs the event, degrades a
privilege error to honest 403. `GET` listing of configured detectors also exists
(router.py:2169). **This is NOT a gap.**

**Optional enhancement (only if a real customer need emerges):**
- **Method + path:** `POST /data-quality/anomaly-detection/custom-score`
- **Technique:** `[SNOWPARK: net-new]` Python UDF for **custom scoring** where
  `SNOWFLAKE.ML.ANOMALY_DETECTION` is too rigid — e.g. multivariate / domain-rule scoring
  (z-score over grouped partitions, seasonal-hybrid ESD, business thresholds) that the
  built-in single-series model can't express.
- **Honest note:** built-in ML already ships and needs no Snowpark warehouse. A custom UDF
  buys flexibility at the cost of standing up Snowpark infra. **Do NOT prioritize** unless
  a customer hits a concrete limitation of the built-in detector. Low value/effort ratio.
- **Verify on live wh:** the existing route's runtime shape on a live warehouse is already
  an open STATUS P1 ("ML routes not tested runtime") — that verification covers C.

---

## D — Governance depth: simulation & least-privilege  ·  PRIORITY 1 (the meatiest real gap)

**Promise source:** governance module promises "who can see what" + safe policy changes;
roadmap Phase 1 CRUD matrix lists policies but not *impact preview / simulation*.

**What EXISTS today (verified):**
- Full masking + row-access (RLS) + aggregation policy **CRUD + apply/remove/replace**
  (`gouvernance/routers/governance_policies.py`), unified policy list, `POLICY_REFERENCES`
  to list objects a policy touches (`_policy_references`, line 343), pre-delete dependency
  check (line 1686).
- PII intelligence with **masking-policy DDL suggestions + recommended_action**
  (`pii_intelligence.py`) and compliance-framework impact counts.
- A **D360 RBAC effective-access tester** (`d360_roles.py:635`) — but this resolves the
  **app's GUI permission matrix** (module/page/tab/action), NOT Snowflake grants or RLS row
  visibility.
- `ACCESS_HISTORY` read (`services.py:880`) and `GRANTS_TO_USERS/GRANTS_TO_ROLES` are
  *queried for display* but with explicit `TODO` markers and no recommendation logic
  (gouvernance.py:1923, 2493).

**The TRUE gaps (3, none currently exist):**

**D1 — RLS "who can see which rows" simulation.** `[PRIORITY 1a]`
- **Method + path:** `POST /gouvernance/policies/row-access/simulate`
  `{database, schema, table, role, sample_rows?}`
- **Technique:** SQL. Build the policy's predicate from `DESCRIBE ROW ACCESS POLICY` +
  `POLICY_REFERENCES`, then run the table's rows through the predicate **as the target
  role's mapping table** (the policy body references a mapping/entitlement table) and return
  `{visible_count, hidden_count, sample_visible[], sample_hidden[]}` for a sampled set.
  Read-only — no policy applied. Reuse `_policy_references` + the RLS describe path already
  in `governance_policies.py`.
- **Honest note:** exact predicate replay depends on the policy body shape (mapping-table
  vs inline). Where the body can't be safely re-evaluated, degrade to "predicate shown,
  row-level sim unavailable for this policy type" — never guess visibility.

**D2 — Masking impact preview before apply.** `[PRIORITY 1b]`
- **Method + path:** `POST /gouvernance/policies/masking/preview`
  `{database, schema, table, column, policy_name, role}`
- **Technique:** SQL. `SELECT` a sample of the column **and** the masked expression
  (apply the policy's `RETURNS` body inline as a `CASE`/expression over the sample, NOT by
  altering the column) → return `{before_sample[], after_sample[], roles_affected, rows_estimated}`.
  Reuse the masking-policy body builder in `services.py` (`_MASKING_DATA_TYPES`,
  `_validate_masking_data_type`) to render the same expression the real policy would use.
- **Honest note:** preview is a *best-effort render* of the policy expression, labeled as
  such; the authoritative effect is what Snowflake applies. Make `basis` explicit.

**D3 — Least-privilege recommendation.** `[PRIORITY 2]`
- **Method + path:** `GET /gouvernance/roles/{role}/least-privilege`
- **Technique:** SQL. Diff **granted** privileges (`SNOWFLAKE.ACCOUNT_USAGE.GRANTS_TO_ROLES`)
  against **used** privileges/objects (`SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY` over N days)
  → list grants never exercised in the window with a `REVOKE` suggestion (suggested only,
  never auto-executed). Reuse the existing `ACCESS_HISTORY` query (`services.py:880`) and
  the `GRANTS_TO_ROLES` read flagged at gouvernance.py:2493.
- **Honest note:** "unused in N days" ≠ "safe to revoke" (quarterly jobs, break-glass
  roles). Return as advisory with a confidence/`last_used` field; never a one-click revoke.
- **`[SNOWPARK: optional]`** the diff is plain SQL; a Snowpark proc would only help if you
  want to schedule it as a recurring task — not needed for the on-demand endpoint.

- **Verify on live wh (covers D1-D3):** does the role hold IMPORTED PRIVILEGES on
  `SNOWFLAKE` (needed for ACCOUNT_USAGE) and `APPLY`/ownership context to `DESCRIBE` the
  policy bodies? Confirm `ACCESS_HISTORY` is populated for the account (it's Enterprise+).

---

## E — Modeling intelligence  ·  LARGELY DONE (verify, don't rebuild)

**Promise source:** explore-design / intelligent — semantic model generation, relationship
inference, DDL recommendation.

**What EXISTS today (verified):**
- **Semantic model auto-generate from DDL:** `POST /cortex/semantic-models/generate` and
  `POST /cortex/semantic-models/generate-and-save` (`cortex/router.py:1765, 1931`) — builds
  the Cortex Analyst YAML (tables → dimensions/time_dimensions/facts) and saves to the
  semantic stage. Semantic-model CRUD also present (list/get/create/update/delete).
- **Relationship inference:** `_detect_relationships` (router.py:1669) uses
  `SHOW IMPORTED KEYS` (real FK metadata) **and** column-name heuristics. A second,
  richer path `discover_relationships` (`explore_design/ai_services.py:263`) uses **Cortex
  embeddings + cosine similarity** over column names.
- **Column classification + table-column suggestion + naming-convention check + schema-health**
  all exist in `explore_design/ai_services.py` (Cortex-backed with heuristic fallback).
- **Cortex Analyst NL→SQL:** `POST /cortex/analyst/query` IS implemented (vague H5) —
  decorator confirmed at `cortex/router.py:1287`
  (`@cortex_router.post("/analyst/query", ...)`), driving off the semantic model on the stage.

**STALE-contract flag (FE cleanup, not backend):** `api-contracts.ts:371` still tags
`analystQuery` as `// TODO(henry-P1): no backend route ... Analyst API not exposed.` —
**this comment is now false** (route confirmed at `cortex/router.py:1287`). Drop the TODO
so the FE consumer (intelligent) stops self-disabling a live capability.

**The only residual deltas (low priority):**
- **DDL *recommendation*** (proactive "you should add this index/cluster key/PK") is NOT a
  first-class endpoint — today it's column suggestions + schema-health issues, not concrete
  DDL the user can one-click apply. *If* wanted: `POST /explore-design/{project}/ddl-recommendations`
  returning `{recommendation, rationale, ddl_sql, est_cost}` built from schema-health +
  `_wizard_cost_estimate`. **Low value vs effort — defer unless asked.**
- **`[SNOWPARK: optional]`** embedding-based relationship discovery could move to a Snowpark
  Python UDF for batch FK inference across large schemas, but the Cortex-embeddings path
  already works. Not worth the infra.
- **Verify on live wh:** Cortex Analyst response shape on a live warehouse is already an
  open STATUS P1 — that single check discharges E's runtime risk.

---

## Recommended order (value / effort)

1. **B1 — wire `mode=clone` to the existing clone engine.** Hours, zero new SQL, makes a
   shipped UI selector real. Highest leverage.
2. **A — `/cost-simulation/{object}` per-object 30-day prevision.** The roadmap Phase 3
   differentiator; reuses two existing patterns; pure SQL.
3. **D1 + D2 — RLS who-can-see + masking preview.** Genuine governance capability gap, pure
   SQL, high trust value (safe-change preview).
4. **B2 — temp_tables materialization path.** Copies B1 scaffolding.
5. **D3 — least-privilege recommendation.** Advisory, ACCESS_HISTORY-driven.
6. **E FE cleanup** — drop the stale `analystQuery` TODO (5 min, not Henry-backend).
7. **C / E Snowpark enhancements — DEFER.** Built-ins already deliver; net-new infra.

**Snowpark-enabled warehouse needed for:** none of the priority tasks. Only the deferred
C-custom-UDF and E-batch-embedding enhancements — flag both as out of scope until a
concrete customer limitation appears.

---

## Verification protocol (how Henry proves each)

For **every** task, in order:
1. **Static:** `python3 -c "from app.main import app"` (route registers, no import error) +
   `python3 -m py_compile <changed files>`.
2. **Path/method:** confirm the new route appears in the manifest with the intended verb;
   add/adjust the FE `api-contracts.ts` entry under `API.*` (no literal strings).
3. **Exactly ONE live-warehouse check per route** (the only thing code can't prove):

| Task | The one live check |
|------|--------------------|
| A | Role has `SELECT` on `SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY`; if not, formula-band fallback returns a populated `basis` (no bare 0). |
| B1 | Run on a 2-block workflow → clone schema present during run, **absent after** (`SHOW SCHEMAS LIKE '%_WF_CLONETEST_%'` empty). |
| B2 | Temp tables do not survive session close; `materialized_validation.blocks` populated. |
| D1 | Can `DESCRIBE ROW ACCESS POLICY` + read its mapping table as the target role; predicate-replay returns visible/hidden counts (else degraded label). |
| D2 | Masked-expression render matches `DESCRIBE MASKING POLICY` body on a sample; column itself unchanged. |
| D3 | `GRANTS_TO_ROLES` ∖ `ACCESS_HISTORY` diff is non-empty and `last_used` is set per grant; requires populated ACCESS_HISTORY (Enterprise+). |
| C | (covers existing route) `CALL ...!DETECT_ANOMALIES` returns rows on a real (TS,Y) series — already STATUS P1. |
| E | Cortex Analyst response shape on live wh — already STATUS P1. |

**Degradation contract (all tasks):** any ACCOUNT_USAGE ungranted / privilege error →
per-field `null` + an honest `basis`/`note`, HTTP 200 or honest 403, **never** a 500 and
**never** a fabricated 0 (no-static-placeholders rule). Backend changes stay LOCAL —
no commit/push without an explicit go.
