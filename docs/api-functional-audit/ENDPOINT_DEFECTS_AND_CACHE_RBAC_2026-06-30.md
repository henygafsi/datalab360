# Endpoint Defects & Cache-Invalidation RBAC Track — 2026-06-30

Scope: this is a **frontend-only** checkout. The FastAPI backend lives in a
separate GitLab repo and is **not present here**, so every claim about backend
internals below is explicitly labelled a **HYPOTHESIS**. All proposed endpoint
fixes are backend-side and require the separate GitLab repo plus a deploy
approval — none can be made in this repo.

Source of findings: the `/admin/api-health` probe board
(`apps/data360/src/app/(dashboard)/admin/api-health/page.tsx`), which sweeps the
wired FE service functions and classifies the live responses.

---

## Genuine backend defects

Confirmed genuine 5xx defects: **exactly one** (`getStorageDatabases` → HTTP 500).
The api-health classification flagged this as the only clear 5xx; the sweep was
not extended hunting for more (the board already classifies the rest as
fake-id-validation, expected authz, or FE stubs).

### 1. Org Accounts → `getStorageDatabases` → HTTP 500 "Internal Server Error"

| Field | Value |
| --- | --- |
| Endpoint name (probe) | `getStorageDatabases` |
| FE service function | `getStorageDatabases()` — `apps/data360/src/app/services/org-accounts/hooks.ts:377` |
| HTTP call | `apiClient.get('/org-accounts/storage/databases', { timeout: 60000 })` (`hooks.ts:379`) |
| api-contract key | **None** — the path is hardcoded in `hooks.ts` against `BASE_URL = '/org-accounts'` (`hooks.ts:98`); there is no `API.orgAccounts.storageDatabases` entry in `src/lib/api-contracts.ts`. (Minor CLAUDE.md convention gap — see note below.) |
| Backend route locator | OpenAPI `operationId`: `get_storage_databases_org_accounts_storage_databases_get` (from `apps/data360/src/app/(dashboard)/admin/api-health/openapi-snapshot.json`). Summary: "Per-database storage — Per-database average storage (latest snapshot)." |
| UI consumer | `apps/data360/src/app/shared/org-accounts/tabs/storage-tab.tsx:66` (`guard(getStorageDatabases())`) |
| Observed status | HTTP 500 "Internal Server Error" |
| api-health probe site | `page.tsx:944` — `{ name: 'getStorageDatabases', fn: () => getStorageDatabases() }` |

**Requirement (what it SHOULD return):** a `DatabaseStorageResponse` — the
per-database storage breakdown from the latest `ACCOUNT_USAGE` /
`ORGANIZATION_USAGE` storage snapshot — with HTTP 200 and an empty/zero list
(not a 500) when the account has no snapshot rows yet.

**HYPOTHESIS for the 500 (backend source not visible):** the underlying query is
a per-database aggregate over a `*_STORAGE_USAGE_HISTORY` view. The most likely
causes, in order:

1. **NULL / empty-snapshot aggregation** — `AVG()`/division over a window that
   returns zero rows (fresh account, or yesterday's snapshot not yet
   materialised) yields a NULL the response model rejects, or a divide-by-zero
   in a per-database percentage column.
