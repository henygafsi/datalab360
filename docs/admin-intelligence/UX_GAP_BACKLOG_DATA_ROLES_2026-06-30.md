# UX GAP BACKLOG — Data360 "Data Roles" Governance Console
**Scope:** users · roles · grants · policies · security-matrix
**Date:** 2026-06-30 · **Author:** Lead Solution Data Architect
**Surfaces in scope:** `/governance/users`, `/governance/roles`, `/governance/grants` (Role Grants · Grant Matrix · User Grants · Policy Grants · Stage Grants · D360 Roles · Sources & Products), `/governance/policies`, `/governance/security-matrix`, `/governance/oauth`.
**Authoritative sources:** the 148-op governance annuary (endpoint paths + `rbac=` gates are quoted verbatim), the current Data360 UX action audit, and the Snowflake capability surface.

---

## 0. Premise correction (read first)

The brief assumes "**NO bulk / multi-select today**". That is **wrong for delete**: the Users and Roles tables already ship a real select-all + per-row checkbox column (`users/columns.tsx:92-111`, `roles/columns.tsx:45-64`), a `meta.handleMultipleDelete` handler (`users/table.tsx:94`, `roles/table.tsx:100`), and the shared `TableFooter` "Delete Them" bar (`packages/data360-core/src/components/table/footer.tsx:32`). **Bulk delete is live** for users (`POST /gouvernance/drop-users-batch`) and roles (`POST /gouvernance/drop-roles-batch`). A one-policy-to-many-roles batch (`PUT /gouvernance/policies/{type}/{name}/roles`) and a security-matrix dirty-row batch (`PUT /gouvernance/security-matrix/batch`, `POST /gouvernance/security-matrix/bulk`) also exist.

**The genuine bulk gap is the high-volume access operations**: you cannot select many users and grant/revoke a role, select many roles and grant/revoke a privilege, select many tables/columns and apply a policy, or reconcile a cohort to a target entitlement profile. Those are the headline of Section A.

A second structural finding: **`updateUser` (fetch_users.ts:328-346) writes `PUT /gouvernance/enterprise-users/{username}`** — the enterprise-directory *mirror*, **not a guaranteed `ALTER USER`**. So **most** Snowflake user-property mutations (default namespace, TYPE, secondary roles, network/password policy, days-to-expiry, unlock, abort-queries, reset-password, rename) are **BACKEND-NEEDED**, not WIRE — do not let the existing enterprise-users PUT mislead you. **Verified exception:** that live PUT's `bodyFields` already include `default_role` **and** `default_warehouse` (and the `updateUser` body type accepts both), so those two are **unverified from these files — likely WIRE/ADAPT over the existing enterprise-users PUT** (confirm the backend emits `ALTER USER`, else add it). Whether the mirror propagates to `ALTER USER` is a backend-implementation question that **cannot be determined from** api-catalog.json / openapi-snapshot.json / api-contracts.ts.

---

## A) BULK ACTIONS — headline deliverable

Ranked, prioritized set of multi-select operations the console should have. **Plan legend:** `WIRE` = a live annuary endpoint exists, implement as a client-side loop over the single-target route with per-row success/failure capture; `ADAPT` = a near endpoint exists, small change; `BACKEND-NEEDED` = no route, spec in Section D. Every loop must use a **dry-run / diff preview** before executing (mirror the set-diff precedent in `PUT /gouvernance/policies/{type}/{name}/roles`) and report **per-row {target, ok, error}**, because `ALTER`/`GRANT`/`DROP` are one statement per target in Snowflake.

> **Invalidation rule (do not blanket it):** allow-set-changing grants (role→user, role→role, privilege→role) call `invalidateMyPermissions()` after the loop. **Data-plane policy applies (masking/RLS/tag/aggregation) MUST NOT** — they only change masking/row-filtering, not the `useCanPerform` action graph; they refetch policy references instead.

### P0 — headline access bulk (live endpoint, FE-only)

| # | Bulk action | Selection scope | Plan | Endpoint (verbatim) | RBAC | Invalidation |
|---|-------------|-----------------|------|---------------------|------|--------------|
| 1 | **Grant role to N users** (team onboarding) | `/governance/users` grid (checkbox col already present) | **WIRE** loop | `POST /gouvernance/assign-role` | `gouvernance:edit` | `invalidateMyPermissions()` |
| 2 | **Revoke role from N users** (access-review remediation) | `/governance/users` or grants › User Grants | **WIRE** loop *(add missing `unassignRole` service wrapper — contract exists, no wrapper)* | `DELETE /gouvernance/unassign-role` | `gouvernance:delete` | `invalidateMyPermissions()` |
| 3 | **Reconcile N users to a target role set** (atomic per-user diff) | `/governance/users` / User Grants | **WIRE** loop (per user) | `PUT /gouvernance/users/{username}/roles` | `gouvernance:edit` | `invalidateMyPermissions()` |
| 4 | **Enable / disable N users** (freeze / suspend a team) | `/governance/users` grid | **WIRE** loop | `POST /gouvernance/disable_user/` · `POST /gouvernance/enable_user/` | `gouvernance:edit` | refetch users (no allow-set change) |

