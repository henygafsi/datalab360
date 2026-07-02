# Data-Role UX Audit — every page/module × every data role

**Date:** 2026-07-02 · **Scope:** all `(dashboard)` pages of the Data360 frontend + backend RBAC decision layer.
**Method:** 6 parallel code audits (5 FE module groups + 1 backend decision-semantics analysis), synthesized here. Fixes marked ✅ were implemented the same day (see §7).

---

## 1. The role model (ground truth)

Seven **data roles** resolved from the Snowflake role string (`backend app/core/rbac.py resolve_d360_role`):

| D360 role | Module posture (from `_MATRIX`) |
|---|---|
| **Admin** | WRITE everywhere (13 modules) |
| **Data Engineer** | WRITE connect/explore/mapping/workflow/cortex/data_products/chat · READ analytics/bi/gov/dq/obs |
| **Data Analyst** | WRITE analytics/bi_reporting/cortex/chat · READ connect/workflow/dq · **no** governance/explore/mapping |
| **Data Steward** | WRITE gouvernance/data_quality/chat · READ connect/analytics/bi/obs |
| **Business User** | READ analytics/bi_reporting/chat only |
| **AI Engineer** | WRITE cortex/data_products/chat · READ connect/explore/dq/analytics/bi |
| **FinOps Manager** | WRITE observability · READ analytics/bi/org_accounts/connect/chat |

Two enforcement layers:
- **Module gating** — `require_module` (backend) + sidebar `items` + `/user/me/modules`.
- **Action gating** — `useCanPerform(module, action)` → `GET /gouvernance/d360-roles/my-permissions` (display) and `require_action` (runtime). DB rows (`D360_ROLE_ACTIONS`) first, `_MATRIX` template fallback. Both layers **fail-open** unless `BIBLE_RBAC_STRICT`.

---

## 2. Systemic defects found (cross-module)

| # | Defect | Impact | Status |
|---|---|---|---|
| S1 | **Display vs enforcement read-sets diverged** — `_template_to_permissions` used a 7-action read set; runtime `_READ_ACTIONS` has 12. `analyze/describe/monitor/feedback/history` deny-trapped in UI while runtime allowed them. | READ roles saw dead buttons runtime would allow | ✅ fixed (single source) |
| S2 | **Unregistered-action deny-traps** — `useCanPerform` keys not in `ACTION_REGISTRY` can never appear in an allow-set → permanently disabled *for everyone incl. Admin*: `org_accounts:create/update/delete` (account-overview maintenance, client-accounts warehouses/reader-accounts/monitors), `connect:read`. | Admin/FinOps dead-disabled controls; tooltip "ask an admin" is a dead-end (nothing grantable) | ✅ fixed (registry + FE key) |
| S3 | **`connect:read` invalid key was also a functional bug** — `canManageConnections` false after permissions resolve → Connect Data page's connections silently **never load** (only loaded during the loading/fail-open window). | Broken page for all roles | ✅ fixed (`read`→`view`) |
| S4 | **`mapping` module unregisterable** — in `_MATRIX` but absent from `ACTION_REGISTRY` → whole mapping wizard (create project, alter schema, `schedule_deployment` POST) ran **ungated**; a Business User could schedule deployments. | Security gap | ✅ fixed (registry module + FE gates + banner) |
| S5 | **Ungated mutation leaks** — read-only roles could fire: BI refresh/snapshot, DQ remove-association, cortex chat send/clear, the entire Snowpark compute-pool/service lifecycle, workflow ScheduleManager (contributor-role-only, Action-RBAC-blind), explore-design VersionHistory publish/archive, governance roles/edit Save. | Click-then-403 at best; real mutation at worst (backend fail-open default) | ✅ gated |
| S6 | **Two gating axes disagree** — project-contributor `isReadOnly` (owner/editor/viewer) vs Action-RBAC. Explore-design Deploy & create-object menu ride only `isReadOnly`: a Data Analyst who is a project *editor* can deploy. | Incoherent viewer story | ⏳ proposed (files under active WIP; see §6) |
| S7 | **`useCanPerform` ignores `page`/`tab`** — one `gouvernance:create` grant unlocks create on users, policies, roles, DMFs, oauth… Also forces wrong-token workarounds (oauth key-assign gated by `apply`, revoke by `revoke` instead of `assign-key`/`revoke-key`). | Over-permissive coarse matching | ⏳ proposed |
| S8 | **Fail-open + loading-as-allowed window** — every gate renders enabled during the my-permissions fetch and on hard error → brief click-then-403 window for denied users. | Minor UX flicker, by design (documented trade-off) | accepted (see §5) |
| S9 | **Strict-mode admin lockout** — `cache_metrics.py` used `module="account_overview"` (no `_MATRIX` row) → under `BIBLE_RBAC_STRICT`, 403 for everyone incl. Admin. | Latent prod-lockout | ✅ fixed + aliases added |
| S10 | **Module-name vocabularies diverge** — FE `modules.ts` apiNames (`connect_datalake`, `intelligent`, `account_overview`, `client_accounts`) vs registry keys (`connect`, `cortex`, `org_accounts`). Call sites mostly use registry keys, but nothing normalized the rest. | Silent deny for any future FE call using apiNames | ✅ `_MODULE_ALIASES` extended backend-side |
| S11 | **Sidebar module id 11 collision** — `modules.ts` id 11 = `dashboard`, but the menu renders id 11 as **Administration** → granting the innocuous "dashboard" module surfaces the whole Administration nav; `/admin`, `/administration`, `/deploy-app`, `/client-accounts`, `/email-templates` have **no route-level guard** (hidden only by nav omission). | Gating drift = security posture issue | ⏳ proposed |
| S12 | **`SECURITYADMIN` missing** from the sidebar admin set (present in every other ADMIN_ROLES list). | Taxonomy inconsistency | ✅ fixed |