2. **Missing grant / scope** — `STORAGE_USAGE_HISTORY` is account-scoped under
   `ACCOUNT_USAGE`; the org-wide variant lives under `ORGANIZATION_USAGE`, which
   requires `ACCOUNTADMIN`/`ORGADMIN`. If the route queries the org view without
   the fall-back-to-account-view pattern that the sibling `storage/stages`
   endpoint documents (see its OpenAPI description: "We try the org view first
   and fall back to the account view…"), a single-account install or a
   non-org-admin caller would error rather than degrade.
3. **Response-model mismatch** — a column typed non-nullable in the Pydantic
   model receiving a NULL from the snapshot.

**Fix location:** backend (separate GitLab repo). The fix is to make the
per-database storage query null-safe and apply the same org→account view
fall-back that `storage/stages` already uses, then return an empty list instead
of raising. Requires deploy approval. No frontend change is needed — the FE
service already surfaces (rather than swallows) the error and the consumer
toasts on throw.

> Convention note: this endpoint is one of the hardcoded `/org-accounts/storage/*`
> paths in `hooks.ts` that bypass the `src/lib/api-contracts.ts` registry
> (`storage/trend`, `storage/databases`, `storage/stages` are all hardcoded).
> Adding `API.orgAccounts.storage*` keys would align with the CLAUDE.md "no
> hardcoded endpoint strings" rule, but that is cosmetic and unrelated to the 500.

---

## Unconfirmed / needs re-probe (NOT a confirmed defect)

### API: Explore Design → `listEventTemplates` → "Unable to connect to the server"

This is **not** a confirmed backend defect. "Unable to connect to the server" is
an axios **transport** error (no HTTP status reached), not a 4xx/5xx response —
so it indicates a transient network/dev-server hiccup at probe time, not a
backend fault. It must be **re-probed** to confirm.

Wrinkle found while tracing it — there are **two** same-named probes:

- `page.tsx:592` → `listEventTemplates(FAKE_ID)` → `services/explore-design/index.ts:4570`
  → `GET /explore-design/{projectId}/event-templates` (`V1_EXPLORE = '/explore-design'`).
- `page.tsx:919` → `exploreDesignApi.listEventTemplates(FAKE_ID)` →
  `services/api/exploreDesignApi.ts:927` → `GET /explore-design/event-templates`,
  which is **documented FE-side as backend-absent** (`exploreDesignApi.ts:924`:
  "NOTE: /event-templates DOES NOT EXIST on backend (do not confuse with
  /event-tables)"). That one would 404 — an **expected FE-stub** condition, not a defect.

Either way: not a 5xx, not a genuine backend defect. Classify as
**re-probe to confirm transient**; if it persists it resolves to the expected
404 FE-stub path, not a fix.

---

## Not defects (expected behaviour)

These were on the board but are correct authz/policy responses — **do not** file
backend tickets:

- **`deleteReaderAccount` → "requires role ORGADMIN"** — expected authorization.
  `deleteReaderAccount(name)` (`hooks.ts:790`) issues
  `DELETE /org-accounts/reader-accounts/{name}`; dropping a reader account is an
  org-wide privileged operation. The probe ran as a non-ORGADMIN identity, so the
  refusal is the **correct** RBAC outcome. (Real-role nuance: `ORGADMIN` is the
  Snowflake org-admin role; the app-only D360 roles degrade to `ACCOUNTADMIN`
  data and would not carry it.)
- **`setUserMfa` → 501 Not Implemented** — expected policy/stub.
  `setUserMfa(username, enable)` (`services/governance/index.ts:178`) posts
  `/gouvernance/user/mfa/set`. A 501 means the route is intentionally not wired
  on this backend; the actionable-insights layer treats 404/501 as
  "unavailable" by design (self-disabling), so this is a known gap, not a fault.

---

## Cache-invalidation RBAC track

### How SVC cache invalidation is supposed to work per role/user

1. **Read path / role-keyed cache.** Role-sensitive reads (e.g.
   `GET /gouvernance/policies`, `GET /common/databases`) are served from a
   role-keyed Redis slot — the `@account_role_cache` decorator keys entries as
   `d360:{account}:{module}:{resource}:{ROLE}:…`. Two callers with different
   active Snowflake roles get **different** cache slots, so role-filtered (RLS)
   data does not leak across roles. The service account (SVC) can hold all roles
   and `USE ROLE` per read to pre-warm a per-role slot (prod-only — the warmer
   needs the SVC connection that does not exist in local dev).
2. **Invalidation spine (SSE).** `apps/data360/src/hooks/useCacheInvalidation.ts`
   opens a single long-poll `fetch` stream to `…/cache-stream/stream` (via the
   same-origin `/api-proxy` rewrite in the browser, JWT in the `Authorization`
   header). The backend emits `cache_invalidation` events carrying
   `cache_keys: string[]` (matching the `CACHE_KEYS` enum, lines 10–151 of the
   hook). On each event the `onInvalidate(keys, reason)` callback fires and the
   subscribing component re-fetches (React Query `invalidateQueries` / Jotai
   atom refresh). Auth/transport handling: 401/403 → session expired; 404/502/503
   → soft-degrade silently; other non-OK → quiet retry with exponential backoff
   (1s → 30s cap, 5 attempts before surfacing "Sync offline").
3. **Write → invalidate → re-read.** A mutating action (e.g. creating a
   row-access policy) should **evict** the affected account/role slot, the SSE
   event tells subscribed clients to refetch, and the next read repopulates a
   fresh slot from the SVC/own connection — so other users/roles granted the same
   project see the change without a stale window.

### What the existing harness already validates

`e2e/ux-audit/_role-cache-rbac-e2e.mjs` (peers:
`_arch-redis-role-cache-e2e.mjs`, `_xrole-cache-test.mjs`, `_arch-6assertions-e2e.mjs`)
runs against the **live** backend (`:8000`), real Snowflake and real Redis. It
logs in by reading the saved Playwright auth state `e2e/.auth/state.json`
(present, ~2.5 KB), opening `/account-overview`, then pulling
`access_token` + `role` + `account_name` from `/api/auth/session`. It proves,
**for that one saved role**:

1. **Role-aware cache is real** — after `GET /gouvernance/policies` a new
   `d360:*` role-keyed slot appears in `/command-center/cache-metrics`
   (`key_counts_by_prefix.d360` increments by 1 for the active role), and a 2nd
   call is a measurable cache HIT (equal/faster).
2. **Real RBAC db-selection** — `GET /common/databases` runs Snowflake
   `SHOW DATABASES` under the caller's active role, returning exactly the DBs
   that role may see.
3. **(opt-in `E2E_MUTATE=1`) Administrator grant flow** — create a row-access
   policy scoped to a DB, assert the role-cache slot is **evicted** right after
   the write (and report the invalidation granularity: none / object-scoped /
   account-wide), confirm it reappears in the role-cached inventory on re-read,
   then delete it (reversible, test-scoped).

### The blocker

The harness validates per-role slotting and RBAC filtering **for a single saved
role only** (`e2e/.auth/state.json`). The remaining, unproven scenario — *another
user/role is granted a project + a feature deployment, and the role-keyed cache
invalidates correctly across those distinct identities* — requires **real
per-persona logins**, which the automation **cannot self-provide**:

- Logging in mints a Snowflake token via NextAuth CredentialsProvider; for a
  privileged persona this needs **MFA enrolment**, and automation cannot complete
  an MFA challenge.
- Critically (per prior cache-governance findings): **only `BI_ANALYST` and
  `DATA_MODELER` are real Snowflake roles.** The app-only D360 roles degrade to
  `ACCOUNTADMIN` data, so exercising them proves nothing about per-role
  isolation. Cross-role validation must use personas mapped to **real Snowflake
  roles**, or the test is meaningless.

---

## Blockers needing the user

To run the multi-role cache-invalidation validation, the user must supply, **per
persona to validate** (at minimum one mapped to `BI_ANALYST` and one to
`DATA_MODELER`, since those are the real Snowflake roles), **either**:

1. **Username + password** for a login mapped to a **real Snowflake role**, with
   **MFA disabled** for that account (or an app-password / pre-authorised
   credential) — automation cannot complete an MFA enrolment/challenge; **or**
2. **A pre-seeded Playwright `storageState` JSON per persona** — one sibling file
   alongside `e2e/.auth/state.json` (e.g. `e2e/.auth/state.bi_analyst.json`,
   `e2e/.auth/state.data_modeler.json`), each captured from a real logged-in
   session for that role.

Additionally, to exercise the "granted a project + feature deployment" path the
user should specify, per persona: the **target project** each persona is granted
and the **database** that project's RLS scopes to (the harness can take `E2E_DB`),
so the test can assert a write under one role becomes visible — post-invalidation
— to the other granted role and not to an ungranted one.

Once those auth states (or credentials) exist, the existing harness generalises
trivially: parameterise the `storageState` path and re-run the role-cache +
RBAC assertions per persona, plus a cross-persona read-after-write check.