### P1 — privilege & hierarchy bulk (live endpoint, FE-only)

| # | Bulk action | Selection scope | Plan | Endpoint (verbatim) | RBAC | Invalidation |
|---|-------------|-----------------|------|---------------------|------|--------------|
| 5 | **Grant a privilege to N roles** (provision a cohort onto an object) | grants › Grant Matrix / Role inspector | **WIRE** loop + diff preview | `POST /gouvernance/grant-permission` | `gouvernance:edit` | `invalidateMyPermissions()` + read-back with `USE_CACHED_RESULT=FALSE` |
| 6 | **Revoke a privilege across N roles** (pull one over-grant everywhere; least-privilege follow-through) | grants › Grant Matrix | **WIRE** loop + diff preview | `POST /gouvernance/revoke-permission` | `gouvernance:edit` *(note: edit, not delete)* | `invalidateMyPermissions()` + cache-bust |
| 7 | **Attach / detach an access role into N functional roles** (build the two-layer hierarchy) | roles › `RoleInspectorPanel` | **WIRE** loop | `POST /gouvernance/roles/{role}/grant-role` · `DELETE …/grant-role` | `gouvernance:edit` / `gouvernance:delete` | `invalidateMyPermissions()` (a grant TO a role widens every inheritor) |
| 8 | **Apply masking policy to N columns** (data-plane) | policies › Classification / column picker | **WIRE** loop + dry-run (client-side loop; per-row {target, ok, error}); tag-based at scale = **BACKEND-NEEDED** (§D-21, net-new tag→policy bind — not composable from `tags/apply` + `masking`) | `POST /gouvernance/policies/masking/apply` | `gouvernance:edit` | refetch `…/references` (NOT `invalidateMyPermissions`) |
| 9 | **Apply RLS policy to N tables** (region/tenant segregation) | policies › RLS | **WIRE** loop; `…/row-access/simulate` preview first | `POST /gouvernance/policies/row-access/apply` | `gouvernance:edit` | refetch references (data-plane) |
| 10 | **Tag N objects** (classification fan-out) | policies › Tags / catalog | **WIRE** loop | `POST /gouvernance/policies/tags/apply` | `gouvernance:edit` | refetch tag references (data-plane) |
| 11 | **Apply aggregation policy to N tables** | policies › Aggregation | **WIRE** loop | `POST /gouvernance/policies/aggregation/apply` | `gouvernance:edit` | refetch references (data-plane) |

### P2 — user-property & discovery bulk (BACKEND-NEEDED — see §D)

| # | Bulk action | Selection scope | Plan | Route to add | RBAC | Note |
|---|-------------|-----------------|------|--------------|------|------|
| 12 | **Set default warehouse / role / namespace for N users** (cost & landing-context governance) | `/governance/users` | **BACKEND-NEEDED** for `default_namespace`; `default_role` + `default_warehouse` = **unverified — likely WIRE/ADAPT** over live enterprise-users PUT | `POST /gouvernance/users/batch-alter` (§D-1); `PUT /gouvernance/enterprise-users/{username}` already accepts `default_role`/`default_warehouse` | `gouvernance:edit` | enterprise-users PUT `bodyFields` already include `default_role`/`default_warehouse` — confirm backend emits `ALTER USER`, else add; `default_namespace` is in no live `bodyFields` |
| 13 | **Re-type N users to SERVICE / set DEFAULT_SECONDARY_ROLES / network-policy / password-policy / days-to-expiry** (hardening sweep) | `/governance/users` | **BACKEND-NEEDED** | `POST /gouvernance/users/batch-alter` (§D-1) | `gouvernance:edit` | one ALTER per user, per-row result |
| 14 | **Abort all queries / unlock N users** (incident & help-desk containment) | `/governance/users` | **BACKEND-NEEDED** | `POST /gouvernance/users/abort-queries-batch` · `…/unlock-batch` (§D-2,3) | `gouvernance:edit` | non-destructive; preserves identity |
| 15 | **Classify a whole schema + auto-tag** (PII discovery at scale) | policies › Classification | **BACKEND-NEEDED** (today `classify` is per-table) | `POST /gouvernance/policies/classification/classify-schema` (§D-13) | `gouvernance:edit` | chains into tag-based masking |
| 16 | **Grant a privilege ON ALL / ON FUTURE objects in a schema to a role** (mass + set-and-forget provisioning) | grants composer | **BACKEND-NEEDED** | `POST /gouvernance/grants/on-all` · `…/on-future` (§D-7,8) | `gouvernance:edit` | pair ON ALL + ON FUTURE to close the new-table gap |

### Already shipped (do not rebuild — verify only)

