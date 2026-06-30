# Data360 — Admin Intelligence Map

**Authoritative architecture reference · 2026-06-30**
Author: Lead Solution Data Architect
Scope: `apps/data360/` frontend + the FastAPI `/gouvernance/*`, `/api/platform/grants/*`, `/administration/*`, `/admin/cache/*` surfaces it drives.
Status of evidence: All file:line citations are relative to `apps/data360/src/`. The FastAPI backend is **not** in this checkout; backend behaviour is grounded in the FE service code, `src/lib/api-contracts.ts`, the live-OpenAPI-derived `app/(dashboard)/admin/api-health/data/endpoint-cache-map.json`, the api-catalog, and the live `/admin/api-health` sweep run as `ACCOUNTADMIN` ("HAHA"). Where a claim is backend-only it is marked **unverifiable-from-FE**.

**Scope note — the api-health/activity-stats admin tooling is in scope as evidence-producing infrastructure, not as a governance surface.** The `API.admin.*` block (`api-contracts.ts:855-913`) exposes ACCOUNTADMIN-gated families that *produce* the evidence this doc leans on: `admin.apiHealth.persistRun/listRuns/runDetail` (the `/admin/api-health/runs` sweep store), `admin.apiHealthIntrospect` (resolve a probed call's warehouse query), and `admin.activityStats` (platform-wide activity). They are FE-wired (see §4.11) but are platform-ops/observability, not part of the `/gouvernance/*` · `/api/platform/grants/*` · `/administration/*` governance catalogue — they are catalogued in §4.11 for completeness rather than folded into the governance counts. `admin.serviceAccountHealth` + `admin.svcRegistry` are already catalogued in §4.9.

---

## 1. Executive Summary — what "l'intelligence admin de Data360" IS

Data360's admin intelligence is **the system that decides who can DO and SEE what** across the platform, and keeps that decision consistent in real time for every concurrently-connected admin. It is not a single page — it is a layered control plane that binds five things together:

1. **Identity** — a NextAuth JWT session carrying a Snowflake `access_token`, `role`, granted module `items`, and `account_name`/`username` (multi-tenant headers).
2. **Two RBAC systems**:
   - **System 1 — Module-level RBAC** (`config/modules.ts` + `session.items` + `GET /user/me/modules`): *cosmetic* sidebar show/hide. NOT a security boundary.
   - **System 2 — Action-level RBAC** (`useCanPerform` → `GET /gouvernance/d360-roles/my-permissions`): per-`(module,action)` allow-set that shows/hides/disables every mutating button. *Advisory UX* — the real boundary is the backend.
3. **Real Snowflake account roles + grants + policies** — the Roles, Grants, Policies and Security-Matrix pages perform actual `CREATE/DROP/GRANT ROLE`, `GRANT/REVOKE`, and policy DDL against Snowflake.
4. **RLS / masking / row-access enforcement** — per-role, per-row data filtering enforced by the Snowflake backend under the caller's role on the read path.
5. **A role-keyed cache + SSE invalidation spine** — a three-tier backend cache whose `@account_role_cache` tier holds *per-role RLS-filtered data*, kept consistent by one SSE stream that broadcasts cache-key invalidation events; an admin's grant edit re-gates every open browser tab with no reload.

**The single most important mental model (and a correction to a stale code comment):** the front-end `useCanPerform` gate is **advisory UX**. The **real boundary** is the backend `require_action` decorator plus Snowflake RLS/masking executed under the caller's role. The comment at `hooks/useCanPerform.ts:14` ("this is the first real gate and nothing else enforces yet") is **stale** — contradicted by the `EnforcedBanner` (`admin/data360-config/ActionRbacTab.tsx:109-122`, "the allow-set the backend `require_action` gate reads"), the `GOVERNANCE_DENIED` 403 path (`lib/api-client.ts:195-226`), and live authz evidence (`deleteReaderAccount` needs ORGADMIN). Treat the FE as the optimistic, fail-open layer that makes the UX honest; treat the backend as the wall.

**The second most important fact for operators and testers:** the platform runs a **two-tier role model**. Some "roles" are real Snowflake account roles (`CREATE/GRANT ROLE` operates on them); others are app-only "D360 roles" that exist purely in the backend permission store. Per project memory, only a subset of D360 roles is backed by a real Snowflake role; the rest degrade to `ACCOUNTADMIN` data. This means a green test as `ACCOUNTADMIN` does **not** prove per-role RLS works — see §5.

---

## 2. The End-to-End Control Plane

A single governance mutation (e.g. an admin grants a module to a role) traverses every layer below. Reads traverse the same spine in reverse, plus RLS filtering.

```
                              ADMIN'S BROWSER
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (1) IDENTITY                                                              │
  │      NextAuth JWT session  (auth-options.ts: jwt strategy, maxAge 8h)      │
  │      POST /signin → Snowflake access_token, role, items[], account_name    │
  │      session.user = {access_token, role, items, account_name, username}    │
  └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (2) ROUTE PROTECTION  (AUTH-ONLY — no role/module logic at the edge)      │
  │      middleware.ts  withAuth: authorized = (!!token)                       │
  │      SessionGuard (dashboard layout): authenticated + token-fresh only     │
  └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (3) MODULE GATING — SYSTEM 1  (COSMETIC, sidebar show/hide)               │
  │      carbon-sidebar.tsx: isAdminRole ? getAllModuleIds()                   │
  │                                       : normalizeToIds(session.items)      │
  │      NOT a security boundary — hides menu entries only.                    │
  └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (4) ACTION GATING — SYSTEM 2  (ADVISORY UX, per-button)                   │
  │      useCanPerform(module, action)                                         │
  │        → module-wide singleton cache (ONE request per page)                │
  │        → GET /gouvernance/d360-roles/my-permissions                        │
  │      allow → live button | deny → hide/disable | loading → fail-open(show) │
  │      hard error → ALLOW (fail-open) ; 503 CACHE_NOT_READY → DENY           │
  └───────────────────────────────────────────────────────────────────────────┘
                 │  apiClient (lib/api-client.ts) injects:
                 │    Authorization: Bearer <access_token>
                 │    X-Account-Name / X-Username
                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  /api-proxy/:path*  →  (next.config rewrite, same-origin HTTPS → backend)  │
  └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
═══════════════════════════════ FASTAPI BACKEND (not in checkout) ═══════════════
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (5) BACKEND AUTHORIZATION — THE REAL BOUNDARY                             │
  │      require_action gate (per-endpoint)  +  ACCOUNTADMIN admin gate        │
  │      403 GOVERNANCE_DENIED / MODULE_FORBIDDEN  ──┐                          │
  └─────────────────────────────────────────────────┼─────────────────────────┘
                 │ (mutation authorized)             │ (denied)
                 ▼                                   ▼
  ┌──────────────────────────────────┐   ┌──────────────────────────────────────┐
  │  (6) MUTATION                    │   │  api-client.ts parses 403 →           │
  │   CREATE/DROP/GRANT ROLE,        │   │  AuthorizationError{requiredRoles…}   │
  │   GRANT/REVOKE, policy DDL,      │   │  → dispatch 'data360:governance-denied'│
  │   SECURITY_MATRIX writes         │   │  → GovernanceDenialListener            │
  └──────────────────────────────────┘   │  → "Request access" toast →            │
                 │                        │    /administration/access-center      │
                 ▼                        └──────────────────────────────────────┘
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (7) RLS / POLICY ENFORCEMENT (read path, under caller's role)            │
  │      row-access / masking / aggregation policies filter rows/columns       │
  │      per active Snowflake role  (the matrix→RLS binding is backend-only)    │
  └───────────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  (8) ROLE-KEYED CACHE INVALIDATION                                         │
  │      mutation broadcasts cache_invalidation {cache_keys:[…]} over SSE      │
  │      GET /cache-stream/stream  (one owning stream, CacheInvalidationProvider)│
  │        ├─ RBAC keys (GRANTS/ROLES/USER_PERMISSIONS/'permissions')          │
  │        │     → invalidateMyPermissions() → every gated button re-resolves  │
  │        └─ data keys (USERS/POLICIES/SECURITY_MATRIX/…)                     │
  │              → lastInvalidationAtom → useCacheAwareQuery refetch (~100ms)   │
  │      backend evicts the matching @account_role_cache slot PER ROLE         │
  └───────────────────────────────────────────────────────────────────────────┘
```

The intelligence is in **steps 4 and 8 working as a loop**: an admin writes a grant (6), the backend broadcasts the right keys (8), the single SSE stream drops `my-permissions` and the relevant role-keyed cache slots, and every open tab — for every role — re-resolves its gated controls and refetches stale data in ~100 ms, with no page reload and no extra network connections.

---

## 3. The Facets

Each facet below describes the *surface* and its specific wiring. The full per-endpoint catalogue (cache tier, RBAC tag, REAL/STUB verdict) is consolidated once in **§4** — facets cross-reference it rather than re-listing every row.

### 3.1 Users Management — `governance/users/`

**Page** `app/(dashboard)/governance/users/page.tsx`; heavy components in `app/shared/governance/users/*`; services `fetch_users.ts`, `user_roles.ts`, `index.ts`.

- **Page gate**: hard-gated by coarse `isAdminRole(role)` (`page.tsx:28-38`) — only `ACCOUNTADMIN|SYSADMIN|SECURITYADMIN` render the table; others get an "Access restricted" panel. `role` defaults to `ACCOUNTADMIN` until the JWT resolves so admins never see a flash.
- **List + detail**: `UsersTable` loads via `useCacheAwareQuery(getUsers, {cacheKeys:[CACHE_KEYS.USERS]})` (`table.tsx:51-59`), so an SSE `users` invalidation auto-refetches with an `isStale` "Syncing…" spinner. `getUsers()` (`fetch_users.ts:54-98`) maps raw Snowflake `SHOW USERS` rows → `UserTableDataType`, merging `default_role` + parsed `default_secondary_roles` into `roles[]` and deriving `status` from `disabled`. The `users`-scope `GovernanceKpiStrip` (`GovernanceKpiStrip.tsx:177-183`) derives Total/Active/Disabled by counting the same list (honest aggregation, not a separate stat endpoint).
- **Create user (+ optional role at creation)**: `AddUserButton` gates on `useCanPerform('gouvernance','create')`; `addUser()` (`fetch_users.ts:125-156`) POSTs `/gouvernance/add-user`. Intelligence = **partial-success role grant**: empty role is dropped (never POSTs `role:""`); a truthy `role_error` on a 2xx is a *non-fatal* warning ("User created, role assignment failed"). Calls `invalidateMyPermissions()` defensively.
- **Service users + RSA key-pair** (surfaced on the OAuth page, §3.7): `createServiceUser` (TYPE=SERVICE), `assignRSAKey`, `revokeRSAKey`. The RSA key pair is generated **in-browser** via WebCrypto (2048-bit RSASSA-PKCS1-v1_5); only the public key is transmitted, the private `.p8` is downloaded locally.
- **Enable/disable/delete**: each behind a `ConfirmDialog`. Note the deliberate **trailing slash** on `enable_user/`/`disable_user/` with a dedicated `next.config` rewrite so the proxy doesn't 307-redirect and drop the auth header. Bulk delete falls back to a sequential `deleteUser` loop on 404/405 (the batch route is unconfirmed).
- **Edit profile / roles**: profile edit → PUT `/gouvernance/enterprise-users/{username}` (reuses the enterprise-users route). Full role replace → `updateUserRoles` → PUT `/gouvernance/users/{username}/roles`; both call `invalidateMyPermissions()`.

**Honesty flags**: standalone `assign-role` is a REAL, live-proven endpoint but has **no UI caller in the Users facet** (role-at-creation uses `add-user`; editing uses the full-replace `users/{username}/roles`). `unassign-role` is contract-only (STUB-on-FE). Per-user MFA `set` returns **501 by design** (account-level enforcement only). "Import Users" is generic CSV plumbing with no user-ingest endpoint (STUB).

### 3.2 Roles Management — `governance/roles/`

This is the cleanest place where **the two RBAC systems meet**: it *manages real System-1 Snowflake account roles* while *every control is gated by System-2 action-RBAC*. Every role mutation fires `invalidateMyPermissions()`.

- **List + delete** (`app/shared/governance/roles/table.tsx`): `useCacheAwareQuery(getRoles,{cacheKeys:[CACHE_KEYS.ROLES]})`; `getRoles()` → GET `/gouvernance/roles`. A hardcoded `PROTECTED_SYSTEM_ROLES = [ACCOUNTADMIN, SYSADMIN, SECURITYADMIN, USERADMIN, PUBLIC, ORGADMIN]` blocks deletion **client-side** (the backend is the real guard). Single delete returns `{revoked_from_users, revoked_grants}`.
- **Create** (`AddRoleButton`/`AddRoleForm`): gated `gouvernance:create`; `addRole` → POST `/gouvernance/add-role`.
- **Edit** (`edit/[id]`): only **Comment** is editable (role name/grants/createdOn are read-only). `updateRole` accepts `{comment, modules}` but **no UI sends `modules`** — a service capability without a surface.
- **Role Inspector** (`roles/components/RoleInspectorPanel.tsx` + `role_grants.ts`), a docked panel with three sections:
  - **Object grants**: `getRoleObjectGrants` → GET `/gouvernance/roles/{role}/object-grants` = `SHOW GRANTS TO ROLE` (read-only).
  - **Role hierarchy**: Attach `attachRole` → POST `…/grant-role` (`GRANT ROLE accessRole TO ROLE role`); Detach `detachRole` → DELETE `…/grant-role?to_role=`. **Direction invariant** (locked): the inspected role R is ALWAYS the recipient (`to_role`), so mutations move in the same direction as `SHOW GRANTS TO ROLE R`.
  - **Mint access role**: `mintAccessRoleFromObjects` → POST `/gouvernance/access-roles/from-objects` (reverse-provisions a reusable technical role, auto-names `AR_<DB>_<SCHEMA>`).
- **Least-privilege advisory (D3)**: `getRoleLeastPrivilege` → GET `/gouvernance/roles/{role}/least-privilege`. Lives in `GovernanceDepthPanel.tsx`, NOT the roles page. Pure advisory/read-only (~0 credits); degrades to "Not available on this backend" on 404/501.

**The two role systems (critical):** System-1 (real Snowflake roles) = `getRoles/addRole/updateRole/deleteRole/object-grants/hierarchy/mint`. System-2 (app-level "d360-roles") = `getD360Roles`, custom-role CRUD, the action-registry permission matrix, `my-permissions`, `effective/{username}`. **The D360 permission-matrix editors live OUTSIDE `roles/`** — on `governance/grants/page.tsx`, `admin/data360-config/ActionRbacTab.tsx`, and `administration/access-center/*`. The roles page itself only CRUDs real Snowflake roles + hierarchy.

**Dead code warning**: `config/constants.ts:85 ROLE_PERMISSIONS` (SF-role → numeric module IDs) is **legacy/dead** (zero consumers via grep). It is NOT the live d360→permission mapping; the live mapping is the backend action-registry.

### 3.3 Grants Management — `governance/grants/` ("Access Control", 7 tabs)

`GrantsManagementPage` (`page.tsx:603`). Two distinct matrices live on one page and must not be confused:

- **Tab 1 — Role Grants** (role × **module**, the editable one): `getRoles()` from `grants.ts:20` → GET `/gouvernance/grants` (returns `{role_name, modules[]}`). Edit in a docked `RightTabPanel`; selected sub-modules are **collapsed to parents** before `updateGrants` → PUT `/gouvernance/update-grants`; then `invalidateMyPermissions()`. Gated `gouvernance:grant`. Module grants gate sidebar/feature visibility ("Changes take effect on next user login").
- **Tab 2 — Grant Matrix** (role × **privilege/object**, read + object-level revoke): rows = `getRoles()` from `fetch_roles.ts` → GET `/gouvernance/roles`; cells hydrate via `getPermissions()` → GET `/gouvernance/grants-matrix` (**batched, one request** — the N+1→batched fix that took "38s cold" down) with a per-role `grants-for-role` fallback on 404/501. Revoke → `revokePermission` → POST `/gouvernance/revoke-permission` (real `REVOKE … FROM ROLE`); only renders when `g.revocable` (privilege+granted_on+name all present). The panel **never** calls `updateGrants` (wrong axis).
- **Tab 3 — User Grants**: `getUsersWithRolesAndModules` → GET `/gouvernance/users-with-roles`; mutate via `updateUserRoles` → PUT `/gouvernance/users/{username}/roles`.
- **Tab 4 — Policy Grants**: builds `PolicyGrant[]` client-side from GET `/gouvernance/policies`; assign via `assignPolicyToRoles` → PUT `/gouvernance/policies/{type}/{name}/roles`.
- **Tab 5 — Stage Grants**: reads GET `/connect/stages` + `/connect/stages/{stage}/grants`; reuses object-grant verbs `grantPermission`/`revokePermission` with `object_type=STAGE`.
- **Tab 6 — D360 Roles** (System-2 store): `getD360Roles` + templates; CRUD `createD360Role`/`updateD360Role`/`deleteD360Role`. Create/edit gated `gouvernance:create`, delete gated `gouvernance:delete` (separately, so a create-only role can't drop roles). Every mutation calls `invalidateMyPermissions()`.
- **Tab 7 — Sources & Products**: read-only catalog lists + a single global "Add Grant" form → POST `/gouvernance/grant-permission`.

**GUI page-access rules** (NOT on this page — on `admin/data360-config` `AccessTab`): `listGuiPermissions`/`upsertGuiPermission`/`deleteGuiPermission` + `getMyPageAccess` (`/gui-permissions/my-access`) + `getUserEffectiveGuiAccess` (`/gui-permissions/effective/{username}`). The AccessTab renders a role×page matrix cycling NONE→READ→WRITE. **Critical**: an `EnforcementBanner` states verbatim "Page Visibility Hints (Not Enforced)… they do not enforce API access." Real enforcement is Action-RBAC + module gating.

**Platform per-page grants** (`/api/platform/grants*`, NOT on this page — `AccessManagementPanel` behind `ManageAccessButton` on Workflow/BI/Data-Products/Explore): `listGrants`/`grantPage`/`revokePage`/`bindUser`/`grantAction`/`grantPolicy`. Write gate is super-admin `GRANT_ADMIN_ROLES = ['ACCOUNTADMIN','ORGADMIN','SECURITYADMIN']` — deliberately **NOT** `SYSADMIN` (differs from `D360_ADMIN_ROLES`). Documented post-revoke staleness: `GET /api/platform/grants/role/{role}` "can serve STALE data post-revoke" (Snowflake result-cache), so the FE reads `GET /api/platform/grants` (fresh) after a mutation.

### 3.4 Governance Policies — `governance/policies/`

One client page hosts 9 tabbed sub-modules (Data Access: rls/masking/aggregation/network · Classification: classification/tag/dmf · Authentication: password/session) + 4 cross-cutting panels, all through `policies.ts` (2123 lines) + `dmf.ts`.

- **CRUD shape**: all policy mutations are **query-param POSTs with a null body** (backend uses `Query(...)`), wrapped in `StandardResponse{message,data,status}`. There is **no `GET /{type}/list`** for masking/row-access/aggregation (405) — these come from the unified inventory `GET /gouvernance/policies` (returns `{masking,row_access,aggregation,total}`), which omits the policy body. So RLS `signature`/`expression` default to `'(Not available)'` and are fetched on demand; masking enriches via a **single batch call** `POST /masking/batch-details` (avoids N+1).
- **Two-step "dry-run" apply** (the smart part, RLS tab): `handlePreviewApply` reads the target's existing policies via `getTablePolicies`, counts existing row_access policies, surfaces conflicts in a `ConfirmDialog`; only `handleConfirmApply` runs the real `applyRLSPolicy` with a live elapsed-ms timer. There is **no backend dry-run endpoint** — this is an honest client-side preview.
- **Delete safety**: PolicyCard first `unapplyPolicyFromAll` if `granted_objects_count > 0`, then deletes. **Replace** routes (`/{type}/replace`) **do not exist** — they 404/405 and fall back to remove+apply, leaving a brief window where the object is unprotected.
- **Metadata edit-in-place** (no drop+recreate): `updatePolicyMetadata` → PUT `/{type}/{name}/metadata` body `{expiration_date?, comment?}`; gated `gouvernance:apply`.
- **Governance Depth — the "intelligence" (D1/D2/D3)**, advisory/read-only/~0-credit, each self-disabling on 404/501:
  - **D1 Row-access simulate** ("who-can-see"): `simulateRowAccess` → POST `/row-access/simulate` → `{applies, predicate, visible_count, hidden_count}`. **Live-proven.**
  - **D2 Masking preview** (masked-vs-unmasked under caller's role): `previewMasking` → POST `/masking/preview`. **Live-proven.**
  - **D3 Least-privilege review**: `getRoleLeastPrivilege` → GET `/roles/{role}/least-privilege`.
- **Classification→tag→policy pipeline** (`classification-content.tsx`, 10-min timeout): classify → extract-categories → apply-tags → custom classifiers/regex. Each classified row has a **"Protect"** button that infers a masking type (`inferMaskingType`: EMAIL→EMAIL, SSN/PHONE→FULL, CREDIT_CARD/IBAN→PARTIAL_LAST, IP→HASH) and prefills the Masking tab — closing the loop.
- **DMF (Data Metric Functions)**: list/create/describe/drop/associate/disassociate/schedule + `all-references`. **DMF evaluation RESULTS are NOT rendered here** — quantitative values live in the data-quality module (`/data-quality/dmf-results`); this tab manages definition/association/schedule/status only. Thresholds cross-call into `/data-quality/dmf/thresholds`.
- **Role-scoped view (G1, "For my role")**: `getMyScopePolicies` → GET `/gouvernance/policies/my-scope` — **NOT admin-gated**; any authenticated user sees policies their active role owns/holds-APPLY-on/is-referenced-by, with honest tri-state `manageable_by_me`/`references_my_role` flags.

### 3.5 Security Matrix — `governance/security-matrix/`

Binds **identities → roles → data-scope** as a role×axis grid. Single page, three tabs (Access Matrix, Enterprise Users, Security Axes) over `security_matrix.ts`.

- **Role × axis-value access model**: each row = `(role_name, region_id?, store_id?, department_id?, product_category?, customer_segment?, access_level∈{READ,WRITE,ADMIN})`. A `null` axis = "all". Axis dropdowns are populated from `available_axes` returned alongside the matrix in one response (self-describing grid). Inline editing buffers dirty rows → "Save All" via PUT `/gouvernance/security-matrix/batch`.
- **Axes** = a managed dimension catalog (region/store/department/custom value lists the matrix references). `axis_id` is fixed: 1=region, 2=store, 3=department, 4=custom.
- **Identity → directory sync with IDP inference**: `syncEnterpriseUsers` → POST `/gouvernance/enterprise-users/sync` pulls `SHOW USERS` and infers `IDENTITY_PROVIDER` (LOCAL/ENTRA_ID/OKTA/SAML_CUSTOM/KEY_PAIR) from SAML/SCIM metadata (backend logic, not FE). Enterprise-user delete is **directory-only — does NOT drop the Snowflake user**.
- **Permission-cache coupling**: every matrix create/delete/batch-save calls `invalidateMyPermissions()` — `page.tsx:288` (Save-All after `batchUpdateSecurityMatrix`), `:305` (delete-row), `:328` (add-row) — because matrix edits change role→scope mappings.
- **Refetch mechanism (corrected):** SSE keys `SECURITY_MATRIX`/`ENTERPRISE_USERS` drive refetch, but the page does **NOT** use `useCacheAwareQuery` (unlike Users §3.1, `table.tsx:51-59`). It runs a **raw/manual atom-subscriber** (`page.tsx:236-247`): a `useAtomValue(lastInvalidationAtom)` effect that hand-matches `keys.includes(CACHE_KEYS.SECURITY_MATRIX)` → `loadMatrix(true)/loadAxes(true)` and `CACHE_KEYS.ENTERPRISE_USERS` (only once the lazy users tab has loaded) → `loadUsers()`. It does **not** open its own SSE stream — it reuses the shared atom — so it is correct, but it bypasses the `useCacheAwareQuery`/`useOnCacheInvalidation` primitives (a hygiene seam §3.8's architecture-gap list otherwise omits).

**THE LOAD-BEARING CAVEAT — matrix→RLS enforcement is unverifiable from FE.** The backend *documents* the matrix as the RLS source ("maps roles to axis-based access permissions… used for Row-Level Security"), and `init` materializes a physical `SECURITY_MATRIX` table — the classic Snowflake **mapping-table RLS** pattern (a row-access policy whose filter joins the protected table against `SECURITY_MATRIX` on the caller's role + axis columns). **But NO front-end code path translates a matrix entry into a row-access policy.** The matrix page imports zero RLS functions; the canonical `applyRLSPolicy` needs an explicit `table_name/database/schema/policy_column` never sourced from matrix rows. So "the matrix enforces RLS" is **documented backend intent, not FE-proven behaviour** (see §6 BLOCKED, §8). Also: `createRLSPolicy` in `security_matrix.ts:258` is **broken by design** — it POSTs to a route the backend serves only as GET (superseded by `policies.ts`).

### 3.6 Action-Level RBAC Engine (System 2) — the brain of admin gating

The "what can THIS user DO" layer. Resolves a per-`(module,action)` allow-set **once per page load** and uses it to show/hide/disable every mutating button.

- **Resolution**: `useCanPerform(module, action)` → module-level **singleton cache** (`cachePromise/cacheData`, `useCanPerform.ts:24-68`) → `getMyPermissions()` → GET `/gouvernance/d360-roles/my-permissions`. A `Set` of subscribers drives re-renders, so a page full of gated buttons makes exactly ONE request. The inverse primitive — **`invalidateMyPermissions()` (defined `useCanPerform.ts:71`)** — nulls that singleton (`cachePromise=cacheData=null`), `notify()`s mounted consumers into a loading state, then kicks a fresh `load()`. This one function is the load-bearing re-gate primitive referenced throughout §§3.2/3.5/3.6/7: every permission-mutating success path and the SSE re-gate (§3.8) call it.
- **Three consumer primitives**: `GovernedActionButton` (canonical CTA; `denyMode:'hide'` for mutating verbs; on success with `mutatesPerms` calls `invalidateMyPermissions()`); `PermissionGate` (gates whole sections, renders a Lock EmptyState when denied); `PermissionGatedButton` (disables with tooltip). ~100 consumer files across BI/workflow/governance/sources/data-products/observability/org-accounts/explore-design.
- **The action registry**: GET `/gouvernance/d360-roles/action-registry` returns the full `{module:page:tab:action}` coordinate space. The editor (`admin/data360-config/ActionRbacTab.tsx`) renders it as ALLOW toggles for a CUSTOM role; saves via `setRolePermissions` (**wholesale DELETE+re-INSERT**, custom roles only — 403 on system). A confirm dialog reports **blast radius** (count of users holding the role). `applyTemplate` copies a system template onto a custom role.
- **The intelligence**:
  - **Fail-open on hard failure** (`:139-147`): network/HTTP error → `allowed:true` (a transient hiccup never locks an admin out). The lone exception, `503 CACHE_NOT_READY` → DENY (a transient SVC-down can't unlock every button).
  - **Provenance awareness**: `getEffectiveUserPermissions` tags each decision `db`/`matrix` (explicit grant) vs `default` (fail-open: module not covered → allowed by default, NOT an intentional grant). `SourceBadge` + "N fail-open" rollups stop an admin misreading "10/10 allowed" as "10 explicit grants."
  - **Live re-gate via SSE**: `CacheInvalidationProvider` calls `invalidateMyPermissions()` on `GRANTS`/`USER_PERMISSIONS`/`ROLES`/`'permissions'` events.
  - **Runtime-denial seam**: a backend `GOVERNANCE_DENIED`/`MODULE_FORBIDDEN` 403 → `AuthorizationError{requiredRoles,requiredModule,yourRole,requestAccess}` → global event → `GovernanceDenialListener` → deduped "Request access" toast → `/administration/access-center`.

**Three FE-gate limitations (footguns):**
1. **Coarser than the stored matrix**: `isAllowed` matches on **module + action ONLY**, ignoring page/tab, even though the matrix is stored at `module:page:tab:action` granularity. Any single allowed (page,tab) lights up the whole module+action on the FE. No DENY-override semantics client-side (`access_level` defaults to `'ALLOW'`).
2. **`module` arg is the action-registry key, NOT `MODULES.apiName`**: verified divergences BI=`bi_reporting`, Connect=`connect`, Client Accounts=`org_accounts`. A wrong key silently mis-gates with no error.
3. **`projectId` is accepted but ignored** (`void projectId`): `/my-permissions` is account-global. Per-project / per-row scoping is enforced by **Snowflake RLS/masking on the read path** under the caller's role, NOT this gate. (The editor/preview endpoints DO accept `project_id` but degrade to global + `column_missing:true` on un-migrated columns.)

### 3.7 Module-Level RBAC + Identity / External Federation

Covers System-1 module gating, the NextAuth session, route protection, and Snowflake-side federation (`governance/oauth/`).

- **NextAuth session** (`auth-options.ts`): JWT strategy, `maxAge 8h`. Two providers — `CredentialsProvider` (Snowflake-backed `POST /signin`) and `GoogleProvider` (app-level SSO into the dashboard). The session shape downstream code reads = `{access_token, role, items, account_name, username}`.
- **Identity → backend**: `api-client.ts` request interceptor injects `Authorization: Bearer`, `X-Account-Name`, `X-Username` (with a 30s session cache to dedupe the "/api/auth/session storm").
- **Module RBAC** (`config/modules.ts`): `MODULES` maps `id ↔ name ↔ apiName` (Governance → `gouvernance`, AI Intelligence → `intelligent`). Enforced ONLY in the sidebar (`carbon-sidebar.tsx`) — show/hide, not a boundary. `useAuth` is a **client convenience helper that FAILS OPEN** (`role='ACCOUNTADMIN'`, `allowedModules=ALL` when no token); for non-admins it calls GET `/user/me/modules`.
- **Route protection (two layers, AUTH-ONLY)**: `middleware.ts` `withAuth` checks token presence only (and its matcher **omits `/admin` and `/administration`** with no catch-all); `SessionGuard` enforces authentication + token freshness only. **All module/role authz is enforced by the backend per-endpoint 403.**
- **OAuth/Identity page** (`governance/oauth/page.tsx`): reads `listOAuthIntegrations`/`listApiKeys`; the create wizard builds a `CREATE SECURITY INTEGRATION … TYPE=EXTERNAL_OAUTH` SQL preview — **only ever emits EXTERNAL_OAUTH**, no SAML path despite the "OAuth, SAML, SCIM" tab subtitle. Service users + RSA keys are REAL and live-proven.
- **External federation** (Snowflake security objects, separate from the app's NextAuth login): OAuth integrations (REAL+wired), `createSAMLIntegration` (REAL endpoint, **UI STUB** — only the api-health probe calls it), network policies, service users + RSA, GUI page-access, enterprise-user directory.

**Inconsistencies found (mostly inert today, but real maintenance debt):**
- **Divergent module-ID maps**: `useAuth.MODULE_ID_MAP` disagrees with `modules.ts` (explore_design 2 vs 12, dashboard 8 vs 11, account_overview 11 vs 13, client_accounts 12 vs 14) and keys `governance` vs apiName `gouvernance`. Inert because `useAuth.allowedModules` has zero consumers — a live bug the moment anything gates on it.
- **Divergent admin-role lists**: sidebar `{administrator, modeler, accountadmin, sysadmin}` **omits securityadmin** vs CLAUDE.md `{ACCOUNTADMIN, SYSADMIN, SECURITYADMIN}`. A SECURITYADMIN gets the full menu only via backend bypass.
- **Token-lifetime bug**: `SNOWFLAKE_TOKEN_LIFETIME_MS = 1144*60*1000 ≈ 19h` contradicts its own "55 minutes" comment and exceeds the 8h `maxAge` → derived `tokenExpired` effectively never fires.
- **`identity-integrations.ts` is orphaned** (zero importers) — duplicates live clients in `index.ts`/`security_matrix.ts`/`policies.ts`.

### 3.8 Cache & RLS Invalidation Intelligence — the consistency spine

A **detect → notify → act** loop sitting over a three-tier backend cache.

**DETECT** — one SSE long-poll (`hooks/useCacheInvalidation.ts:287`) to `/cache-stream/stream`, a hand-rolled SSE parser over a `ReadableStream` (not `EventSource`, because EventSource can't send the `Authorization` header). Events: `connected | cache_invalidation | heartbeat`. **Fails soft**: 401/403 → `session_expired` + stop; 404/502/503 → silent soft-degrade; exponential reconnect capped, max 5 attempts. A dead stream never red-screens the app.

**NOTIFY** — `CacheInvalidationProvider` mounted ONCE (`layout.tsx:17`) owns the only intended stream. Per event it (1) re-gates RBAC: if any key ∈ `{GRANTS, USER_PERMISSIONS, ROLES, 'permissions'}` → `invalidateMyPermissions()`; (2) bumps `lastInvalidationAtom`. Fan-out without extra streams via `useOnCacheInvalidation(watchKeys, cb)` / `useCacheInvalidationSubscription`. **Key vocabulary anchor:** every `CacheKey.*` tag named in this doc (GRANTS, ROLES, USERS, USER_PERMISSIONS, `'permissions'`, SECURITY_MATRIX, ENTERPRISE_USERS, POLICIES, …) is a member of the single `CACHE_KEYS` enum **defined at `hooks/useCacheInvalidation.ts:10`** (the `gouvernance` block at `:37-46`), typed `export type CacheKey` **at `:153`** — which the comment notes "must match backend `CacheKey` enum exactly". The SSE stream itself is at `:287`; the key set it carries is `:10`.

**ACT** — `useCacheAwareQuery(fetchFn, {cacheKeys})` reads `lastInvalidationAtom`, marks `isStale` on a key match, debounces a refetch (~100 ms). Governance tables wire exact keys: Grants→`[GRANTS]`, Roles→`[ROLES]`, Users→`[USERS]`, User-grants→`[USERS, GRANTS]`.

**The three cache tiers** (`endpoint-cache-map.json`, `totalEndpoints:1019`, `cached:432`, `realtime:587`):

| Tier | Count | Semantics | Keying |
|---|---|---|---|
| `shared_cache` (SH) | 286 | account-global; **role gates access, not row-filtering** → one slot safe for all roles | `shared_query:{account}:{fn}` |
| `account_role_cache` (AR) | 31 | **role IS a row-filter** (RLS/masking/row-access) → one slot **per (account, role)** | role-keyed slot |
| `session_cache` (SE) | 115 | per-user/session data | session-keyed |

The **31 role-keyed slots** are dominated by governance RLS surfaces: `GET /gouvernance/policies` (ttl 300), `/policies/my-scope` (300), the whole `/policies/{masking,row-access,dmf,tags,…}` family, and `/roles/{role}/object-grants` (**ttl 60** — shortest, because grant lineage is the most security-sensitive). The backend does the equivalent of `USE ROLE <role>` before the read; the slot is keyed by role. Per-slot eviction for AR reads is **backend-internal** (not observable from the FE).

**The SVC warmer + `/admin/cache/*` control surface** (`services/cache/admin.ts`, UI `CacheGovernancePanel.tsx`): the SVC-first cache governance plane — `coverage` (warm-vs-cold per account→role + `uncovered_targets[]`), `svc-health` (`fallback_enabled` TRUE on prod = RED flag: reads can silently fall back to a user connection, defeating per-role RLS caching), `warm-status`, `warm` (manual, `per_role` bypasses the env gate), `invalidate-surface` (precise account-scoped eviction; `page` REQUIRED). **Why prod-only**: a role-keyed slot can only be *pre*-warmed by a process that can assume each role — a configured **service account** per account. In non-prod there's typically no SVC, so the entire surface is a **FORWARD CONTRACT** that 404/501s and self-degrades honestly. Mutating buttons gated `useCanPerform('gouvernance','grant')`, rendered **disabled never hidden**, fail-open on a permissions error.

**Governance posture** (`posture.ts`): `getComplianceScore` → GET `/gouvernance/compliance/score` (weighted masking/row-access/tagging) and `getAccessReviewSummary` → GET `/gouvernance/access-review/summary` (mfa gaps, expiring policies, orphan grants). Honest-degrade to `{available:false}` → "—", never a fake 0.

**Architecture gap**: the design intends ONE owning stream, but 10+ components still call the raw `useCacheInvalidation()` directly (e.g. `command-center/index.tsx:1926`, `admin/data360-config/page.tsx:1052`, `intelligent/snowpark-services-content.tsx:153/303/571/690`, `bi-dashboard/page.tsx:373`) — each opens its own `/cache-stream/stream` connection, duplicating what the subscription hook exists to eliminate.

A **second, distinct** hygiene seam (not a duplicate-stream bug): the Security-Matrix page (`governance/security-matrix/page.tsx:236-247`) does **not** open its own stream — it reads the shared `lastInvalidationAtom` — but it hand-rolls a `keys.includes(CACHE_KEYS.SECURITY_MATRIX/ENTERPRISE_USERS)` matcher instead of using `useCacheAwareQuery`/`useOnCacheInvalidation`. Correct behaviour, non-standard plumbing — it should migrate to the same primitives the governance tables use (§3.1/§3.8 ACT).

---

## 4. The Authoritative Governance Endpoint Catalogue

Source of truth: `endpoint-inventory` facet, cross-checked against `src/lib/api-contracts.ts` and `endpoint-cache-map.json`. **148** `gouvernance` ops + **9** contract-wired `/api/platform/grants/*` ops (8 FE-wired + 1 contract-only `byRole`; the `/roles` & `/data-scope` pairs = 4 OpenAPI-inventory-only ops, absent from contract+FE — §4.3, corrects the earlier "15") + 13 `/administration/*` + 6 `/access-requests/*` + 3 `/api/administration/entitlements*` + **18** standalone `/cache/*` ops (`cacheService` — service-wired but dormant/no-UI, §4.9). Separately catalogued, **not folded into the governance total**: the `/admin/cache/*` SVC surface (§4.9) and the ACCOUNTADMIN api-health/activity-stats tooling that *produces* the live-sweep evidence (5 ops, §4.11).

**Cache notation**: SH=shared_cache · AR=`@account_role_cache` (role-keyed) · SE=session_cache · `—`=mutation/no-cache. **Inval** = `CacheKey.*` SSE tag. **RBAC** = FE `useCanPerform` action gate (the backend admin gate is separate; see §5). **Verdict** keys: REAL(live)=HTTP-success as ACCOUNTADMIN in the live sweep · REAL(FE)=wired service+contract, backend Snowflake-backed but not live-exercised · PARTIAL=wired+honest degrade · STUB=no FE caller · BLOCKED=see §6.

> **Catalogue caveat**: the api-catalog `wired` flag is heuristic and **undercounts** — `grant-permission`/`revoke-permission`, d360-role `templates`/`effective`/`permissions`, and the network/password/session/aggregation policy CRUD all show `wired=False` yet have real FE callers (verified by grep). Function-level grep beats the flag.

### 4.1 USERS — `fetch_users.ts`, `user_roles.ts`, `index.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/users | getUsers (fetch_users.ts:54) | SH 1800 | view | REAL(live) |
| GET /gouvernance/users-with-roles | getUsersWithRolesAndModules (user_roles.ts:57) | SH 1800 · USERS | view | REAL(FE) |
| GET /gouvernance/users/{username} | getUserDetails/Raw (fetch_users.ts:40/179) | SH 1800 · USERS | view | REAL(FE) |
| GET /gouvernance/users/{username}/roles | contract only (no service GET) | SH 1800 · GRANTS | view | REAL (contract-only) |
| PUT /gouvernance/users/{username}/roles | updateUserRoles (user_roles.ts:82) | — | edit | REAL(FE) |
| POST /gouvernance/add-user | addUser (fetch_users.ts:125) | — | create | REAL(live) |
| DELETE /gouvernance/drop-user | deleteUser (fetch_users.ts:224) | — | delete | REAL(live) |
| POST /gouvernance/drop-users-batch | deleteMultipleUsers (fetch_users.ts:247) | — | edit | PARTIAL (seq fallback) |
| POST /gouvernance/enable_user/ | enableUser (fetch_users.ts:305) | — | edit | REAL(live) |
| POST /gouvernance/disable_user/ | disableUser (fetch_users.ts:283) | — | edit | REAL(live) |
| POST /gouvernance/assign-role | assignRoleToUser (fetch_users.ts:163) | — | edit | REAL(live); unwired in Users UI |
| DELETE /gouvernance/unassign-role | contract only (no caller) | — | delete | STUB-on-FE (backend real) |
| GET /gouvernance/roles-for-user/{username} | getRolesForUser (fetch_roles.ts:60) | SH 1800 · GRANTS | view | REAL(FE) |
| GET /gouvernance/user/mfa/status | getUserMfaStatus (index.ts:186) | SH 1800 · USERS | view | PARTIAL (probe-only) |
| POST /gouvernance/user/mfa/set | setUserMfa (index.ts:178) | — | edit | **BLOCKED (501 by design)** |
| PUT /gouvernance/enterprise-users/{username} | updateUser (fetch_users.ts:328) | — | edit | REAL(live) |

### 4.2 ROLES (System-1 + System-2) — `fetch_roles.ts`, `role_grants.ts`, `policies.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/roles | getRoles (fetch_roles.ts:13) | SH 1800 | view | REAL(live) |
| POST /gouvernance/add-role | addRole (fetch_roles.ts:42) | — | create | REAL(live) |
| DELETE /gouvernance/drop-role | deleteRole (fetch_roles.ts:120) | — | delete | REAL(live) |
| POST /gouvernance/drop-roles-batch | deleteMultipleRoles (fetch_roles.ts:145) | — | edit | REAL(FE)/PARTIAL |
| GET /gouvernance/roles/{role_name} | getRoleDetails (fetch_roles.ts:74) | SH 1800 · ROLES | view | REAL(FE) |
| GET /gouvernance/roles/edit/{role_name} | getRoleForEdit (fetch_roles.ts:96) | SH 1800 · ROLES | view | REAL(FE) |
| PUT /gouvernance/roles/{role_name} | updateRole (fetch_roles.ts:169) | — | edit | REAL(live); `modules` param has no UI |
| GET /gouvernance/d360-roles | getD360Roles (fetch_roles.ts:251) | SH 1800 · PERMISSIONS | view | REAL(FE) |
| GET /gouvernance/d360-roles/templates | getD360RoleTemplates (fetch_roles.ts:270) | SH 1800 | view | REAL(FE) |
| POST /gouvernance/d360-roles | createD360Role (fetch_roles.ts:286) | — | create | REAL(FE) |
| PUT /gouvernance/d360-roles/{role_name} | updateD360Role (fetch_roles.ts:300) | — | edit | REAL(FE) |
| DELETE /gouvernance/d360-roles/{role_name} | deleteD360Role (fetch_roles.ts:319) | — | delete | REAL(FE) |
| GET /gouvernance/d360-roles/action-registry | getActionRegistry (fetch_roles.ts:423) | SH 1800 | view | REAL(FE) |
| GET /gouvernance/d360-roles/my-permissions | getMyPermissions (fetch_roles.ts:440) + useCanPerform | **SE 300** | view (caller-scoped) | REAL(FE) |
| GET /gouvernance/d360-roles/effective/{username} | getEffectiveUserPermissions (fetch_roles.ts:503) | SH 1800 · PERMISSIONS | view | REAL(FE) |
| GET /gouvernance/d360-roles/{role_name}/permissions | getRolePermissions (fetch_roles.ts:544) | **SE 300** | view | REAL(FE) |
| PUT /gouvernance/d360-roles/{role_name}/permissions | setRolePermissions (fetch_roles.ts:579) | — | edit | REAL(FE); 403 on system roles |
| POST /gouvernance/d360-roles/{role_name}/apply-template | applyTemplate (fetch_roles.ts:624) | — | edit | REAL(FE) |
| GET /gouvernance/roles/{role}/least-privilege | getRoleLeastPrivilege (policies.ts:2112) | SH 1800 · GRANTS | view | REAL(FE) — advisory |
| POST /gouvernance/roles/{role}/grant-role | attachRole (role_grants.ts:103) | — | edit | REAL(FE) |
| DELETE /gouvernance/roles/{role}/grant-role | detachRole (role_grants.ts:116) | — | delete | REAL(FE) |
| GET /gouvernance/roles/{role}/object-grants | getRoleObjectGrants (role_grants.ts:74) | **AR 60** | view | REAL(FE) |
| POST /gouvernance/access-roles/from-objects | mintAccessRoleFromObjects (role_grants.ts:151) | — | edit | REAL(FE) |

### 4.3 GRANTS — `grants.ts`, `fetch_grants.ts`, `platform/grants.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/grants | getRoles (grants.ts:20) [role→module] | SH 1800 | view | REAL(FE) |
| PUT /gouvernance/update-grants | updateGrants (grants.ts:28) | — | edit | REAL(live) |
| GET /gouvernance/grants-for-role/{role_name} | getGrantsForRole (fetch_grants.ts:158) | SH 1800 | view | REAL(FE) |
| GET /gouvernance/grants-matrix | getPermissions (fetch_grants.ts:45) [batched] | SH 1800 | view | REAL(FE) |
| POST /gouvernance/grant-permission | grantPermission (fetch_grants.ts:171) | — | edit | REAL(FE) |
| POST /gouvernance/revoke-permission | revokePermission (fetch_grants.ts:199) | — | edit | REAL(FE) |
| GET /api/platform/grants | listGrants (platform/grants.ts:71) | un-cached | api:view | REAL(live) |
| POST /api/platform/grants | grantPage (platform/grants.ts:99) | — | api:edit | REAL(live) |
| DELETE /api/platform/grants | revokePage (platform/grants.ts:113) | — | api:delete | REAL(live) |
| GET /api/platform/grants/role/{role} | contract `byRole` (may serve stale) | — | api:view | REAL (contract-only) |
| GET /api/platform/grants/users | listUserGrants (platform/grants.ts:87) | — | api:view | REAL(live) |
| POST · DELETE /api/platform/grants/users | bindUser/unbindUser (platform/grants.ts:124/129) | — | api:edit/delete | REAL(live) |
| POST /api/platform/grants/actions | grantAction (platform/grants.ts:134) | — | api:edit | REAL(live) |
| POST /api/platform/grants/policies | grantPolicy (platform/grants.ts:145) | — | api:edit | REAL(live) |
| GET·POST /api/platform/grants/roles | — (NOT in contract `platform.grants`; no FE caller) | — | api:view/edit | STUB — inventory-only (OpenAPI-derived; endpoint-existence unverifiable from this checkout) |
| GET·POST /api/platform/grants/data-scope | — (NOT in contract `platform.grants`; no FE caller) | — | api:view/edit | STUB — inventory-only (OpenAPI-derived; endpoint-existence unverifiable from this checkout) |

> **`platform.grants` grounding (corrected):** `API.platform.grants` (`api-contracts.ts:1182-1197`) defines **6 builders** — `list`, `byRole`, `base` (POST+DELETE), `users` (GET+POST+DELETE), `actions`, `policies` — i.e. **9 method×path operations** grounded in the contract (8 with FE service callers in `platform/grants.ts`; `byRole` contract-only). It has **no `roles` or `data-scope` builder**, and `platform/grants.ts` has no caller for either. The two rows above (4 method×path ops) exist only in an OpenAPI snapshot, not in this checkout. The earlier "**15** `/api/platform/grants/*`" figure (§4 header) is therefore unsupported — see the corrected count there.

### 4.4 POLICIES — `policies.ts`, `dmf.ts`, `security_matrix.ts` (legacy RLS)
All policy CREATE/APPLY/REMOVE/REPLACE = query-param POSTs. Verdict REAL(FE) unless noted; backend Snowflake-backed but the *mutations* were not in the live sweep (the read-only D1/D2 previews were).
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/policies | listPoliciesEnriched/getRLSPolicies (policies.ts:60/364) | **AR 300** | view | REAL(FE) |
| GET /gouvernance/policies/my-scope | getMyScopePolicies (policies.ts:107) | **AR 300** | view (caller-scoped) | REAL(FE) |
| GET /gouvernance/policies/health | contract `policiesHealth` (probe) | **SE 30** | view | REAL (contract-only) |
| POST /gouvernance/policies/row-access | createRLSPolicy (policies.ts:408) | — | edit | REAL(FE) |
| GET /gouvernance/policies/row-access/{name}/details | getRLSPolicyDetails (policies.ts:344) | AR 300 | view | REAL(FE) |
| POST /gouvernance/policies/row-access/apply | applyRLSPolicy (policies.ts:439) | — | edit | REAL(FE) |
| POST /gouvernance/policies/row-access/remove | removeRLSPolicy (policies.ts:464) | — | edit | REAL(FE) |
| POST /gouvernance/policies/row-access/replace | replaceRLSPolicy (policies.ts:1942) | — | edit | **BLOCKED** (route absent → remove+apply) |
| POST /gouvernance/policies/row-access/simulate | simulateRowAccess (policies.ts:2055) | — | view | REAL(live) — D1 |
| POST /gouvernance/policies/masking | createMaskingPolicy (policies.ts:640) | — | edit | REAL(FE) |
| GET /gouvernance/policies/masking/{name}/details | getMaskingPolicyDetails (policies.ts:532) | AR 300 | view | REAL(FE) |
| POST /gouvernance/policies/masking/batch-details | getMaskingPolicyDetailsBatch (policies.ts:554) | — | view | REAL(FE) |
| POST /gouvernance/policies/masking/apply | applyMaskingPolicy (policies.ts:672) | — | apply | REAL(FE) |
| POST /gouvernance/policies/masking/remove | removeMaskingPolicy (policies.ts:698) | — | revoke | REAL(FE) |
| POST /gouvernance/policies/masking/replace | replaceMaskingPolicy (policies.ts:1885) | — | edit | **BLOCKED** (route absent → remove+apply) |
| POST /gouvernance/policies/masking/preview | previewMasking (policies.ts:2083) | — | view | REAL(live) — D2 |
| GET /gouvernance/policies/network/list | getNetworkPolicies (policies.ts:761) | AR 300 | view | REAL(FE) |
| POST /gouvernance/policies/network | createNetworkPolicy (policies.ts:806) | — | edit | REAL(FE) |
| DELETE /gouvernance/policies/network/{name} | deleteNetworkPolicy (policies.ts:833) | — | delete | REAL(FE) |
| POST /gouvernance/policies/network/{name}/set-default | setNetworkPolicyAsDefault (policies.ts:854) | — | edit | REAL(FE) |
| GET /gouvernance/policies/tags/list | getTags (policies.ts:886) | AR 300 | view | REAL(FE) |
| POST /gouvernance/policies/tags · /apply · /remove | createTag/applyTag/removeTag (policies.ts:916/938/964) | — | edit | REAL(FE) |
| DELETE /gouvernance/policies/tags/{name} | deleteTag (policies.ts:989) | — | delete | REAL(FE) |
| GET /gouvernance/policies/password/list | getPasswordPolicies (policies.ts:1021) | AR 300 | view | REAL(FE) |
| POST /gouvernance/policies/password (+ set-default) | createPasswordPolicy/setDefault (policies.ts:1062/1131) | — | edit | REAL(FE) |
| GET /gouvernance/policies/session/list | getSessionPolicies (policies.ts:1169) | AR 300 | view | REAL(FE) |
| POST /gouvernance/policies/session (+ set-default) | createSessionPolicy/setDefault (policies.ts:1202/1244) | — | edit | REAL(FE) |
| POST /gouvernance/policies/aggregation (+ apply/replace) | createAggregationPolicy/apply/replace (policies.ts:1338/1363/1999) | — | edit | REAL(FE); replace→remove+apply |
| DELETE /gouvernance/policies/aggregation/{db}/{schema}/{table} | removeAggregationPolicy (policies.ts:1406) | — | delete | REAL(FE) |
| PUT /gouvernance/policies/{type}/{name}/roles | assignPolicyToRoles (policies.ts:1523) | — | edit | REAL(FE) |
| PUT /gouvernance/policies/{type}/{name}/metadata | updatePolicyMetadata (policies.ts:1718) | — | apply | REAL(FE) |
| GET /gouvernance/policies/{type}/{name}/references | getPolicyReferences (policies.ts:1615) | **AR 120** | view | REAL(FE) |
| POST /gouvernance/policies/{type}/{name}/unapply-all | unapplyPolicyFromAll (policies.ts:1652) | — | edit | REAL(FE) |
| DELETE /gouvernance/policies/{type}/{name} | deleteRLSPolicy/deleteMaskingPolicy (policies.ts:489/724) | — | delete | REAL(FE) |
| GET /gouvernance/policies/objects/{databases\|schemas\|tables\|columns} | getDatabases/Schemas/Tables/Columns (policies.ts:1458-1479) | SH/AR 300 | view | REAL(FE) |
| GET /gouvernance/policies/objects/{db}/{s}/{t}/policies | getTablePolicies (policies.ts:1778) | n/a | view | REAL(FE) |
| GET /gouvernance/rls-policies | getRLSPolicies (security_matrix.ts:248) [legacy] | SH 1800 · POLICIES | view | REAL(FE) |
| POST /gouvernance/rls-policies | createRLSPolicy (security_matrix.ts:258) | — | edit | **BLOCKED** (FE POST → GET-only route) |

### 4.5 DMF & CLASSIFICATION — `dmf.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/policies/dmf/list | listDMFs (dmf.ts:108) | **AR 600** | view | REAL(FE) |
| POST /gouvernance/policies/dmf | createDMF (dmf.ts:121) | — | edit | REAL(FE) |
| GET /gouvernance/policies/dmf/{name}/details | describeDMF (dmf.ts:138) | AR 600 | view | REAL(FE) |
| DELETE /gouvernance/policies/dmf/{name} | deleteDMF (dmf.ts:150) | — | delete | REAL(FE) |
| POST /gouvernance/policies/dmf/associate · /disassociate | associateDMF/disassociateDMF (dmf.ts:163/184) | — | edit | REAL(FE) |
| POST /gouvernance/policies/dmf/schedule | setDMFSchedule (dmf.ts:203) | — | edit | REAL(FE) |
| GET /gouvernance/policies/dmf/references | getDMFReferences (dmf.ts:217) | **AR 300** | view | REAL(FE) |
| GET /gouvernance/policies/dmf/all-references | — (no FE caller) | AR 300 | view | STUB |
| POST /gouvernance/policies/classification/classify | classifyTable (dmf.ts:233) | — | edit | REAL(FE) |
| POST …/classification/extract-categories · /apply-tags | extractSemanticCategories/applySemanticTags (dmf.ts:245/257) | — | edit/apply | REAL(FE) |
| POST …/classification/classifiers (+ /{name}/regex) | createCustomClassifier/addClassifierRegex (dmf.ts:269/284) | — | edit | REAL(live) |
| POST /gouvernance/policies/pii-scan | — (no FE caller) | — | edit | STUB |

### 4.6 SECURITY-MATRIX (+ axes) — `security_matrix.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| POST /gouvernance/security-matrix/init | initializeSecurityMatrix (security_matrix.ts:124) | — | edit | REAL(live); api-health only, not the page |
| GET /gouvernance/security-matrix | getSecurityMatrix (security_matrix.ts:129) | SH 1800 | view | REAL(live) |
| POST /gouvernance/security-matrix | createSecurityMatrixEntry (security_matrix.ts:135) | — | edit | REAL(FE) |
| POST /gouvernance/security-matrix/bulk | bulkCreateSecurityMatrixEntries (security_matrix.ts:142) | — | edit | REAL(FE); dormant |
| PUT /gouvernance/security-matrix/{entry_id} | updateSecurityMatrixEntry (security_matrix.ts:151) | — | edit | REAL(FE); imported but never invoked |
| DELETE /gouvernance/security-matrix/{entry_id} | deleteSecurityMatrixEntry (security_matrix.ts:159) | — | delete | REAL(live) |
| DELETE /gouvernance/security-matrix/role/{role_name} | deleteSecurityMatrixByRole (security_matrix.ts:164) | — | delete | REAL(FE); dormant |
| PUT /gouvernance/security-matrix/batch | batchUpdateSecurityMatrix (security_matrix.ts:171) | — | edit | REAL(FE) — "Save All" |
| GET /gouvernance/security-axes | getSecurityAxes (security_matrix.ts:180) | SH 1800 · SECURITY_MATRIX | view | REAL(live) |
| POST·PUT·DELETE /gouvernance/security-axes[/{axis_id}] | createSecurityAxis/updateSecurityAxis/deleteSecurityAxis (security_matrix.ts:186/191/196) | — | edit/delete | REAL(FE) |

### 4.7 IDENTITY & INTEGRATIONS — `index.ts`, `security_matrix.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/gui-permissions | listGuiPermissions (index.ts:214) | SH 1800 · GRANTS | view | REAL(FE) |
| POST /gouvernance/gui-permissions | upsertGuiPermission (index.ts:222) | — | edit | REAL(live) |
| GET /gouvernance/gui-permissions/my-access | getMyPageAccess (index.ts:237) | **SE 120** | view (caller-scoped) | REAL endpoint; **no runtime guard consumes it (advisory)** |
| GET /gouvernance/gui-permissions/effective/{username} | getUserEffectiveGuiAccess (index.ts:258) | SH 1800 · GRANTS | view | REAL — consumed by AccessTab by-user view |
| DELETE /gouvernance/gui-permissions/{permission_id} | deleteGuiPermission (index.ts:268) | — | delete | REAL(FE) |
| GET /gouvernance/oauth/integrations | listOAuthIntegrations (index.ts:311) | SH 1800 | view | REAL(FE) |
| POST /gouvernance/oauth/integrations | createOAuthIntegration (index.ts:366) | — | edit | REAL(FE) — EXTERNAL_OAUTH only |
| GET /gouvernance/oauth/network-policies | listNetworkPolicies (index.ts:322) | SH 1800 | view | REAL (api-health-wired in this facet) |
| GET /gouvernance/oauth/api-keys | listApiKeys (index.ts:333) | SH 1800 | view | REAL(FE) |
| POST /gouvernance/oauth/service-users | createServiceUser (index.ts:389) | — | edit | REAL(live) |
| POST /gouvernance/oauth/assign-rsa-key | assignRSAKey (index.ts:397) | — | apply | REAL(FE) |
| DELETE /gouvernance/oauth/revoke-rsa-key/{username} | revokeRSAKey (index.ts:404) | — | revoke | REAL(live) |
| POST /gouvernance/oauth/saml-integrations | createSAMLIntegration (index.ts:375) | — | edit | REAL endpoint; **UI STUB (probe-only)** |
| GET /gouvernance/enterprise-users | getEnterpriseUsers (security_matrix.ts:202) | SH 1800 · ENTERPRISE_USERS | view | REAL(live) |
| PUT /gouvernance/enterprise-users/{username} | updateEnterpriseUser (security_matrix.ts:210) | — | edit | REAL(live via updateUser) |
| DELETE /gouvernance/enterprise-users/{username} | deleteEnterpriseUser (security_matrix.ts:218) | — | delete | REAL(FE) — directory-only |
| POST /gouvernance/enterprise-users/sync | syncEnterpriseUsers (security_matrix.ts:223) | — | edit | REAL(live) |

### 4.8 POSTURE / DASHBOARD — `posture.ts`, `index.ts`
| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /gouvernance/compliance/score | getComplianceScore (posture.ts:69) | SH 1800 | view (caller-scoped) | REAL(FE) |
| GET /gouvernance/access-review/summary | getAccessReviewSummary (posture.ts:126) | SH 1800 | view | REAL(FE) |
| GET /gouvernance/client/dashboard | getClientDashboardInfo (index.ts:117) | SH 1800 · USER_ACTIVITY | view | REAL(FE) |
| GET /gouvernance/dashboard/activity · /errors | getAllUsersActivity/getDashboardErrors (index.ts:133/159) | SH 1800 · USER_ACTIVITY | view | REAL(FE) |
| GET /gouvernance/get_dwh_{storage_info,schemas,health_info} | getDwh* (index.ts:71/100/108) | SH 1800 | view | REAL(FE) |

### 4.9 CACHE GOVERNANCE — `services/cache/admin.ts`
| Method · Path | FE fn (file:line) | RBAC | Verdict |
|---|---|---|---|
| GET /cache-stream/stream | useCacheInvalidation (useCacheInvalidation.ts:287) | (auth) | REAL (FE-wired) |
| GET /cache-stream/stats · /cache/kpis | getCacheStreamStats/getCacheKpis (admin.ts:184/175) | gouvernance:view | REAL(FE) / backend unverified |
| GET /admin/cache/coverage · /svc-health · /warm-status | getCacheCoverage/getCacheSvcHealth/getCacheWarmStatus (admin.ts:57/80/111) | gouvernance:view | **BLOCKED (forward-contract, prod/SVC-only)** |
| POST /admin/cache/warm · /invalidate-surface | warmCacheSurface/invalidateCacheSurface (admin.ts:133/157) | gouvernance:grant | **BLOCKED (forward-contract, prod/SVC-only)** |
| GET /admin/service-account/health · /admin/svc-registry | getServiceAccountHealth/getSvcRegistry (admin.ts:196/203) | gouvernance:view | REAL(FE) / backend unverified |

**Second cache surface — the standalone `/cache/*` router (`API.cacheService`, contract `api-contracts.ts:1266-1285`).** Distinct from `admin.cache` (`/admin/cache/*` above) and from `/cache-stream/*`: this is the SVC-first cache observability + control router, a **W6 reintegration of a previously-unwired backend family**. All 18 ops are wired as a service (`services/admin-cache/index.ts:41-63`, `export const cacheService`), but **no UI component imports `cacheService`** (grep: only the contract + the service file reference it) — so the family is **service-wired, dormant (no UI consumer)**. Verdict REAL(FE) on the read path (typed service + real backend); control mutations admin-gated.

| Method · Path | FE fn (file:line) | RBAC | Verdict |
|---|---|---|---|
| GET /cache/stats | cacheService.stats (admin.ts:43) | (auth) | REAL(FE) — dormant (no UI) |
| GET /cache/health | cacheService.health (admin.ts:44) | (auth) | REAL(FE) — dormant |
| GET /cache/svc-health | cacheService.svcHealth (admin.ts:45) | (auth) | REAL(FE) — dormant |
| GET /cache/performance | cacheService.performance (admin.ts:46) | (auth) | REAL(FE) — dormant |
| GET /cache/dashboard | cacheService.dashboard (admin.ts:47) | (auth) | REAL(FE) — dormant |
| GET /cache/breakdown | cacheService.breakdown (admin.ts:48) | (auth) | REAL(FE) — dormant |
| GET /cache/invalidations | cacheService.invalidations (admin.ts:49) | (auth) | REAL(FE) — dormant |
| GET /cache/keys | cacheService.keys (admin.ts:50) | (auth) | REAL(FE) — dormant |
| GET /cache/keys/{key} | cacheService.keyValue (admin.ts:51) | (auth) | REAL(FE) — dormant |
| GET /cache/test-connection | cacheService.testConnection (admin.ts:52) | (auth) | REAL(FE) — dormant |
| GET /cache/refresh/status | cacheService.refreshStatus (admin.ts:53) | (auth) | REAL(FE) — dormant |
| POST /cache/clear/pattern | cacheService.clearPattern (admin.ts:56) | admin (mutation) | REAL(FE) — dormant |
| POST /cache/clear/all | cacheService.clearAll (admin.ts:57) | admin (mutation) | REAL(FE) — dormant |
| POST /cache/warmup | cacheService.warmup (admin.ts:58) | admin (mutation) | REAL(FE) — dormant |
| POST /cache/warmup/trigger | cacheService.warmupTrigger (admin.ts:59) | admin (mutation) | REAL(FE) — dormant |
| POST /cache/refresh/start | cacheService.refreshStart (admin.ts:60) | admin (mutation) | REAL(FE) — dormant |
| POST /cache/refresh/stop | cacheService.refreshStop (admin.ts:61) | admin (mutation) | REAL(FE) — dormant |
| POST /cache/refresh/trigger/{job} | cacheService.refreshTrigger (admin.ts:62) | admin (mutation) | REAL(FE) — dormant |

### 4.10 ADMINISTRATION & ACCESS-REQUESTS — `admin-platform-health.ts`, `admin-performance/index.ts`, `entitlements.ts`, `access-requests/index.ts`
**Sweep scope (evidence basis):** none of the `/administration/*`, `/api/administration/entitlements*`, or `/access-requests/*` routes were in the governance-scoped ACCOUNTADMIN api-health sweep that §1 leans on — so **every verdict here is FE-wiring-grounded (REAL(FE)), not live-proven**, with PARTIAL where the service honest-degrades on 404/501. The entitlements paths are built from a **hardcoded `PREFIX = '/api/administration'` (`entitlements.ts:33`), NOT `API.*`** — they are absent from `api-contracts.ts` (whose `:1205-1258` covers only `accessRequests` + `administration.performance/platformHealth`).

| Method · Path | FE fn (file:line) | Cache | RBAC | Verdict |
|---|---|---|---|---|
| GET /administration/performance/{account}/{overview,by-endpoint,by-user,by-cache,by-module,errors,user/{username}} | getPerfOverview/ByEndpoint/ByUser/ByCache/ByModule/Errors/UserDetail (admin-performance/index.ts:142/145/148/151/154/157/160) | SH 1800 · QUERY_PERFORMANCE | administration:view | REAL(FE) — honest 404 degrade (NotDeployedError) |
| GET /administration/platform-health | getPlatformHealth (admin-platform-health.ts:211) | SH 600 | administration:view | REAL(FE) — runs on caller's own conn (no SVC); 404/501 → NotDeployedError |
| GET /administration/performance/{by-tab,tab/{tab},audit/by-account,events,events/feed} | — (no FE caller) | — | administration:view | STUB |
| GET /api/administration/entitlements · /governance-posture | getEntitlements/getGovernancePosture (entitlements.ts:185/191) | SH 1800 | api:view · can_govern | PARTIAL (NotDeployedError honest degrade) |
| PUT /api/administration/entitlements/{module}/{feature_key} | setEntitlement (entitlements.ts:200) | — | api:edit · can_govern | PARTIAL |
| POST /access-requests | createAccessRequest (access-requests/index.ts:67) | — | access-requests:edit | REAL(FE) |
| GET /access-requests/{mine,inbox,all} | getMyRequests/getInbox/getAllRequests (access-requests/index.ts:84/101/115) | live/un-cached | access-requests:view | REAL(FE) (`/all` admin-only) |
| POST /access-requests/{id}/{approve,deny} | approveRequest/denyRequest (access-requests/index.ts:137/160) | — | access-requests:edit | REAL(FE) |

### 4.11 ADMIN API-HEALTH & ACTIVITY TOOLING (evidence-producing, ACCOUNTADMIN-gated) — `admin-api-health/index.ts`, `admin-visibility/index.ts`
Catalogued for completeness (see §1 scope note); these are platform-ops/observability that *produce* the live-sweep evidence, **not** counted in the governance totals. Contract: `API.admin.*` (`api-contracts.ts:855-913`).
| Method · Path | FE fn (file:line) | RBAC | Verdict |
|---|---|---|---|
| POST /admin/api-health/runs | persistApiHealthRun (admin-api-health/index.ts:153) | accountadmin | REAL(FE) — honest 404/501 degrade |
| GET /admin/api-health/runs | listApiHealthRuns (admin-api-health/index.ts:172) | accountadmin | REAL(FE) |
| GET /admin/api-health/runs/{run_id} | getApiHealthRunDetail (admin-api-health/index.ts:187) | accountadmin | REAL(FE) |
| GET /admin/api-health/introspect?query_id= | QueryIntrospect drill-panel (`API.admin.apiHealthIntrospect`, api-contracts.ts:863) | accountadmin | REAL(FE) — may 404/501 until live |
| GET /admin/activity-stats | getActivityStats (admin-visibility/index.ts:62, literal path) | admin | REAL(FE) |

---

## 5. The Two-Tier Role Model — the truth that governs testing

There are **two completely different things both called "role"** in this codebase. Conflating them is the single biggest source of false confidence in governance testing.

### Tier 1 — Real Snowflake account roles (System 1)
- Managed by the **Roles page** via real DDL: `CREATE/DROP ROLE`, `GRANT/REVOKE ROLE`, `GRANT/REVOKE <priv>`.
- These are the roles Snowflake itself enforces: object grants, role hierarchy, and **RLS/masking filtering execute under one of these roles** on the read path.
- Examples present as real SF roles: `ACCOUNTADMIN`, `SYSADMIN`, `SECURITYADMIN`, `USERADMIN`, `ORGADMIN`, `PUBLIC`, plus customer roles like `BI_ANALYST`, `DATA_MODELER`.

### Tier 2 — App-only "D360 roles" (System 2)
- Defined/served entirely by the **backend permission store** (`D360_ROLE_ACTIONS`) and consumed via `getD360Roles`, the action-registry, `my-permissions`, and `setRolePermissions`.
- They drive `useCanPerform` (the FE button gating) and the backend `require_action` gate — but they are **not necessarily backed by a Snowflake role**.

### The degradation truth (project memory — flagged unverified)
Per project memory: **only `BI_ANALYST` + `DATA_MODELER` are backed by real Snowflake roles**; the other "system" D360 roles are app-only and **degrade to `ACCOUNTADMIN` data** when reading from Snowflake (because there is no real SF role to `USE`).

> **This claim is project memory, not FE-verified.** In fact the Roles facet found **no `BI_ANALYST` anywhere in the FE** — the FE business-role constants (`config/constants.ts:45-64`) list `DATA_MODELER, DATA_ANALYST, DATA_STEWARD, AI_ENGINEER, FINOPS_MANAGER, QA_ENGINEER, BUSINESS_USER`. The set of "system" D360 roles is returned by the backend `getD360Roles` and **cannot be enumerated from this checkout**. Treat the degradation behaviour as a backend property to verify against the live backend, not a settled FE fact.

### What this means for testing/validation
1. **A green test as `ACCOUNTADMIN` proves the endpoint is reachable, NOT that per-role RLS filters rows.** ACCOUNTADMIN sees everything; RLS is a no-op for it. To prove RLS, you must log in as a **real Snowflake role** that is genuinely subject to the row-access policy (e.g. `BI_ANALYST` / `DATA_MODELER`) — not an app-only D360 role that silently degrades to ACCOUNTADMIN data.
2. **The live api-health sweep ran as ACCOUNTADMIN** — so every "live-proven" verdict in §4 means "the route accepts an authorized admin call," never "the RLS predicate is correct for a non-admin role."
3. **Persona testing requires real SF-role credentials + MFA**, which is why prior governance e2e runs all effectively ran as HAHA/ACCOUNTADMIN. RLS correctness for a downscoped role is **not** covered by the existing harness.
4. **The admin-bypass sets diverge** (see §3.7): the sidebar admin branch omits `securityadmin`; CLAUDE.md/useAuth use `{ACCOUNTADMIN, SYSADMIN, SECURITYADMIN}`. A SECURITYADMIN tester gets the full menu only via backend bypass — don't assume the sidebar reflects the real authz set.

---

## 6. REAL vs STUB vs BLOCKED Matrix

**Definitions** (one definition, used consistently):
- **REAL** — fully wired FE → live backend; either live-proven (HTTP success as ACCOUNTADMIN) or FE-wired with a contract-confirmed backend that simply wasn't exercised by the live sweep.
- **STUB** — the FE surface exists but there is no backend behaviour behind it (or no FE caller behind a contract entry); a button/route that does nothing real.
- **BLOCKED** — the capability cannot currently be exercised through the intended path, for a *specific reason*. Six reasons appear; each BLOCKED item is annotated.

### BLOCKED — by reason
| Capability | File / endpoint | Reason | Annotation |
|---|---|---|---|
| Per-user MFA toggle | `setUserMfa` → POST `/gouvernance/user/mfa/set` | **by-design** | Returns **501**; per-user MFA unsupported — users self-enrol, admins enforce at account level (`PATCH /org-accounts/.../mfa`). |
| System-role permission writes | `setRolePermissions` → PUT `/d360-roles/{role}/permissions` | **by-design** | Returns **403** for system roles; only CUSTOM D360 roles are editable. |
| Policy **replace** (masking/rls/aggregation) | `/{type}/replace` (policies.ts:1885/1942/1999) | **by-design (route absent)** | No `/replace` route exists; FE falls back to remove+apply → functionally REAL, but a brief window leaves the object unprotected. |
| `/admin/cache/*` SVC governance surface + warmer | coverage/svc-health/warm-status/warm/invalidate-surface (`admin.ts`) | **prod-only / forward-contract** | 404/501 on any backend without a configured service account; UI self-degrades honestly. The role-keyed cache can only be *pre-*warmed where an SVC can assume each role. |
| Backend `require_action` enforcement | (FastAPI, not in checkout) | **unverifiable-from-FE** | Inferred REAL from EnforcedBanner + GOVERNANCE_DENIED 403 + live ORGADMIN authz; the FE gate is advisory. |
| **Matrix → actual RLS enforcement** | SECURITY_MATRIX table → row-access policy | **unverifiable-from-FE** | NO FE code path turns a matrix entry into a row-access policy. The matrix→filtering binding, if it exists, is **backend-only** (mapping-table RLS pattern). Editing the matrix does NOT itself enforce filtering. |
| Per-slot `@account_role_cache` eviction | AR-tier reads (`invalidation:None` in cache-map) | **unverifiable-from-FE** | How a policy/grant mutation evicts the right per-role slot is backend-internal. |
| Legacy RLS create from Security-Matrix service | `createRLSPolicy` (`security_matrix.ts:258`) | **broken** | FE POSTs to a route the backend serves only as GET; in-code TODO says use `policies.ts`. |
| `createSAMLIntegration` | POST `/gouvernance/oauth/saml-integrations` (index.ts:375) | **unwired-real-endpoint** | Endpoint REAL; only the api-health probe calls it. The OAuth wizard emits EXTERNAL_OAUTH only despite the "SAML/SCIM" tab label. (Classified BLOCKED rather than STUB because the backend capability is real — it's the UI that's missing.) |
| `/access-requests/all`, `/api/platform/grants*` | (admin/super-admin gated) | **by-authz** | Require account-admin / `{ACCOUNTADMIN,ORGADMIN,SECURITYADMIN}`; "blocked" only for non-admins — expected authz, not a defect. |

### STUB (contract/UI exists, no real behaviour behind it on the FE)
- `unassign-role` (DELETE `/gouvernance/unassign-role`) — contract const only, no service caller; removal is done by sending a shorter list to `updateUserRoles`.
- "Import Users" / "Import Roles" buttons — generic CSV `FileUpload` modal, no ingest endpoint.
- GUI page-access as an *enforcement mechanism* — `EnforcementBanner` states "Not Enforced" (visibility hints only; real enforcement is Action-RBAC + module gating).
- `policies/dmf/all-references`, `policies/pii-scan`, `platform/grants/roles`, `platform/grants/data-scope`, administration `by-tab`/`tab/{tab}`/`audit/by-account`/`events`/`events/feed` — catalog op exists, no FE caller.

### Cross-facet conflicts — reconciled (tie-breaker: endpoint-inventory is authoritative for endpoint-reality; per-facet maps are authoritative for UI-wiring; "real endpoint + unwired UI" coexist)
- **`assign-role`**: Users facet said "BLOCKED (no UI caller)"; inventory says REAL/live-proven. → **REAL endpoint, live-proven; unwired in the Users UI.** (Not flatly BLOCKED.)
- **`getMyPageAccess` / `/gui-permissions/my-access`**: Grants facet said "BLOCKED (unwired)"; inventory says REAL. → **REAL endpoint; no runtime guard consumes it (advisory).**
- **`gui-permissions/effective/{username}`**: module-rbac facet said "no live UI"; Grants facet names the consumer (AccessTab by-user view, `data360-config:1017`). → **REAL + wired (AccessTab wins — it names the consumer).**

---

## 7. How to USE It — Operator Playbook

Each recipe lists the **page**, the **FE action gate**, the **endpoint**, and **the invalidation that follows**. Steps that change the real Snowflake account / backend store are flagged **⚠ MUTATES REAL ACCOUNT**. All mutations also require the backend to authorize the call (ACCOUNTADMIN-gated for governance writes) — the FE gate alone is not sufficient.

### 7.1 Create a user (optionally with a role)
- **Page**: `/governance/users` → "Add User".
- **Gate**: `useCanPerform('gouvernance','create')`.
- **Endpoint**: `POST /gouvernance/add-user` `{username, password, email, role?}`. ⚠ MUTATES REAL ACCOUNT (creates a Snowflake user; chains a `GRANT ROLE` if `role` set).
- **Invalidation**: `addUser` calls `invalidateMyPermissions()`; the `USERS` SSE key drops the users-list cache → `UsersTable` (`useCacheAwareQuery([USERS])`) refetches in ~100 ms.
- **Notes**: empty role is dropped (never `role:""`). A `role_error` on a 2xx is a *non-fatal* warning — the user IS created. To create a programmatic/service user instead, use `/governance/oauth` → "Create Service User" (`POST /gouvernance/oauth/service-users`, gate `create`).

### 7.2 Create a role and grant it
**(a) Create a real Snowflake role**
- **Page**: `/governance/roles` → "Add Role". **Gate**: `gouvernance:create`. **Endpoint**: `POST /gouvernance/add-role` `{role_name}`. ⚠ MUTATES REAL ACCOUNT (`CREATE ROLE`).
- **Invalidation**: `addRole` → `invalidateMyPermissions()`; `ROLES` SSE key → roles table refetch.

**(b) Grant the role to a user**
- **Page**: `/governance/grants` → Tab 3 "User Grants" (full role-set replace). **Gate**: backend (no FE `useCanPerform` in `user-grants/table.tsx`). **Endpoint**: `PUT /gouvernance/users/{username}/roles` `{roles:[…]}`. ⚠ MUTATES REAL ACCOUNT (`GRANT/REVOKE ROLE` to reconcile the set).
- **Invalidation**: `updateUserRoles` → `invalidateMyPermissions()`; `USERS`+`GRANTS` keys.
- **Alternative**: `POST /gouvernance/assign-role` `{username, role_name}` is REAL + live-proven but **has no UI** in the Users facet — reachable only via the Grants/api surface.

**(c) Grant a role access to modules (sidebar/feature visibility)**
- **Page**: `/governance/grants` → Tab 1 "Role Grants". **Gate**: `gouvernance:grant`. **Endpoint**: `PUT /gouvernance/update-grants` `{role_name, modules[]}`. ⚠ MUTATES REAL ACCOUNT (backend persists role→module map).
- **Invalidation**: `updateGrants` → `invalidateMyPermissions()` + `refetch()`; `GRANTS` SSE key re-gates every open tab. "Changes take effect on next user login" for the target users' sidebars.

**(d) Build a granular D360 (action) role**
- **Page**: `admin/data360-config` → Action RBAC tab (editor), or `/governance/grants` Tab 6 (CRUD). **Gate**: `gouvernance:create`/`edit`. **Endpoints**: `POST /gouvernance/d360-roles` (create, custom only) then `PUT /gouvernance/d360-roles/{role}/permissions` (wholesale DELETE+re-INSERT of the matrix). ⚠ MUTATES the backend permission store (`D360_ROLE_ACTIONS`) — **403 on system roles**.
- **Invalidation**: every d360 mutation → `invalidateMyPermissions()`; the editor's confirm dialog shows **blast radius** (users holding the role). Use the "test as user" preview (`GET /d360-roles/effective/{username}`) to confirm `db`/`matrix` (explicit) vs `default` (fail-open) provenance before saving.

### 7.3 Bind a security-matrix axis (role × data-scope)
- **Page**: `/governance/security-matrix` → Access Matrix tab → "Add" (or inline-edit + "Save All").
- **Gate**: delete is `useCanPerform('gouvernance','delete')`; create/save rely on the backend gate.
- **Endpoints**: add → `POST /gouvernance/security-matrix` `{role_name, axes{region_id,store_id,department_id,product_category,customer_segment}, access_level}`; batch save → `PUT /gouvernance/security-matrix/batch`. ⚠ MUTATES REAL ACCOUNT (writes rows into the physical `SECURITY_MATRIX` table). A `null` axis = "all".
- **Invalidation**: every matrix create/delete/batch-save → `invalidateMyPermissions()` (`page.tsx:288/305/328`); the `SECURITY_MATRIX` SSE key → matrix+axes refetch via the page's **manual `lastInvalidationAtom` subscriber** (`page.tsx:236-247`), NOT `useCacheAwareQuery` (see §3.5 "Refetch mechanism (corrected)").
- **⚠ CRITICAL CAVEAT**: binding a matrix axis writes the `SECURITY_MATRIX` mapping table but **does NOT itself create or apply a row-access policy**. Whether those rows actually filter data depends on a backend row-access policy that joins the protected table against `SECURITY_MATRIX` — which is **not created by this page** and is **unverifiable from the FE** (§6). Do not assume "I edited the matrix" ⇒ "rows are now filtered." To actually enforce RLS, also apply a row-access policy via the Policies page (7.4) or confirm the backend mapping-table policy exists.

### 7.4 Apply an RLS (row-access) or masking policy
**(a) Create the policy**
- **Page**: `/governance/policies` → RLS or Masking tab → create form. **Gate**: `gouvernance:create`. **Endpoint**: `POST /gouvernance/policies/row-access` (or `/masking`) — query-param POST. ⚠ MUTATES REAL ACCOUNT (`CREATE … POLICY` DDL).

**(b) Apply it to an object (the slow, real step)**
- **Gate**: `gouvernance:apply`. **Flow**: "Preview apply" first reads the target's existing policies (`getTablePolicies` → GET `/policies/objects/{db}/{s}/{t}/policies`) and surfaces conflicts in a `ConfirmDialog` (honest client-side dry-run — there is no backend dry-run). Only "Confirm" runs ⚠ `POST /gouvernance/policies/row-access/apply` (needs `policy_column`) / `/masking/apply` — real Snowflake DDL, slow (a live elapsed-ms timer runs).
- **Invalidation**: `POLICIES` SSE key → policy tabs (`useCacheAwareQuery([POLICIES])`) refetch; the backend evicts the relevant **per-role `@account_role_cache` slots** (eviction is backend-internal).
- **Verify (read-only, ~0 credits)**: D1 "who-can-see" `POST /row-access/simulate` and D2 masked-vs-unmasked `POST /masking/preview` (both live-proven) confirm the effect for a given role/user before trusting it. To test RLS for real, run the simulate/preview under a **real downscoped SF role**, not ACCOUNTADMIN (§5).

**(c) Assign the policy to roles**
- **Page**: `/governance/grants` → Tab 4 "Policy Grants" → AssignPolicyModal. **Endpoint**: `PUT /gouvernance/policies/{type}/{name}/roles` `{roles}`. ⚠ MUTATES REAL ACCOUNT.

### 7.5 Edit a page-access hint (advisory only)
- **Page**: `admin/data360-config` → Access tab. **Gate**: `gouvernance:grant`. **Endpoint**: `POST /gouvernance/gui-permissions` (cycle NONE→READ→WRITE). **Invalidation**: `GRANTS` SSE key.
- **⚠ NOT ENFORCEMENT**: the page's own `EnforcementBanner` says these are "Page Visibility Hints (Not Enforced)… they do not enforce API access." Real gating is Action-RBAC + module config + backend 403. Do not use this as an access control.

### 7.6 Operate the role-keyed cache (prod/SVC only)
- **Page**: Administration → Access Center → Cache Governance. **Gate**: `useCanPerform('gouvernance','grant')` (disabled never hidden, fail-open).
- **Endpoints**: read `GET /admin/cache/coverage|svc-health|warm-status`; act `POST /admin/cache/warm` (`per_role:true` warms one slot per active role) / `POST /admin/cache/invalidate-surface` (`page` REQUIRED; route a real eviction through the destructive ConfirmDialog; `dry_run` available). ⚠ MUTATES cache state (warm = read-only side effects; invalidate = drops slots).
- **Reality check**: this whole surface is a forward-contract — it 404/501s and shows "not available on this backend" unless a service account is configured. **`fallback_enabled=TRUE` on a prod box is a RED flag** (reads silently fall back to a user connection, defeating per-role RLS caching).

---

## 8. Open Questions / Gaps to Close

**Security-correctness (highest priority):**
1. **Matrix → RLS enforcement is unproven.** No FE path turns a `SECURITY_MATRIX` row into a row-access policy. Confirm against the backend whether a mapping-table row-access policy actually exists and is applied to the retail tables — otherwise the Security-Matrix page is a catalog that enforces nothing. *(BLOCKED: unverifiable-from-FE.)*
2. **Fail-open-on-403 risk.** A 403 from `/my-permissions` is wrapped into `AuthorizationError` with no `.response`, so `isCacheNotReady` (which only special-cases 503) can't see it → `cacheError=true` → `allowed:true`. If `/my-permissions` ever 403s, **every action on every module fails open** on the FE (backend `require_action`/RLS still blocks the actual mutation, but the UX over-promises). Confirm the backend truly degrades `/my-permissions` to a safe template instead of 403 for low-priv users (api-catalog tags it `gouvernance:view`, which would 403 a user lacking that — a contradiction that can't be resolved from this checkout).
3. **RLS is only ever tested as ACCOUNTADMIN.** Stand up a persona harness with real downscoped SF-role credentials (+ MFA) so D1/D2 simulate/preview and live reads actually exercise the row-access predicate. The "BI_ANALYST/DATA_MODELER are the only real SF roles" memory must be verified against the live backend (no `BI_ANALYST` exists in the FE).

**Backend verifiability (not in this checkout):**
4. Per-route backend admin gate (`require_accountadmin` vs `require_role`) is inferred from the live ACCOUNTADMIN sweep + contract comments, not read from source. The api-catalog `rbac` field only encodes the FE `useCanPerform` action, not the backend admin gate.
5. Policy mutation routes (createRLS/Masking/Network/etc.) are REAL-on-FE but were **not** exercised by the live sweep (only read-only simulate/preview + user/role/matrix/identity mutations were). Their backend is presumed Snowflake-backed but live-unverified.
6. Per-slot `@account_role_cache` eviction (which mutation emits which key, how the right per-role slot drops) is backend-internal and unobservable from the FE.

**FE hygiene / latent bugs:**
7. **SSE stream duplication**: 10+ components call raw `useCacheInvalidation()` instead of the subscription hook, each opening its own `/cache-stream/stream`. Migrate them to `useCacheInvalidationSubscription` / `useOnCacheInvalidation`.
8. **FE gate granularity loss**: `isAllowed` matches module+action only (ignores page/tab) and treats missing `access_level` as ALLOW — DENY rows and page/tab scoping in the stored matrix are not honored client-side. The `module` arg footgun (action-registry key ≠ `MODULES.apiName`) silently mis-gates.
9. **Divergent constants**: the `useAuth.MODULE_ID_MAP` vs `modules.ts` ID mismatch (inert only because `allowedModules` has zero consumers); the sidebar admin-role list omits `securityadmin`; `SNOWFLAKE_TOKEN_LIFETIME_MS ≈ 19h` contradicts its "55 min" comment and exceeds the 8h `maxAge`.
10. **Dead/orphan code**: `config/constants.ts:85 ROLE_PERMISSIONS` (zero consumers) must not be mistaken for the live mapping; `identity-integrations.ts` is orphaned (duplicates live clients — drift risk); `updateSecurityMatrixEntry` is imported but never invoked; `updateRole`'s `modules` param has no UI; `updateUser`'s "fallback to PUT /users/{username}" docstring is stale (no fallback exists).
11. **Catalogue accuracy**: the api-catalog `wired` flag undercounts (grant/revoke-permission, d360 templates/effective/permissions, network/password/session/aggregation CRUD all show `wired=False` but have real callers). `endpoint-file-map.json` mis-attributes `policies/network` + `policies/password` to `dmf.ts`. Three `index.ts` callers (`get_user_info`, `get_stage_storage_info`, `get_src_table_storage_info`) hit routes not in the current OpenAPI snapshot — likely legacy/removed.

---

*End of map. Cited file:line references are relative to `apps/data360/src/`. Backend behaviour beyond the `/api-proxy` boundary is grounded in FE service code + contracts + the live ACCOUNTADMIN api-health sweep, and is marked unverifiable-from-FE wherever it cannot be proven from this checkout.*