---

## 3. Per-module role experience (summary)

**Legend:** 🟢 well-gated (disabled+tooltip or hidden with explanation) · 🟡 gated but inconsistent · 🔴 leak/trap (pre-fix state; ✅ = fixed today)

| Module | Read-only role experience (pre-fix) | Verdict |
|---|---|---|
| **data-products** | Every mutation gated; `PublishGate` explains *both* permission and quality-threshold blocks; "Ask an administrator" microcopy | 🟢 **reference implementation** |
| **observability** | All 4 mutation surfaces (alerts ack, SLO, budgets, CDC) disabled+tooltip naming the exact permission | 🟢 best microcopy |
| **bi-dashboard** | create/edit/delete/publish/share gated; quick-actions hidden for viewers; refresh+snapshot leaked ✅ | 🟡→🟢 |
| **governance** | Strong overall (PermissionGate EmptyStates, precise tooltips) but: roles/edit Save ungated ✅, RoleHierarchyPanel silently `return null`, oauth wrong-resource tokens, tooltip phrasing inconsistent | 🟡 |
| **data-quality** | All rule actions gated; remove-association leaked ✅ | 🟡→🟢 |
| **workflow** | Builder CTAs gated; ScheduleManager Action-RBAC-blind ✅; compute/git registry groups never wired | 🟡 |
| **intelligent (cortex)** | Semantic-models/ML/console gated (console has the best inline "you lack permission" block); cortex-chat ✅ and the whole Snowpark compute tab ✅ were ungated; ml gates train on `create` (drift) | 🟡→🟢 |
| **explore-design** | Right-bar swaps to a genuine **ReadOnlyActions** panel ("View-only access" + "Request edit access" CTA + role chip) — best viewer story in the app. But Deploy/create-menu ride contributor-role only (S6), VersionHistory leaked ✅ | 🟡 |
| **connect (data-source-connection)** | ingest/upload/delete/create gated with tooltips; `connect:read` broke connection loading ✅; intermediate wizard submits ungated | 🟡 |
| **mapping** | Nothing gated at all ✅ (now: create/edit/deploy gates + view-only banner). **Discovery:** the Step0–Step5 wizard is *orphaned* — `mapping/page.tsx` redirects to Explore & Design and nothing imports the steps; gates land if it's ever remounted | 🔴→🟢 (orphaned) |
| **account-overview** | Approve/deny cleanly hidden; maintenance buttons dead-disabled via S2 ✅ | 🟡→🟢 |
| **client-accounts** | Disabled+tooltip everywhere but keys were unregistered (S2) ✅; no route guard, reachable by URL | 🟡 |
| **administration / admin** | Rich panels with honest empty states; 2 button-only hub tabs + link-only landing ✅ (embedded matrix/config/activity); hub↔access-center overlap; no route guard (S11) | 🟡→🟢 |
| **email-templates** | Static demo cards, no API, no guard — leftover boilerplate | 🔴 remove or gate |
| **users / data-source-config / project / profile** | Redirects or read-only/self-service — appropriate | 🟢 |

---

## 4. The best-UX pattern (proposal — the "role-adaptive contract")

Adopt one standard, per surface, derived from what already works best in-app:

1. **Page level — posture banner.** On mount, read the new `GET /gouvernance/d360-roles/my-module-access` (`{module: read|write|none}`). If `read`: render the explore-design-style **"View-only access"** slim banner with a "Request edit access" CTA. If `none` (direct URL): render the governance/users-style **explanatory EmptyState** ("only available to … Contact your admin"), never a blank page or silent redirect.
2. **Control level — disabled + precise tooltip, never hidden without explanation.** Standard phrasing: *"You lack the '\<action\>' permission on \<Module\>. Ask an administrator to grant it."* Retire vague variants ("Requires an admin role") and silent `return null` panels (RoleHierarchyPanel). Exception: bulk/approval controls that are meaningless to viewers may be *hidden* when the page already shows a view-only banner.
3. **Explanation level — inline block for credit-spending or destructive actions.** Reuse the cortex-console inline "you lack permission" block and the data-products `PublishGate` composite-reason panel (permission + threshold + lineage) for: deploy, publish, bulk ops, compute lifecycle.
4. **Both axes must agree.** Wherever a project-contributor role exists (explore-design, workflow), effective-can-act = `!isReadOnly && canPerform`. One helper, e.g. `useEffectiveCan(module, action, isReadOnly)`.
5. **Keys must be registry-real.** Lint rule/CI check: every `useCanPerform(m, a)` literal pair must exist in the backend action-registry export (`GET /d360-roles/action-registry` snapshot checked into the repo). This is what made S2/S3 possible.
6. **Role chip everywhere.** The explore-design `RoleContextChip` (shows resolved D360 role + why) should move to the shared header so every page tells the user *who the app thinks they are*.

