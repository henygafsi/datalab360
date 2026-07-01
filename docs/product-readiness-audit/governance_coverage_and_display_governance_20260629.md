# Governance coverage → 100% + role display-management audit + test plan

**Date:** 2026-06-29 · **Mode:** read-only audit (2 Sonnet agents) + plan. **Scope:** frontend. Backend deferred (separate repo, deploy-gated).

---

## A. Endpoint coverage — governance CRUD/ASSIGN toward 100%

Baseline: 1020 backend ops, 503 in `api-contracts.ts`. Of the **130 governance paths** flagged "missing", accurate classification:

| Class | Count | Meaning | Remediation |
|---|---:|---|---|
| **C** false-positive | 19 | already in `api-contracts.ts` | none |
| **H** wired-but-hardcoded | 99 | called by a service via hardcoded string, not in contracts | contract hygiene (W1) — *functionally already ~100%* |
| **U** genuinely unwired | 12 | no FE call at all | real integration gap |

**Governance is functionally near-100%.** The only real gaps (U=12):
- **7 × `/api/platform/grants/*`** — `me/grants`, `users/{u}/effective-grants`, `users/{u}/object-grants`, `grants/roles` (GET+POST), `grants/data-scope` (GET+POST). The data-scope + effective-grants surfaces are dark.
- **3 × `/projects/{id}/rls`** (GET/POST/DELETE) — per-project row-access binding mgmt has no FE surface (relevant to "allow/deny by project owner per module").
- **2 × `/data-quality/dmf/*`** (associate, custom) — DQ uses the gouvernance prefix instead.

Caveat: masking/RLS/aggregation `replace` verbs are wired but the backend may not implement them (remove+apply fallback) — verify live.

## B. Role display-management — 3 layers, only 1 enforced

| Layer | Admin UI | Runtime enforcement | Verdict |
|---|---|---|---|
| **Page-level** (gui-permissions) | `/admin/data360-config` → "Page hints" | `getMyPageAccess()` called only as a diagnostic probe; middleware checks `!!token` only | **CONFIG-ONLY — not enforced** |
| **Feature-level** (entitlements) | `/administration/feature-governance` matrix | no `useEntitlement()` hook exists anywhere | **CONFIG-ONLY + account-wide (not per-role)** |
| **Action-level** (RBAC) | access-center / data360-config ActionRbacTab | `useCanPerform` over `/d360-roles/my-permissions`, wired on create/grant/revoke/delete/apply/approve | **ENFORCED ✓ (the only real gate)** |

**This is the core of "transparency administration / clear up denied vs permitted":** an admin can set page + feature rules that have **zero runtime effect**, so the UI does not reflect what was configured. That mismatch is the headline finding.

## C. Prioritized fixes to reach 100% (FE waves)

| Wave | Theme | What | Needs |
|---|---|---|---|
| **G1 [P0]** | Enforce page-access | Call `getMyPageAccess()` in the dashboard layout/guard; redirect/hide on `NONE`. Reconcile the 2 divergent `myAccess` return types. | FE only |
| **G2 [P0]** | Enforce entitlements | Add `useEntitlement(module, featureKey)` reading a cached `/entitlements` fetch; gate feature sections. | FE only |
| **G3 [P1]** | Allow/deny **transparency** | Surface *why* an action is denied (role/feature/page) inline + in an Administration "effective access" view; the governance-denied→request-access listener (shipped) is the runtime half. | FE only |
| **G4 [P1]** | Sidebar by role | Consume `allowedModules` (currently fetched, never used) to filter nav. | FE only |
| **G5 [P2]** | Project-owner grants | Wire the 3 `/projects/{id}/rls` endpoints + per-project allow/deny/approval surface, gated by project-owner role. | FE + verify backend |
| **G6 [P2]** | Contract hygiene | Migrate the 99 hardcoded gov paths into `api-contracts.ts`. | FE only |
| **G7 [P3]** | Platform-grants surfaces | Wire the 7 `/api/platform/grants/*` (data-scope, effective-grants). | FE + verify backend |
| **G8 [P2]** | Fine-grained verbs | Split coarse `create` into `assign_role`/`assign_module` in the action registry. | backend + FE |

## D. Scalable test matrix (the "first-class scalable test with data access")

Dimensions: **role × module × page × action(allow/deny/approve) × project-owner-scope**. Harnesses already exist (`e2e/`, saved auth `e2e/.auth/state.json`, `_role-cache-rbac-e2e.mjs`, `_sse-count.mjs`). Plan:
1. **Per-role login fixtures** (ACCOUNTADMIN + the real SF roles BI_ANALYST/DATA_MODELER; D360 app-roles degrade to admin data — document that).
2. **Display assertion sweep**: for each role, each module page renders real cached data (not "warming up") + the gated buttons match the role's allow-set.
3. **Action sweep**: allow/deny/approval grant actions as **project owner** in each project of each module; assert grant persists + cache invalidates live (SSE) + denied path shows the request-access CTA.
4. **Cache/role correctness**: per-role RLS-filtered data via `@account_role_cache` (proven cold→warm previously).

## E. THE BLOCKER (gates all live testing)

Live display + role/grant/cache tests **cannot run against the deployed host** — its SVC service-account is dead (`CACHE_NOT_READY`), so every page shows "warming up" regardless of FE correctness. **This is not an FE bug.** To run the matrix in D, the **local backend on :8000 must be relaunched by you** (a bare restart from me drops the shell-exported SVC/role env → ~100 endpoints regress to privilege-500s). Once it's up + `.env.local` points to it, the real cache is served and I can run the full sweep.

**Recommended order:** G1→G2→G3 (enforcement + transparency, pure FE, startable now) in parallel with you relaunching the local backend so the test matrix (D) can run.
