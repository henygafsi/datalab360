# Fix — unblock reads during SVC outage (Explore & Design + all read endpoints) — 2026-06-22

## Symptom
In Explore & Design (and everywhere), only user-connection calls work (`/projects`, `/health`, `/my-permissions` → 200). All SVC-cache reads → `503 svc_connect_failed` (deployed `SVC_DATA360_API` key-pair dead). The E&D source/table/catalog/deployments data is SVC-gated, so the canvas can't load anything but the project list.

## Root cause (code-verified)
`app/core/connection_manager.py::get_read_connection`:
- **Path 1** (`acct_key in self._svc_configs`): on `CacheNotReadyError` it `raise`s and **never** falls through to the user connection.
- **Path 3** user-fallback (`CACHE_READ_ALLOW_USER_FALLBACK`) is only reachable when **no** SVC config is registered.
- HAHA/ABCD have a **registered-but-broken** SVC config → always hit path 1 → 503. So flipping the flag alone does nothing.

## Fix built (LOCAL, needs your deploy + go)
`backend/app/core/connection_manager.py` path 1 `except CacheNotReadyError`: when `CACHE_READ_ALLOW_USER_FALLBACK` is set, degrade to `get_user_connection_from_context(current_user)` (RLS-scoped) instead of `raise` — mirrors what path 3 already does for the no-SVC case. **Gated**: default (flag off) behaviour is unchanged/fail-closed. `py_compile` OK.

## Three ways to get data flowing (ranked)
1. **Clean (restores cost-optimized SVC cache):** re-register `SVC_DATA360_API`'s RSA public key on Snowflake (accounts HAHA + ABCD) to match the deployed PEM + confirm role grant + restart API → `svc-health: alive:true`. No fallback needed.
2. **No-deploy host stopgap:** unset the SVC config env (`SERVICE_ACCOUNT_*` **and** `SERVICE_ACCOUNT_ACCOUNTS` — svc-health shows 2 accounts, likely the JSON list) so `_svc_configs` is empty, **and** set `CACHE_READ_ALLOW_USER_FALLBACK=1`, restart → reads serve from the user connection (path 3). (Auto-provision may even re-key the SVC if the admin conn has the grant.)
3. **Deploy this fix + flag (durable):** deploy the connection_manager change above, set `CACHE_READ_ALLOW_USER_FALLBACK=1`, restart → registered-but-broken SVC degrades to the user connection automatically. Survives future key rotations.

> Caveats for 2 & 3: user-connection reads are RLS-scoped (correct/honest per role; ACCOUNTADMIN HAHA sees full data) and not pre-warmed (slower than the SVC→Redis path). The code comment says "never enable in prod" — that's a perf/cost stance, not a correctness one; it's the right switch to see data during an SVC outage.

## FE side (already applied, this session)
- `api-client.ts` + `command-center/index.tsx`: 503 `CACHE_NOT_READY` now shows an honest "Live analytics are warming up (backend reachable)" state instead of "Backend unreachable." Verified live.
- Dev proxy repointed at the live backend (`API_PROXY_UPSTREAM`).