Per-role landing defaults (module matrix already supports this): Business User → BI; FinOps → observability/cost; Data Steward → governance; Data Engineer → connect/workflow. Sidebar already filters by module grants; with `my-module-access` it can now also badge read-only modules with an "eye" glyph instead of hiding them.

---

## 5. Backend decision semantics (for the record)

- `require_action` never reads page/tab from the registry; it resolves DB rows → `_MATRIX` coarse level → **fail-open on miss** (strict mode flips to deny). Display (`my-permissions`) emits template rows from the registry — so an *unregistered* action is UI-denied but runtime-allowed. That asymmetry is why unregistered keys are a trap, and why the registry is the contract to keep tight.
- Dangerous-action policy (11 escalation actions) is shared display+enforcement — good; unchanged.
- Fail-open default stands until `BIBLE_RBAC_STRICT` flips; S9-style invalid module keys are exactly what would break under strict — the alias table now absorbs the known vocabulary drift.

---

## 6. Remaining backlog (needs product decision / WIP-file access)

1. **S6** — gate explore-design Deploy + create-object menu with `explore_design:deploy/create` (files under active redesign WIP; fold into the redesign branch).
2. **S7** — page/tab-aware `useCanPerform` (namespaced tokens `page.action`), then re-key oauth `assign-key`/`revoke-key`, security-matrix `sync`, sources drops (`create`→`delete`).
3. **S11** — split module id 11 (`dashboard` vs Administration nav) + add route guards to `/admin`, `/administration`, `/deploy-app`, `/client-accounts`; remove or admin-gate `/email-templates`.
4. Wire the never-used registry groups: workflow `compute`/`git`/`runs:cancel,retry`, cortex `ml:train/predict/monitor` (currently proxied through `create`), observability freshness/SLO own keys.
5. Consume `my-module-access` in a shared `ModulePostureBanner` + sidebar read-only badges (FE follow-up).
6. Hub↔access-center dedup: fold the hub's `access`/`projects` tabs into links-only *or* remove the duplicated embeds (today both render the same panels).
7. `useCanPerform(projectId)` is accepted but unused — honor it once PROJECT_ID lands in `D360_ROLE_ACTIONS`.
8. **Product decision: mapping wizard** — Step0–Step5 under `(dashboard)/mapping/` are orphaned (page redirects to Explore & Design, zero imports). Delete them or remount; keep `mapping` in `_MATRIX`/registry either way (Data Engineer WRITE is now grantable).

---

## 7. Shipped today (this branch + backend local)

**Backend** (`data360_pro/backend`, local commit):
- `rbac.py`: `_MODULE_ALIASES` += intelligent/connect_datalake/connect_data/account_overview/client_accounts/bi_dashboard; `_READ_ACTIONS` promoted to single source.
- `action_registry.py`: new `mapping` module (wizard, 7 actions); `org_accounts.management` page (create/update/edit/delete/suspend/resume).
- `d360_roles.py`: `_template_to_permissions` now uses `_READ_ACTIONS` (S1); **new endpoint `GET /gouvernance/d360-roles/my-module-access`** → `{module: read|write|none}`, session-cached, never-503, DB-first/template-fallback.
- `cache_metrics.py`: `account_overview` → canonical `org_accounts` (S9).
- Verified: app imports, route registered, Data Steward gets `analyze` rows, module-level map matches `_MATRIX` exactly.

**Frontend** (`feat/backlog-v1`):
- Administration: hub `featureGov` tab embeds `FeatureGovernanceMatrix`; `config` tab embeds new `ConfigSummaryPanel` (live `/api/data360/platform-config` read); `/admin` landing embeds revived `ActivityDashboard`; `?tab=` now syncs to URL in hub + access-center (deep-linkable); dead `ActionRbacTab.tsx` (1144 lines) deleted.
- RBAC fixes: `connect:read`→`view` (S3); mapping wizard gated + view-only banner (S4); BI refresh/snapshot, DQ remove-association, cortex chat send/clear, Snowpark compute lifecycle, workflow ScheduleManager, VersionHistory publish/archive, governance roles/edit Save all gated (S5); `SECURITYADMIN` added to sidebar admin set (S12).
