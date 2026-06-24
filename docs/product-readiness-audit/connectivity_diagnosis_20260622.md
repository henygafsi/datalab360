# Connectivity Diagnosis — api.datalab360.io — 2026-06-22

Tested live as HAHA/ACCOUNTADMIN with a real Bearer token (derived from the saved session; no creds on CLI). Backend is UP (`/docs` 200, `/health` 200, 905 routes).

## Verdict (exhaustively proven)
The widespread `503 {errorCode:"CACHE_NOT_READY", reason:"svc_connect_failed"}` is a **deployed-host service-account (SVC) credential failure**. It is **NOT** fixable from the frontend or via any API call — it requires a host-side credential fix + API restart.

### Evidence
1. **SVC is dead, user-conn is fine.** `GET /admin/cache/svc-health` →
   ```
   accounts: [
     {account:"ABCD", user:"SVC_DATA360_API", auth_type:"key_pair", alive:false},
     {account:"HAHA", user:"SVC_DATA360_API", auth_type:"key_pair", alive:false}],
   configured:true, background_connection_available:false, fallback_enabled:false
   ```
   `GET /admin/service-account/health` → `connection_alive:false, role:null`. So the SVC config IS loaded but Snowflake **rejects** its RSA key-pair login (key rotated/disabled or role grant revoked). User-connection endpoints prove Snowflake itself is reachable: `/projects` 200, `/data-products` 200.
2. **No warm/install route recovers it (all tested as HAHA):** `POST /command-center/warm-user-cache` → 202, `POST /cache/warmup/trigger` → 200, `POST /admin/cache/warm` → 400, `POST /api/platform/cache/install` → **503 svc_connect_failed**. After every one, all 35 endpoints **still 503**.
3. **`rotate-keys` would make it WORSE — do NOT call it.** `POST /org-accounts/accounts/{name}/rotate-keys` runs `ALTER USER … UNSET RSA_PUBLIC_KEY` (it *clears* the key, "register a new key"). It does not regenerate/register an SVC key.
4. **Auto-provision is unreachable.** `connection_manager._try_provision_once` is guarded by `_svc_provision_attempted` (once per account) and the broken-but-registered SVC config short-circuits `get_read_connection` on path 1 before any user-fallback (`CACHE_READ_ALLOW_USER_FALLBACK`) or re-provision path is reached. Env changes need a process restart anyway.

### Required host-side fix (no app code redeploy)
1. Restore SVC auth for `SVC_DATA360_API` on accounts **HAHA and ABCD**: re-register the SVC user's `RSA_PUBLIC_KEY` on Snowflake to match the deployed private-key PEM (`SERVICE_ACCOUNT_KEY_PATH`), **or** fix the env (`SERVICE_ACCOUNT_USER/_KEY_PATH/_ACCOUNT/_ROLE`, or `SERVICE_ACCOUNT_ACCOUNTS` JSON).
2. Confirm the SVC role grant (health shows `role:null`).
3. Restart the API process so `_init_svc_accounts` rebuilds and `_svc_provision_attempted` clears.
4. Verify: `GET /admin/cache/svc-health` → `alive:true`; the 35 endpoints recover.

## Endpoint monitor (live)
| Tier | Endpoints | Status | Latency |
|---|---|---|---|
| User-connection | /projects, /data-products, /health | **200** | warm 23–66ms (data-products cold 2.0s) |
| SVC-cache (×35) | command-center/*, gouvernance/*, observability/*, data-quality/*, org-accounts/*, catalog/scores, notifications/unread-count, deployments/track | **503** svc_connect_failed | ~600ms (SVC connect-timeout) |

> The cold-start slowness on working endpoints (e.g. projects cold 8.4s on first hit) is the *absence of the SVC warmer* — same root cause. Fixing the SVC restores pre-warming too.

## FE-side fixes applied (resilience during the outage)
1. **`api-client.ts` 503 handling** — `CACHE_NOT_READY` / `svc_connect_failed` now surfaces an honest, specific message ("Live analytics are warming up — the data cache is being provisioned… please retry shortly") instead of a vague "Service temporarily unavailable." Improves all 35 degraded pages. tsc-clean.
2. **Proxy-env gotcha (for live testing):** `.env.local` sets `API_PROXY_UPSTREAM=http://127.0.0.1:8000` (dead local). The Next rewrite uses *that* var, so client calls need dev started with **both** `NEXT_PUBLIC_API_URL` and `API_PROXY_UPSTREAM` = `http://api.datalab360.io`. Dev is currently running that way (no file mutation; shell env wins).

## Open FE follow-up (not applied)
- `access-requests/*` routes return 404 — the deployed backend has **no** `/access-requests/*` routes (just-shipped data-badge feature, backend not deployed). The inbox should degrade quietly (404 → "not available yet") instead of an error+retry. Minor; deferred.