| Bulk action | Endpoint | Status |
|-------------|----------|--------|
| Bulk **delete users** | `POST /gouvernance/drop-users-batch` | live + wired |
| Bulk **delete roles** | `POST /gouvernance/drop-roles-batch` | live + wired |
| One **policy → many roles** (set-diff) | `PUT /gouvernance/policies/{type}/{name}/roles` | live + wired (the diff precedent to copy) |
| Security-matrix **dirty-row batch** | `PUT /gouvernance/security-matrix/batch` · `POST /gouvernance/security-matrix/bulk` | live + wired |

---

## B) MISSING CAPABILITIES — by area

Each: Snowflake basis (+doc), data-role value, endpoint reconciliation, FE component to add, RBAC, priority.

### B.1 — USERS

- **B1.1 Bulk role grant/revoke + cohort reconcile** — *(see A-1/2/3)*. Basis: `GRANT/REVOKE ROLE`, `PUT users/{u}/roles` set-diff (https://docs.snowflake.com/en/sql-reference/sql/grant-role). Value: team onboarding/offboarding without N single-row clicks. Reconcile: **WIRE** `PUT /gouvernance/users/{username}/roles`. Grant/revoke: **WIRE** loops over `assign-role` / `unassign-role`. FE: multi-select action on `shared/governance/users/table.tsx` → new `BulkRoleAssignPanel` (RightTabPanel). RBAC `gouvernance:edit`/`delete`. **P0**.
- **B1.2 User-property governance (default WH/role/namespace, TYPE, secondary roles, network/password policy, expiry, rename)** — Basis: `ALTER USER SET …` (https://docs.snowflake.com/en/sql-reference/sql/alter-user). Value: cost routing, least-privilege landing context, service-account hardening, contractor time-boxing. **BACKEND-NEEDED** for TYPE / `default_namespace` / `default_secondary_roles` / network-/password-policy / `days_to_expiry` / rename (`updateUser` writes the directory mirror only) → `POST /gouvernance/users/batch-alter` + `PUT /gouvernance/users/{username}/properties` (§D-1). **Carve-out:** `default_role` + `default_warehouse` are already in the live enterprise-users PUT `bodyFields` → **unverified from these files, likely WIRE/ADAPT** over that PUT (confirm it emits `ALTER USER`, else add). FE: `users/edit/[id]` property form + bulk panel. RBAC `gouvernance:edit`. **P2**.
- **B1.3 Incident controls — abort all queries / immediate unlock (`MINS_TO_UNLOCK=0`)** — Basis: `ALTER USER … ABORT ALL QUERIES`, `MINS_TO_UNLOCK` (https://docs.snowflake.com/en/sql-reference/sql/alter-user). Value: runaway-compute containment + help-desk unlock without suspending the identity. **BACKEND-NEEDED** → `POST /gouvernance/users/{username}/abort-queries`, `…/unlock` (+ batch) (§D-2,3). FE: row action on `users/table.tsx`. RBAC `gouvernance:edit`. **P2**.
- **B1.4 Credential lifecycle — reset/set password, MUST_CHANGE, RSA key for PERSON users** — Basis: `RESET/SET PASSWORD`, `RSA_PUBLIC_KEY(_2)` (https://docs.snowflake.com/en/user-guide/key-pair-auth). Value: credential recovery/rotation; today `assign-rsa-key` is service-user-scoped only. **BACKEND-NEEDED** → `POST /gouvernance/users/{username}/reset-password|set-password|rsa-key` (§D-4,20). FE: `users/view` credential card. RBAC `gouvernance:edit`. **P2**.
- **B1.5 MFA enforcement via authentication policy** — Basis: there is **no per-user "require MFA" flag**; `CREATE AUTHENTICATION POLICY MFA_ENROLLMENT=REQUIRED` + `ALTER USER/ACCOUNT SET AUTHENTICATION POLICY` (https://docs.snowflake.com/en/sql-reference/sql/create-authentication-policy). Value: the real lever feeding mfa-gap posture findings; `user/mfa/set` (live) is only an enroll prompt. **BACKEND-NEEDED** → `POST /gouvernance/policies/authentication` + attach (§D-15). FE: policies › Authentication tab + attach-to-cohort. RBAC `gouvernance:edit`. **P2**.
- **B1.6 SHOW USERS / DESCRIBE USER MFA-gap & access-review grid** — Basis: `SHOW USERS` columns has_mfa/has_rsa/has_password/last_success_login (https://docs.snowflake.com/en/sql-reference/sql/show-users). Value: who lacks MFA, who is dormant, who still uses key-pair. Already feeds `getUsers`; **WIRE** the columns into the grid and **render NULL/masked as "—", never fabricated zeros**. FE: `users/columns.tsx`. RBAC `gouvernance:view`. **P1**.

### B.2 — ROLES

- **B2.1 Role hierarchy tree on the roles page** — Basis: `SHOW ROLES` parent/child (https://docs.snowflake.com/en/sql-reference/sql/show-roles). Value: visualize inheritance, find over-broad roles. **WIRE** (genuinely unwired *in governance* — only consumed by command-center `SecurityMap`/`OrgSummaryTab` today) `GET /command-center/role-hierarchy`. FE: new `RoleHierarchyPanel` on `(dashboard)/governance/roles/page.tsx`, reusing `services/command-center`. RBAC `command-center:view`. **P0**.
- **B2.2 Least-privilege advisory on the role action surface** — Basis: diff GRANTS_TO_ROLES vs ACCESS_HISTORY (https://docs.snowflake.com/en/sql-reference/account-usage/grants_to_roles). Value: ranked safe-to-trim grants. Service wrapper (`policies:getRoleLeastPrivilege`) and a render in `GovernanceDepthPanel` **already exist** → low-lift **WIRE-surface** into `RoleInspectorPanel` so the advisory sits next to the revoke control. `GET /gouvernance/roles/{role}/least-privilege`. RBAC `gouvernance:view`. **P1**.
- **B2.3 Effective-access resolution & what-if simulator** — Basis: `SHOW GRANTS TO USER` merged up the hierarchy (https://docs.snowflake.com/en/sql-reference/sql/show-grants). Value: "what can this user *actually* do, incl. inherited + secondary roles" before/after a change — makes hierarchy edits safe. **WIRE** (unwired): `GET /api/platform/access-simulator`, `GET /api/platform/users/{username}/effective-grants`. FE: `AccessSimulatorPanel` (RightTabPanel) launched from RoleInspector / User Grants. RBAC `api:view`. **P1**.
- **B2.4 Secondary-roles write (`DEFAULT_SECONDARY_ROLES`)** — Basis: `ALTER USER … SET DEFAULT_SECONDARY_ROLES=('ALL')` (https://docs.snowflake.com/en/sql-reference/sql/use-secondary-roles). Value: union-of-grants for cross-domain users; app currently READS only (`fetch_users`). **BACKEND-NEEDED** via §D-1. FE: user property form. RBAC `gouvernance:edit`. **P2**.
- **B2.5 Database roles (shareable entitlements)** — Basis: `CREATE/GRANT DATABASE ROLE` (https://docs.snowflake.com/en/sql-reference/sql/create-database-role). Value: entitlements that travel with a database via shares/data products — account roles do not. **BACKEND-NEEDED** (§D-16). FE: roles › Database Roles tab. RBAC `gouvernance:edit`. **P3**.
- **B2.6 Object-level role ownership transfer (`COPY CURRENT GRANTS`)** — Basis: `GRANT OWNERSHIP ON ROLE …` (https://docs.snowflake.com/en/sql-reference/sql/grant-ownership). Value: prevents orphaned un-droppable roles when an owner offboards; today only account-admin handoff exists. **BACKEND-NEEDED** (§D-18). FE: roles row action. RBAC `gouvernance:edit`. **P3**.
- **B2.7 Role naming-convention enforcement (AR_/FR_/SVC_/D360)** — Basis: best-practice. Value: self-documenting, auditable roles. FE-only validation on `add-role-form.tsx` (no endpoint). RBAC n/a. **P2**.

### B.3 — GRANTS

- **B3.1 Bulk grant/revoke privilege across a role set** — *(A-5/6)*. **WIRE** loops over `grant-permission` / `revoke-permission` with diff preview. FE: `grant-matrix/panel.tsx`. RBAC `gouvernance:edit`. **P1**.
- **B3.2 Direct-to-user grant detector** — Basis: best-practice "never grant directly to users" (https://docs.snowflake.com/en/sql-reference/sql/grant-role). Value: surfaces invisible bypass grants → migrate into access/functional roles. **WIRE** (unwired): `GET /api/platform/object-permission-matrix` / `GET /api/platform/users/{username}/object-grants`. FE: detector panel on User Grants / security-matrix. RBAC `api:view`. **P1**.
- **B3.3 ON ALL + ON FUTURE grants** — Basis: `GRANT … ON ALL|FUTURE <objtype> IN SCHEMA/DATABASE` (https://docs.snowflake.com/en/sql-reference/sql/grant-privilege). Value: backfill existing objects + auto-govern new ones (closes "new table is invisible until re-granted"). **BACKEND-NEEDED** (§D-7,8) — also no `SHOW FUTURE GRANTS` read today. FE: grants composer "scope: object/ON ALL/ON FUTURE" toggle. RBAC `gouvernance:edit`. **P2**.
- **B3.4 Object ownership transfer (COPY/REVOKE CURRENT GRANTS) + managed-access schema** — Basis: `GRANT OWNERSHIP ON <object>`, `ALTER SCHEMA … ENABLE MANAGED ACCESS` (https://docs.snowflake.com/en/user-guide/security-access-control-considerations). Value: re-home assets non-disruptively; centralize *who-can-grant*. **BACKEND-NEEDED** (§D-9,10). FE: catalog object actions. RBAC `gouvernance:edit`. **P2**.
- **B3.5 WITH GRANT OPTION write toggle** — Basis: delegated re-granting (https://docs.snowflake.com/en/sql-reference/sql/grant-privilege). Value: controlled delegation; today `grant_option` is read-only on SHOW GRANTS rows. **ADAPT** — add `grant_option` param to `POST /gouvernance/grant-permission` (§D-12). FE: grant composer checkbox (confirm gate). RBAC `gouvernance:edit`. **P3**.
- **B3.6 GRANT IMPORTED PRIVILEGES (consume inbound share)** — Basis: https://docs.snowflake.com/en/user-guide/data-share-consumers. Value: the only way non-admin roles can read shared data — essential to productionize inbound data products. **BACKEND-NEEDED** (§D-11). FE: data-products consumer action. RBAC `gouvernance:edit`. **P3**.
- **B3.7 Batched grants matrix as the audit backbone** — Basis: `SHOW GRANTS TO ROLE` ×all-roles (https://docs.snowflake.com/en/sql-reference/sql/show-grants). `GET /gouvernance/grants-matrix` already collapses the N+1 — **WIRE** as the diff source feeding every bulk revoke. RBAC `gouvernance:view`. **P1**.

### B.4 — POLICIES (governance objects)

- **B4.1 Bulk apply masking / RLS / tag / aggregation** — *(A-8..11)*. **WIRE** loops + dry-run. FE: `policies/components` PolicyCard multi-target picker. RBAC `gouvernance:edit`. Invalidation = refetch references (data-plane). **P1**.
- **B4.2 Tag-based masking (one tag → N columns)** — Basis: `ALTER TAG … SET MASKING POLICY` (https://docs.snowflake.com/en/user-guide/tag-based-masking-policies). Value: the scale answer over per-column masking. **BACKEND-NEEDED** — the tag→policy *binding* is **net-new, not composable from live routes**: `policies/tags/apply` only writes a tag *value* (`ALTER <obj> SET TAG = '<value>'`) and `policies/masking` only does `CREATE MASKING POLICY`; neither, alone or composed, performs `ALTER TAG … SET MASKING POLICY`. Add `POST /gouvernance/policies/tags/{tag}/masking-policy` (§D-21). FE: policies › Tags. RBAC `gouvernance:edit`. **P2**.
- **B4.3 Schema-level classify + auto-tag** — *(A-15)*. **BACKEND-NEEDED** `…/classify-schema` (§D-13). Wire the already-present-but-unwired `extract-categories`, `apply-tags`, `pii-scan`, `classifiers/*` routes. RBAC `gouvernance:edit`. **P2**.
- **B4.4 Projection policy + Privacy (differential privacy) policy** — Basis: https://docs.snowflake.com/en/user-guide/projection-policies, https://docs.snowflake.com/en/user-guide/diff-privacy/differential-privacy-admin. Value: filter/join on a sensitive key without returning it; noisy-aggregate sharing. **BACKEND-NEEDED** (§D-17) — not exposed at all. FE: policies new tabs. RBAC `gouvernance:edit`. **P3**.
- **B4.5 Policy-coverage audit (POLICY_REFERENCES) + unapply-all** — Basis: https://docs.snowflake.com/en/sql-reference/account-usage/policy_references. `GET …/references` and `POST …/unapply-all` exist; **WIRE** the generic `{policy_type}/{name}/references` read into PolicyCard for a coverage map before teardown. RBAC `gouvernance:view`. **P2**.
- **B4.6 Audit evidence (ACCESS_HISTORY / QUERY_HISTORY)** — Basis: `policies_referenced` proof-of-enforcement (https://docs.snowflake.com/en/sql-reference/account-usage/access_history). **WIRE** (unwired): `GET /command-center/audit/access-history`, `GET /org-accounts/audit/access-history`. FE: governance audit tab. RBAC `command-center:view`/`org-accounts:view`. **P2**.

### B.5 — SECURITY-MATRIX & POSTURE

- **B5.1 Access-review & recertification posture header** — Basis: best-practice recurring attestation (https://docs.snowflake.com/en/user-guide/security-access-control-considerations). Wrappers **already exist** (`posture:getAccessReviewSummary`, `getComplianceScore`) → low-lift **WIRE-surface**: `GET /gouvernance/access-review/summary`, `GET /gouvernance/compliance/score` onto the security-matrix header. RBAC `gouvernance:view`. **P1**.
- **B5.2 Privileged-role inventory (ACCOUNTADMIN/SECURITYADMIN holders + MFA gap)** — Basis: keep dangerous-role list minimal & MFA-enforced (https://docs.snowflake.com/en/user-guide/security-access-control-overview). **WIRE** — derive from `GET /gouvernance/grants-matrix` + `GET /command-center/role-hierarchy` (both live). FE: posture card. RBAC `gouvernance:view`/`command-center:view`. **P1**.
- **B5.3 Separation-of-duties / toxic-combination view** — Basis: SoD matrix (https://docs.snowflake.com/en/user-guide/security-access-control-overview). **WIRE** atop `GET /gouvernance/security-matrix`. FE: conflict overlay on the existing matrix grid. RBAC `gouvernance:view`. **P2**.

---

## C) UX-QUALITY FIXES (from the audit observations)

> These are **defects/convention fixes**, not new wires. They do **not** belong in the P0/P1 WIRE list (no endpoint to wire), but several are P0-correctness.

1. **Missing `invalidateMyPermissions` after allow-set grants (P0 correctness):**
   - Role→module grant — `shared/governance/grants/table.tsx` `EditModal.onSave` → `updateGrants` (no import; ~line 287). **Add.**
   - User→role grant — `shared/governance/user-grants/table.tsx` `handleSaveRoles` → `updateUserRoles` (~line 297). **Add.**
   - *(Do NOT add to `assignPolicyToRoles` or policy create/apply — those are data-plane, absence is correct.)*
2. **Missing `useCanPerform` gating (P0 security):** user-grants Manage Roles + Save (`user-grants/table.tsx:211-217,391`); `roles/edit/[id]/page.tsx:52` save (button always enabled, line 175); security-matrix Add Row (579), Add Axis (873), Edit Axis (910), Delete Axis (922), Sync (538). **Gate all with `useCanPerform('gouvernance', …)`.**
3. **Dead / unreachable bulk export (P1):** grants Role Grants (`grants/table.tsx:218,261`) and User Grants (`user-grants/table.tsx:379`) render `TableFooter` + read `getSelectedRowModel()` but define **no checkbox column** → footer never appears, export is a no-op; user-grants also wires a non-existent `meta.handleMultipleDelete`. **Add a select column or remove the dead footer.** Users `TableFooter` gets **no `onExport`** (`users/table.tsx:251`) → "Download N Items" is a no-op (Roles passes it correctly). **Pass `onExport`.**
4. **`TableFooter` microcopy bug (P1):** hardcodes "Category/Categories" regardless of entity (`packages/data360-core/src/components/table/footer.tsx:26`) — "2 Categories selected" for users/roles. **Make entity-aware.**
5. **Native `window.confirm` → `ConfirmDialog` (P2):** oauth RSA-key revoke (`oauth/page.tsx:1123`), roles/view object-grant revoke (`roles/view/[id]/page.tsx:42`).
6. **Centered modal → docked RightTabPanel (P2):** `AddUserButton` (`add-user-button.tsx:42`), `AddRoleButton` (`add-role-button.tsx:40`), shared `ImportButton` (`shared/import-button.tsx:30`) use `useModal()` overlays; the rest of governance uses the docked rail. **Align.**
7. **Vendor-name leaks in customer copy (P2, brand rule):** "Sync from Snowflake" (`security-matrix/page.tsx:544`), Enterprise Users panel (Snowflake/Entra/Okta, 705-715), whole OAuth page (SECURITY INTEGRATION SQL, "Snowflake Documentation" link, StageGrants hints). **Neutralize to "data platform / identity provider"; keep vendor terms in admin/architecture views only.**
8. **Loading-state inconsistencies (P3):** `stage-grants/table.tsx:172,371` uses plain "Loading…" text instead of skeletons; security-matrix "Save All" uses a fixed bottom-center floating pill (`page.tsx:680,829`) instead of the docked rail.

---

## D) BACKEND ROUTE SPECS (hand to the GitLab FastAPI repo)

All `gouvernance.*`, gate with the module's RBAC; return **per-row `{target, ok, error}`** for batch routes; bust the result cache (`USE_CACHED_RESULT=FALSE`) on read-back after a write.

1. **`POST /gouvernance/users/batch-alter`** — body `{ usernames: string[], properties: { default_role?, default_warehouse?, default_namespace?, type?('PERSON'|'SERVICE'), default_secondary_roles?('ALL'|[]), days_to_expiry?, network_policy?, password_policy? } }`. Behaviour: loop `ALTER USER <u> SET …` one statement per user; per-row result. **Sibling single-target:** `PUT /gouvernance/users/{username}/properties`. RBAC `gouvernance:edit`. *(Note: distinct from the existing enterprise-directory `PUT /gouvernance/enterprise-users/{username}`. That PUT's `bodyFields` already include `default_role` + `default_warehouse`, so those two may already be served there — whether it emits `ALTER USER` is **unverified from these files**; confirm backend, else add. The remaining properties — TYPE, `default_namespace`, `default_secondary_roles`, `days_to_expiry`, network/password policy — appear in no live `bodyFields` and stay BACKEND-NEEDED.)*
2. **`POST /gouvernance/users/{username}/abort-queries`** (+ `…/abort-queries-batch`) — `ALTER USER … ABORT ALL QUERIES`. RBAC `gouvernance:edit`.
3. **`POST /gouvernance/users/{username}/unlock`** (+ `…/unlock-batch`) — `ALTER USER SET MINS_TO_UNLOCK=0`. RBAC `gouvernance:edit`.
4. **`POST /gouvernance/users/{username}/reset-password`** · **`…/set-password`** · **`…/must-change-password`** — `RESET/SET PASSWORD`, `MUST_CHANGE_PASSWORD=TRUE`. RBAC `gouvernance:edit`.
5. **`POST /gouvernance/users/{username}/rename`** — `ALTER USER … RENAME TO`. RBAC `gouvernance:edit`.
6. **`POST /gouvernance/grant-permission/batch`** + **`POST /gouvernance/revoke-permission/batch`** — body `{ grants: [{privileges, object_type, object_name, role_name}], dry_run?: bool }`. Behaviour: SHOW GRANTS → diff desired set → emit only delta GRANT/REVOKE; per-row result. RBAC `gouvernance:edit`.
7. **`POST /gouvernance/grants/on-all`** — body `{ privilege, object_type, scope:'schema'|'database', database, schema_?, role_name }` → `GRANT <priv> ON ALL <objtype> IN SCHEMA/DATABASE … TO ROLE`. RBAC `gouvernance:edit`.
8. **`POST /gouvernance/grants/on-future`** + **`GET /gouvernance/grants/future?database=&schema=`** → `GRANT … ON FUTURE …` and `SHOW FUTURE GRANTS IN SCHEMA/DATABASE`. RBAC `gouvernance:edit`/`view`.
9. **`POST /gouvernance/grants/ownership`** — body `{ object_type, object_name, to_role, copy_current_grants: bool }` → `GRANT OWNERSHIP ON <object> TO ROLE … COPY|REVOKE CURRENT GRANTS`. RBAC `gouvernance:edit`.
10. **`POST /gouvernance/schemas/{database}/{schema}/managed-access`** — body `{ enabled: bool }` → `ALTER SCHEMA … ENABLE|DISABLE MANAGED ACCESS`. RBAC `gouvernance:edit`.
11. **`POST /gouvernance/grants/imported-privileges`** — body `{ database, role_name }` → `GRANT IMPORTED PRIVILEGES ON DATABASE … TO ROLE`. RBAC `gouvernance:edit`.
12. **`ADAPT POST /gouvernance/grant-permission`** — add `grant_option?: bool` → append `WITH GRANT OPTION`. RBAC `gouvernance:edit`.
13. **`POST /gouvernance/policies/classification/classify-schema`** — body `{ database, schema_, auto_tag: bool }` → `SYSTEM$CLASSIFY_SCHEMA(…, {'auto_tag': true})`. RBAC `gouvernance:edit`.
14. **`POST /gouvernance/policies/masking/apply-batch`** (+ `…/row-access/apply-batch`, `…/aggregation/apply-batch`) — body `{ policy_name, targets:[{database,schema,table,column?}], dry_run?: bool }` — single-call multi-target apply (server-side optimization over the FE loop). RBAC `gouvernance:edit`.
15. **`POST /gouvernance/policies/authentication`** (`CREATE AUTHENTICATION POLICY … MFA_ENROLLMENT=REQUIRED`) + **`POST /gouvernance/users/{username}/authentication-policy`** + **account-scope set** (`ALTER USER/ACCOUNT SET AUTHENTICATION POLICY`). RBAC `gouvernance:edit`.
16. **`POST /gouvernance/database-roles`** (`CREATE DATABASE ROLE`) + **`POST /gouvernance/database-roles/{db}.{role}/grant`** (`GRANT DATABASE ROLE … TO ROLE`). RBAC `gouvernance:edit`.
17. **`POST /gouvernance/policies/projection`** + **`POST /gouvernance/policies/privacy`** (+ `…/apply`) — projection-constraint & differential-privacy policy CRUD/apply. RBAC `gouvernance:edit`.
18. **`POST /gouvernance/roles/{role}/transfer-ownership`** — body `{ to_role, copy_current_grants: bool }` → `GRANT OWNERSHIP ON ROLE … COPY CURRENT GRANTS`. RBAC `gouvernance:edit`.
19. **(Optional optimization)** **`POST /gouvernance/assign-role-batch`** + **`DELETE /gouvernance/unassign-role-batch`** — body `{ usernames: string[], role_name }` — server-side grant/revoke one role to/from many users; replaces the FE loop in A-1/A-2 once available. RBAC `gouvernance:edit`/`delete`.
20. **`POST /gouvernance/users/{username}/rsa-key`** (+ `DELETE …/rsa-key`) — extend key-pair auth to PERSON users / second-slot rotation (today `oauth/assign-rsa-key` is service-user-scoped). RBAC `gouvernance:edit`.
21. **`POST /gouvernance/policies/tags/{tag}/masking-policy`** (+ `DELETE …`) — `ALTER TAG <tag> SET MASKING POLICY <policy>` (tag-based masking bind; `UNSET MASKING POLICY` on delete). **Net-new — NOT composable from live routes:** `policies/tags/apply` only writes a tag *value* (`ALTER <obj> SET TAG = '<value>'`) and `policies/masking` only `CREATE`s a policy; neither, alone or composed, binds a policy to a tag. Backs B4.2 / the A-8 tag-based path. RBAC `gouvernance:edit`.

---

## E) IMPLEMENTATION PLAN — ordered P0/P1 WIRE (live endpoint, FE-only)

Execute top-down; each item is shippable without backend work. (UX defects in §C land alongside — fix §C-1/§C-2 *with* the first bulk feature, since the new bulk grant must call `invalidateMyPermissions`.)

| Order | Capability | Endpoint (live) | FE component to touch | RBAC |
|------:|-----------|-----------------|------------------------|------|
| 1 | **Bulk grant role to selected users** (loop + per-row result) | `POST /gouvernance/assign-role` | `apps/data360/src/app/shared/governance/users/table.tsx` → new `BulkRoleAssignPanel` | `gouvernance:edit` |
| 2 | **Bulk revoke role from selected users** (loop; add `unassignRole` wrapper) | `DELETE /gouvernance/unassign-role` | `shared/governance/users/table.tsx` + `services/governance/fetch_users.ts` | `gouvernance:delete` |
| 3 | **Bulk reconcile users to a target role set** (atomic per-user) | `PUT /gouvernance/users/{username}/roles` | `shared/governance/user-grants/table.tsx` | `gouvernance:edit` |
| 4 | **Bulk enable/disable selected users** (client-side loop; per-row {target, ok, error}) | `POST /gouvernance/disable_user/` · `POST /gouvernance/enable_user/` (single-target — one call per user) | `shared/governance/users/table.tsx` | `gouvernance:edit` |
| 5 | **Bulk grant privilege to N roles** (diff preview + loop) | `POST /gouvernance/grant-permission` | `apps/data360/src/app/shared/governance/grant-matrix/panel.tsx` | `gouvernance:edit` |
| 6 | **Bulk revoke privilege across N roles** (diff preview + loop) | `POST /gouvernance/revoke-permission` | `shared/governance/grant-matrix/panel.tsx` | `gouvernance:edit` |
| 7 | **Bulk attach access role into N functional roles** (client-side loop; per-row {target, ok, error}) | `POST /gouvernance/roles/{role}/grant-role` (single-target — one call per role) | `(dashboard)/governance/roles/components/RoleInspectorPanel.tsx` | `gouvernance:edit` |
| 8 | **Role hierarchy tree on roles page** (unwired in governance) | `GET /command-center/role-hierarchy` | `(dashboard)/governance/roles/page.tsx` → new `RoleHierarchyPanel` (reuse `services/command-center`) | `command-center:view` |
| 9 | **Direct-to-user grant detector** | `GET /api/platform/object-permission-matrix` | `shared/governance/user-grants/table.tsx` | `api:view` |
| 10 | **Access what-if simulator** | `GET /api/platform/access-simulator` | `RoleInspectorPanel.tsx` → new `AccessSimulatorPanel` | `api:view` |
| 11 | **Effective grants per user** | `GET /api/platform/users/{username}/effective-grants` | `shared/governance/user-grants/table.tsx` | `api:view` |
| 12 | **Least-privilege advisory in role inspector** (wrapper exists; surface) | `GET /gouvernance/roles/{role}/least-privilege` | `RoleInspectorPanel.tsx` | `gouvernance:view` |
| 13 | **Access-review posture header** (wrapper exists; surface) | `GET /gouvernance/access-review/summary` | `(dashboard)/governance/security-matrix/page.tsx` | `gouvernance:view` |
| 14 | **Compliance-score badge** (wrapper exists; surface) | `GET /gouvernance/compliance/score` | `(dashboard)/governance/security-matrix/page.tsx` | `gouvernance:view` |
| 15 | **Bulk apply masking policy to N columns** (data-plane; refetch refs; client-side loop; per-row {target, ok, error}) | `POST /gouvernance/policies/masking/apply` (single-target — "ALTER TABLE … MODIFY COLUMN … SET MASKING POLICY", one call per column) | `(dashboard)/governance/policies/components` (PolicyCard) | `gouvernance:edit` |
| 16 | **Bulk apply RLS policy to N tables** (simulate first; client-side loop; per-row {target, ok, error}) | `POST /gouvernance/policies/row-access/apply` (single-target — "ALTER TABLE … ADD ROW ACCESS POLICY … ON (col)", one call per table) | `(dashboard)/governance/policies/components` | `gouvernance:edit` |
| 17 | **Bulk tag N objects** (client-side loop; per-row {target, ok, error}) | `POST /gouvernance/policies/tags/apply` (single-target — "ALTER <object> SET TAG", one call per object) | `(dashboard)/governance/policies/components` | `gouvernance:edit` |

**Sequencing rationale:** 1-4 are the headline access bulk (highest leverage, all live) and force the §C-1 invalidation fix; 5-7 extend bulk to the privilege/hierarchy plane; 8-11 are the *genuinely unwired* discovery/safety reads that make the bulk operations safe (preview before execute); 12-14 are near-zero-lift "service wrapper already exists, just surface it"; 15-17 are the data-plane policy fan-outs (no `invalidateMyPermissions`, refetch references instead). Everything below this line in the backlog (§A P2, §B BACKEND-NEEDED, §D) waits on the FastAPI routes.
