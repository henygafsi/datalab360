# Backend Output Defect Fix-List — 2026-06-22

Static read-only scan of `/Users/datalab360/Documents/data360_pro/backend` (FastAPI/Snowflake/Python).
Backend was NOT running; nothing executed/edited. Apply + validate once the backend is up on `:8000` (USER relaunch — never bare-restart).

**Summary:** 10 concrete output defects across governance, data-quality, catalog, intelligence, command-center, connectors. Most severe: an N+1 SHOW-GRANTS loop (up to 500 round-trips per policy-list call) and data-quality checks that silently embed Snowflake errors inside 200 responses.

| Pri | Endpoint / Route | Category | Root Cause | File:Line |
|---|---|---|---|---|
| P0 | `GET /gouvernance/policies/{type}` | slow / defect | `list_policies_by_type` runs `SHOW GRANTS TO ROLE` in a Python loop per role (cap 500 = up to 500 Snowflake round-trips). | `modules/gouvernance/routers/gouvernance.py:2856-2877` |
| P0 | `POST /data-quality/run-check` (+ multi-column helpers) | error-swallowed | Per-column failures return `{"status":"ERROR","error":str(e)}` inside a **200 OK** array — not an HTTPException. FE sees 200 and discards the error. | `modules/data_quality/router.py:193-199,227-233,271-276,305-311,326-331,355-361` |
| P1 | `GET /catalog/objects/{id}` (object-360) | error-swallowed | Soft-fail blocks embed `{"error": str(exc)[:200]}` inside the 200 payload → FE renders `[object Object]`. | `modules/catalog/services/object_360.py:78,115,166` · `scores.py:97,122,226` · `overview.py:50` |
| P1 | `GET /command-center/summary` (+ `_batch_scalars` users) | fabricated-0 | `_batch_scalars` maps a Snowflake NULL row to `0`. Unprovisioned KPI returns `0` not `None` — violates no-fabricate-0 rule. | `modules/command_center/services.py:121,134` |
| P1 | `POST /intelligence/ml/classification/train` (+6 ML siblings) | unstructured-error | `raise HTTPException(422, detail=str(e))` — plain string bypasses `make_error_detail`; FE `toServiceError` gets no `error_code`. | `modules/intelligence/cortex/router.py:2923,2998,3038,3110,3144,3180,3228` |
| P1 | `GET/POST /connect/connectors/{id}` test/sync | 501 / FE-gap | Routes in FE `api-contracts.ts:67-71` (TODO "not in backend"); backend 404. Buttons exist in Connect UI. | FE `api-contracts.ts:63-71` |
| P2 | `PATCH/POST /connect/connectors/{id}` (Databricks) | 501 | `detail="...not installed"` plain string, not `make_error_detail`; 501 not mapped gracefully by FE. | `modules/connectors/router.py:2389,2405,2422,2440,2456,2559,2574,2591,2607` |
| P2 | `governance_policies.py` mutations (create/apply/remove/replace/set-default) | privilege-500 risk | Write paths use deprecated `get_snowflake_connection_for_user` not `get_write_connection`; stale conn → 252006 "Cursor is closed" surfaces as 500. | `modules/gouvernance/routers/governance_policies.py:633,692,725,762,824,888,922,959,1036,1085,1114,1181,1248,1283,1315,1393` |
| P2 | `POST /projects/data-products` (split-FQN) | unstructured-error | `raise HTTPException(422, detail=str(e))` — no `error_code`. | `modules/projects/data_products.py:134` |
| P2 | `GET /cache/management/…` warmer (`CACHE_WARM_BORROW_USER_CONN=1`) | cursor-race | Warmer aliases a live user cursor; concurrent requests race → 252006. Off by default in prod. | `core/connection_manager.py:640-650` · `modules/command_center/cache_warming_service.py:478` |

## Validate-once-backend-up checklist
1. **N+1 governance:** `GET /gouvernance/policies/MASKING` on an account with >50 roles → response < 3 s, no 408.
2. **Error-swallowed DQ:** `POST /data-quality/run-check` with a bad column name → must be a `4xx` HTTPException, not a 200 with `{"status":"ERROR"}` rows.
3. **Fabricated-0 KPIs:** `GET /command-center/summary` on an account with no history → unprovisioned KPI is `null`, not `0`.

## Notes / scope
- All backend edits stay LOCAL; deploy needs explicit go.
- P0/P1 items are the ones that produce visibly-wrong UX outputs (silent errors, `[object Object]`, fake zeros).
- The `governance_policies.py` write-conn migration is the safe fix for the recurring 252006 race seen in dev.
