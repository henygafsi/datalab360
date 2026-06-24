# Live Audit — deployed backend (api.datalab360.io) — 2026-06-22

Dev front (`:3000`) repointed at the **deployed** backend via `NEXT_PUBLIC_API_URL` + `API_PROXY_UPSTREAM=http://api.datalab360.io`. Real auth as HAHA/ACCOUNTADMIN. Sweep: `e2e/ux-audit/net404.mjs` + direct backend probes.

## HEADLINE (backend/infra — NOT an FE bug, NOT FE-fixable)
**The deployed backend's service-account (SVC) connection to Snowflake is failing.** Every SVC-cache-dependent endpoint returns:
```
503  {"errorCode":"CACHE_NOT_READY","reason":"svc_connect_failed","account":"HAHA"}
```
~35 endpoints affected (command-center/*, gouvernance/*, observability/*, data-quality/*, org-accounts/*, cortex/semantic-models, catalog/scores, notifications/unread-count, deployments/track). This is the **same SVC-provisioning class of issue as local**, now on the deployed env — the deployed backend needs its SVC role/credentials + grants configured so the warmer can connect. **Owner: backend/infra.** Until fixed, those pages can only show a degraded/"warming" state in real.

## What WORKS in real (user-connection endpoints, no SVC cache)
- `GET /projects` → 200 (cold 8.4s → warm 41ms)
- `GET /data-products` → 200 (42–104ms)
- Explore & Design project/canvas/data-product endpoints use the user connection → **fully usable + testable now.**

## Proxy gotcha fixed (FE/dev config — was masking everything)
First sweep showed ALL endpoints 500 `ECONNREFUSED 127.0.0.1:8000`. Cause: `.env.local` sets `API_PROXY_UPSTREAM=http://127.0.0.1:8000` and the Next rewrite uses *that* var (not `NEXT_PUBLIC_API_URL`). Overriding only `NEXT_PUBLIC_API_URL` fixed SSR/login but not the client proxy. Fix for live testing: start dev with **both** `NEXT_PUBLIC_API_URL` and `API_PROXY_UPSTREAM` = `http://api.datalab360.io`. (No file mutation — shell env wins over `.env.local`.)

## FE-attributable findings
| Sev | Finding | Detail |
|---|---|---|
| Med | `GET /access-requests/all` + `/access-requests/inbox` → **404** on deployed backend | Access-center inbox calls routes absent on deployed backend (contract drift / deploy-lag). Verify route names vs deployed backend; the inbox should 404-self-disable, not error. |
| Low | `/governance/network-policies` page → 404 | Route in the probe list isn't a real page (or removed). Cosmetic. |
| ✓ | **V4b validation:** zero NEW 404s on workflow/chat/intelligent | The ~50 path sites I migrated to `API.*` show 503 (SVC cache), not 404 → no bad `API.*` keys introduced. Good. |

## Diff validation status
- FE compile-gate: GREEN (tsc 0, build ✓ 74/74) — established earlier.
- Live API validation: V4b path rewiring produced **no new 404s** (confirmed). V2 invalidation (access-requests) sits on a backend route that 404s on deployed — invalidation logic is fine but the inbox data path needs the backend route deployed.
- Cannot reach "zero-FE-defect green probe" while the deployed SVC cache is down (most data endpoints 503 for backend reasons).

## Recommendation
1. **Backend/infra:** fix the deployed SVC→Snowflake connection (CACHE_NOT_READY). This unblocks the broad "all pages green" audit.
2. **FE (doable now):** verify all SVC-cache pages render the 503 as a clean "data warming / temporarily unavailable" state (not blank/`[object Object]`/crash). api-client already maps 503; confirm per-page.
3. **Build now (works in real):** Explore & Design sources-vs-products UX (projects + data-products endpoints are live).
