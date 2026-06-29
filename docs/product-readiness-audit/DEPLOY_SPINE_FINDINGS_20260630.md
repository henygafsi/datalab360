# Deploy spine + endpoint-green findings — 2026-06-30

Context: the deploy-step screenshots showed "0 deployment" and the request was to
make the source→model→deploy→DDL→dry-run→frequency→submit-for-approval→activation
flow **real and testable**, drive endpoints + governance invalidation to green,
and e2e-test source-based projects.

## 1. The deploy spine is REAL — "0 deployment" was a UI/usage gap, not a broken backend

Proven directly against the live backend (`localhost:8000`, HAHA/ACCOUNTADMIN):

| Leg | Result |
|---|---|
| `addDDLAction` (CREATE TABLE) | 200, `event_id` returned |
| `executeDDLActions` | `executed:1 failed:0 SUCCESS` (real ~3.3s warehouse round-trip) |
| `tablePreview` of the new table | 200, columns present → **table physically exists** |
| cleanup `DROP TABLE` | executed:1 |

So the backend genuinely creates a real DWH table. The screenshot's "0 Affected
Tables / 0 DDL Operations" is because the wizard was opened on an **existing**
source table with **no staged modeling change** — there was nothing to deploy,
and the e2e never clicked **Deploy Now** (it is view-only). The mechanism to
stage a destination is present: a `TABLE_CREATED` event → `CREATE TABLE IF NOT
EXISTS` DDL (deployment-utils) via the canvas / CreateTableModal.

## 2. REAL BUG FIXED — scheduled ingestion was broken end-to-end

`POST /explore-design/{id}/ingestion/schedule` requires (per backend OpenAPI):
`source_database, source_schema, source_table, target_database, target_schema,
target_table, ingestion_mode, cron_choice` — one table per request.

The frontend `scheduleIngestion` sent only `{cron_choice, custom_cron, warehouse,
mappings, config}` and passed the **UI cron enum** (`EVERY_HOUR/DAILY/...`) where
the backend wants **lowercase** (`hourly/daily/weekly/monthly/custom`).
`EVERY_6_HOURS` had no backend equivalent. ⇒ every scheduled deploy 400/422'd.

**Fix** (commit `47b36d9`):
- `toBackendCronChoice()` mapper (deployment-utils) — incl. 6h→`custom 0 */6 * * *`.
- `IngestionScheduleRequest` extended with the required source/target/mode fields.
- `StepDeploy` now schedules **per table** with the correct shape.
- Proven green by `e2e/_flow_dwh_real_deploy.mjs` (7/0): create→execute→verify→
  **schedule (task INGESTION_… created)**→invalidate→cleanup.

Sibling enums audited and OK: `ingestion_mode` already lowercase; `ddl_type`
matches exactly. (Minor: `inferDDLType` labels `TABLE_RENAMED`→`DROP_TABLE`, but
the emitted SQL is a correct `ALTER … RENAME`, so it's a metadata label quirk,
not destructive.)

## 3. Endpoint green baseline (real projects, real params)

`e2e/_sweep_real_endpoints.mjs` — 32 real projects, swept 5 + governance/admin:
**19 green · 1 gated(correct) · 0 defect → 100% reachable, 95% true-green.**
The one "gate" is `cache/warm-status` (warmer is prod-only, expected).
Governance cache invalidation (`POST /admin/cache/invalidate-surface`, account+
page+module) returns `{status:"invalidated"}` — real eviction works.

## 4. Gate chain — partial backend support

User ask: "submit for approve to activate schedule/ingestion **after payment +
validation of modeler in account overview**."
- **Modeler validation: REAL.** Deployment approval exists
  (`POST /explore-design/{id}/deployments/{depId}/approve`), and `StepDeploy`'s
  `with_approval` path already submits + sets `pending_approval`. Account-overview
  is an access-requests pending inbox (`/access-requests/{id}/approve`).
- **Payment gate: NO backend.** No subscription/entitlement endpoint exists in
  the API contracts. A payment gate cannot be wired truthfully without backend
  support — flagged rather than faked.

## Durable artifacts
- `e2e/_flow_dwh_real_deploy.mjs` — real vertical, asserts green, self-cleaning.
- `e2e/_sweep_real_endpoints.mjs` — multi-project true-green sweep.
- Build: `pnpm iso:build` green. Commits `47b36d9`, + sweep — local only (no push).
