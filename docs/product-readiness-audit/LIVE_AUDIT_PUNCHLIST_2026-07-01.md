# Data360 "100%-Presentable" Consolidated Punch List

*Source: 65 per-module gap findings, deduplicated and cross-module-merged. Modules covered: account_overview, connect, explore_design, workflow, governance, bi_dashboard, intelligent, data_quality, observability, administration.*

---

## 1. Executive Summary

**Distance to 100%:** Close on backend, not on frontend. The overwhelming majority of the 65 findings are **frontend-surfacing gaps** — the backend endpoint exists and returns 200, but no UI calls it, or a UI calls it read-only. Only a handful need real backend work (a connector-register POST, a forecast/Cortex endpoint, SLO PUT/DELETE, per-user MFA/SAML). This means most of the list is **low-risk FE wiring**, and a focused wave can move the needle fast.

After dedup/merge the 65 raw items collapse to **~38 distinct workstreams**, dominated by six recurring themes:

1. **RBAC platform-endpoint suite is unwired everywhere (biggest cross-module cluster).** The same set of live endpoints — `permission-matrix`, `object-permission-matrix`, `users/{u}/effective-grants`, `users/{u}/object-grants`, `access-simulator`, `grants/data-scope` — is missing from **account_overview, governance, and administration** simultaneously (5 findings → 1 initiative). "What can this role/user actually see, and simulate it before saving" is core to a governance product and is absent platform-wide.
2. **Audit / telemetry visibility gap.** The app writes `POST /api/data360/track` everywhere but never renders the resulting event feed. `administration/performance/*` (events, events/feed, by-tab, by-user, audit/by-account, platform-health) and `gouvernance/dashboard/{activity,errors}` are wired only in the admin api-health harness (6 findings → 1 initiative). No "who did what, when, did it fail" surface exists.
3. **RBAC gating drift (security).** Governance-critical mutations gate on **hardcoded role strings / `userRole==='viewer'`** instead of `useCanPerform`, in **workflow (deploy approve/reject), explore_design (schema clone + DDL), intelligent (Snowpark infra), account_overview (account lifecycle)** and 4 more. This is a separation-of-duties hole, not just inconsistency.
4. **Incomplete CRUD lifecycles.** Multiple surfaces can create but not edit/delete/manage: observability monitors (create/delete only, never attach to a warehouse), bi dashboards (no delete/rename), data_quality thresholds (can't be persisted at all → the breach engine is unconfigurable), explore_design schema-clone (fire-and-forget).
5. **Client-side pagination at scale.** 9 lists fetch the whole payload and filter/sort/search in-browser while the backend already supports `page/page_size/sort/search` (connect, governance users/roles, workflow runs, data_quality, bi data-products, intelligent query-analytics). Search silently returns false "no results" across pages.
6. **AI features that are read-only / brochure / "coming soon".** intelligent Vector Search, AI Agents, Semantic Views; bi "Prevision" card; connect AI helper; explore_design glossary — advertised capabilities that dead-end or show static cards.

**Bottom line:** presentability is blocked less by broken code than by *unfinished surfaces and inconsistent gating*. A first wave of ~10 low-risk FE fixes removes every visibly-broken/"coming soon" surface and closes the security-gating holes; the two mega-initiatives (RBAC suite, audit spine) then deliver the marquee governance/admin value.

---

## 2. P0 — Visibly Broken / Empty / Overpromising Surfaces (presentability blockers)

*These read as broken or unfinished to anyone browsing the product. Re-prioritized above their raw audit severity because they directly undermine "presentable."*

| Module | Broken surface | Fix |
|---|---|---|
| **explore_design** | Schema context-menu: 6 of ~8 items only fire error/no-op toasts (Transfer Ownership, Export DDL, Drop Schema, Apply Masking/RLS/Ingestion "to all") — `page.tsx:459-471,3562,3593-3641`. Reads broken. | Hide or disable-with-tooltip the unsupported items; keep only clone/list which work. |
| **intelligent** | Vector Search tab header promises "create embeddings, manage vector columns, similarity search" but panel is read-only (only lists columns + brochure cards). `page.tsx:636-743`. | Add "Embed a column" form (`POST /cortex/embeddings`, already wired in AI Console) + similarity-search box (`VECTOR_COSINE_SIMILARITY`) over listed vector columns. |
| **intelligent** | AI Agents & Semantic Views tabs are read-only brochure panels listing **unshipped** bullets ("Auto-generate YAML", "Version history with diff") as if delivered. `page.tsx:448-633`. Backend only offers GET. | Relabel as "Registered Agents"/"Semantic Views", drop the aspirational bullet lists. Wire create flows only when backend POST exists. |
| **bi_dashboard** | Flagship landing renders a hardcoded "coming soon" Prevision/forecast ScoreCard (`score-cards.ts:260-272`, "// no backend endpoint exists yet"). Visible on `/bi-dashboard`. | Hide the card until computable (or back it with a forecast/Cortex endpoint). Do not ship a "coming soon" tile on the landing. |
| **governance** | No audit/activity page exists in the module — `gouvernance/dashboard/{activity,errors}` services are called only from admin api-health. A governance product with no accessible audit trail. | Add an "Activity / Audit" tab wired to `dashboard/activity` + `dashboard/errors` with module/event/status/time filters. |
| **connect** | `/connect` returns "Page not found" — no route/alias exists (real page is `/data-source-connection`). Legacy/external links 404. `next.config.mjs` only aliases `gouvernance`. | Add a permanent redirect `/connect → /data-source-connection` in `next.config.mjs`. Trivial. |

---

## 3. P1 — Missing Core Actions & Capabilities

*Backend endpoint exists and is reachable; the product either dead-ends or exposes no action. These are the "the product looks complete but can't actually do X" gaps.*

| Module | Gap | Backend endpoint | Fix |
|---|---|---|---|
| **account_overview** | ACCOUNTADMIN sees the pending Access-Requests queue but it's a **read-only, inert** table — no approve/deny, no link out. Mutations already exist and are used in access-center. | `POST /access-requests/{id}/approve` · `/deny` | Add inline Approve/Deny (reuse `approveRequest`/`denyRequest` + optimistic + toast, gate `useCanPerform`), or at minimum a "Manage in Access Center" link. |
| **connect** | After a connector is set up, admins **cannot re-test connectivity or force a sync** — the routes are live but a stale `api-contracts.ts:63-64` comment claims they don't exist, so FE never wired them (0 call sites). | `POST /connect/connectors/{id}/test` · `/sync` · `GET /connect/connectors/{id}` | Delete the stale comment; add per-connector Test/Sync buttons to `ConnectorHealthStrip` (gate `connect:create/ingest`) + a detail drawer. |
| **data_quality** | The entire **threshold→breach loop is decorative**: no UI persists a threshold, so a breach can never fire. `setDmfThreshold` + `dmfThresholds` contract have **zero callers**; "Run a threshold check" only POSTs an ephemeral result. | `POST /data-quality/dmf/thresholds` · `GET /data-quality/dmf/thresholds` | Add "Save threshold" wired to `setDmfThreshold`; load/display active rules so breaches become configurable and inspectable. |
| **observability** | Resource monitors can be created & dropped but **never edited or attached to a warehouse** — created monitors govern nothing (`notify_users:[]`, no WH), and quota/threshold is immutable after create. | `PUT /observability/cost/monitors/{name}` · `POST /observability/cost/monitors/{name}/assign` | Add per-monitor Edit + "Assign warehouse"; let `CreateMonitorPanel` collect `notify_users` + optional warehouse. |
| **workflow** | Deployed/scheduled **task failures have no log viewer** — the logs endpoint is never called and `workflowApi` has no `getTaskLogs`. | `GET /workflow/{id}/tasks/{task_id}/logs` (days) | Add `getTaskLogs` + a "View logs" drawer from `ETLExecutionHistory` rows and `DeploySection`, with a days selector. |
| **governance** | Flagship **access-review is a read-only tile**: `access-review/summary` returns full arrays (`mfa_gaps[]`, `expiring_policies[]`, `orphan_grants[]`) but the UI renders only `.length`. Admin sees "Orphan grants 12" but not *which*. | `GET /gouvernance/access-review/summary` (arrays already fetched) | Make each count click-through to a table of the underlying rows (grantee/privilege/object; username; policy+expiry) with export + remediate affordance. |
| **CROSS-MODULE (mega)** — account_overview + governance + administration | The **platform RBAC/effective-grants suite is unwired platform-wide** (0 callers, not even in `api-contracts.ts`). The UI reconstructs a weaker matrix client-side and offers **no "what would this role see" simulator** and **no data-scope dimension**. | `GET /api/platform/permission-matrix` · `object-permission-matrix` · `users/{u}/effective-grants` · `users/{u}/object-grants` · `access-simulator` (?username=&role=) · `grants/data-scope` | Single initiative: add an "Effective Access" grid + per-user Access Inspector + an "Access Simulator" (role/user × page/tab/action → decision + `data_scope.rules`). Home it in governance/access-matrix and administration/access-center; add the effective-grid to the account_overview Security tab. Fetch lazily (8–14s cold) with skeletons. |
| **CROSS-MODULE (mega)** — administration (+ account_overview) | The **Data360 business-event audit trail is generated but never shown**: `events`/`events/feed` and the super-admin `audit/by-account` cross-account view have no surface. Admins see request latency but not "who did what, when, did it fail." | `GET /administration/performance/{account}/events` · `/events/feed` (event_type,status,limit) · `/audit/by-account` (super-admin) | Add contract+service getters and an "Activity / Events" tab (hub Performance or access-center Usage & Audit), with honest empty-states. Gate `audit/by-account` on `is_super_admin`. |
| **CROSS-MODULE (cluster, security)** — workflow, explore_design, intelligent, account_overview | **Governance-critical / infra mutations gate on role-strings or `userRole==='viewer'`, not `useCanPerform`** — a separation-of-duties hole. workflow Approve/Reject/Re-run deploy (`WorkflowSmartPanel.tsx:745-818` vs the correctly-gated Submit at `1628`); explore_design schema-clone + column DDL (`page.tsx:1415-1476`); intelligent Snowpark create/drop compute pools & services (`snowpark-services-content.tsx`, no `useCanPerform` import); account_overview account-lifecycle suspend/rotate-keys (`AccountLifecycleMenu.tsx:165-242`). | (gating change, no new endpoint) | Replace role-string/viewer checks with `useCanPerform('<module>','deploy'|'create'|'delete', projectId)` — the exact pattern already used by sibling tabs — and hide/disable on a resolved deny. |

---

## 4. P2 — Enrichment, Grouped by Theme

### 4A. Cache-invalidation freshness (4 findings → 1 helper)
Every mutation calls a local re-fetch but **never broadcasts** — `useCacheInvalidation` is subscribe-only with no client emitter. If the backend SSE doesn't emit on that specific write, sibling views go stale.
- **connect** — ingest creates catalog tables but publishes no `CATALOG*` invalidation (`page.tsx:2521`).
- **data_quality** — DMF associate/schedule/disassociate refresh only the DMF tab, leaving KPI bar / breach banner stale (contrast the Profiler path `page.tsx:2101-2104`).
- **observability** — ack alert / add SLO / create-delete monitor / suspend-resume task only local `load()`.
- **account_overview** — exec KPIs are a cached snapshot with manual "Refresh cache" only; no cache-stream subscription.

**Fix:** add a small client-side invalidation broadcast helper (or confirm+lean on the backend SSE per-route) and have these handlers also refresh their sibling summaries — mirror the Profiler `onDone` pattern.

### 4B. Server-side pagination / search / sort (9 findings → 1 sweep)
Lists fetch unbounded payloads and filter client-side; search silently returns false "no results" across pages. `hooks/useServerPagination.ts` already exists.
- **governance** — users / roles / enterprise-users (bare endpoints, no params).
- **data_quality** — 6 paginated tabs filter/search only the current page (`page.tsx:1887-1913`) → misleading empties.
- **connect** — stages/connections list + file browser ignore `search/sort/page` (tab strip overflows).
- **workflow** — run history capped (`limit` only, no `page/page_size`); older runs unreachable.
- **bi_dashboard** — data-products loads whole portfolio, no owner facet / limit.
- **intelligent** — query-analytics ignores server `severity` filter.
- **explore_design** — ingestion runs capped at 20 + client status filter.
- **workflow** — versions hide superseded (`include_superseded` unused); cost lookback `days` fixed.

**Fix:** thread `page/page_size/sort_by/sort_dir/search` (and the specific `severity`/`status`/`include_superseded`/`days` params) into the table components.

### 4C. RBAC gating hardening — lower-severity (beyond the P1 security cluster)
- **intelligent** — compute-heavy "Run Analysis" + recommendation lifecycle mutations ungated (credit-consuming).
- **observability** — SLO creation + CDC change-tracking borrow the `configure-alerts` permission (no first-class `configure-slo`/`configure-cdc` action in the registry).
- **data_quality** — DMF disassociate has no dedicated gate (only implicit via panel `canAssociateDmf`); a role denied delete can still tear down associations.
- **governance** — roles/page.tsx lacks the `isAdminRole` page-gate that users/access-matrix pages enforce (surface-consistency).

### 4D. AI / data capabilities half-built
- **explore_design** — business glossary service (list/lookup/upsert/**aiDraft**/remove) is fully orphaned, **zero importers**; surface a Glossary panel in Catalog with the AI "suggest definition" action.
- **connect** — AI connector helper proposes a new connector type but **cannot commit it** (no register endpoint); reframe as governance-ticket handoff or ship `POST /connect/connectors`.
- **intelligent** — AI Advisor never reads `recommendations/glossary` (the signals→actions rule registry); add a "Rules" drawer so admins see *why* a recommendation fired.

### 4E. Unwired secondary read-endpoints (surface with honest empty-states)
- **explore_design** — column-level lineage (`lineage/column`, only in api-health); Snowflake explorer facets/CSV-export/usage/deep-dive.
- **workflow** — task-status history (`{id}/task-status`, only in api-health) + async jobs monitor (`/workflow/jobs`).
- **data_quality** — DMF catalog/inventory (`dmf/catalog`, tables×metrics×breach counts) + run-history.
- **bi_dashboard** — retail-KPIs endpoint (advertised in Template Gallery, 0 callers); persisted global filters (`{id}/filters` CRUD, 0 callers → filters are session-only).
- **observability** — persisted spend-budgets (`/observability/budgets` CRUD — **verify it's deployed first**, gate behind `isRouteNotDeployed()` if it 404s); `sensors/all` + `tasks/importable`; app-level `platform-health` p95/error-rate to drive SLO "actual".
- **account_overview** — login/query audit trails (`command-center/audit/{login,query}-history`, `org-accounts/logins/failed`); Data360 telemetry breakdowns in Platform Activity.
- **administration** — per-tab workload rollup (`by-tab`/`tab/{tab}`).
- **governance** — dead `grantAction`/`grantPolicy` platform writers (either surface per-role action/policy toggles or remove).

### 4F. Missing CRUD + UX honesty (lower severity)
- **bi_dashboard** — no delete-dashboard action anywhere (`deleteDashboard` 0 callers, though `deleted` state is filtered in the list); no rename/edit of name/description after create.
- **explore_design** — schema-clone is fire-and-forget: `list/status/rollback` exist (used only by api-health) but no jobs panel / rollback UI.
- **observability** — alert ack records a fake `acknowledged_by:'current_user'` literal (send the real session username); SLO rows have no edit/delete; compliance reports viewable but not exportable; task suspend/resume use native `window.confirm` vs the shared `ConfirmDialog`.
- **administration** — hub Performance tab defaults to volatile in-memory `/admin/*` counters while the durable per-account audit drill-down is only a link (risk of divergent numbers).

---

## 5. Recommended Implementation Order — First 10 (value ÷ risk)

*Ordered highest value / lowest risk first. Items 1–6 are FE-only against confirmed-live endpoints or pure gating/UI — a single wave that removes every visibly-broken surface and closes the security holes.*

1. **RBAC gating cluster (security, P1).** Swap role-string/`viewer` checks for `useCanPerform` in **workflow** (deploy approve/reject/re-run), **explore_design** (schema-clone + column DDL), **intelligent** (Snowpark infra), **account_overview** (account lifecycle). *Highest priority: separation-of-duties hole, and the sibling-tab pattern already exists — near-zero risk.*
2. **account_overview** — wire Approve/Deny on the Access-Requests inbox (reuse existing `approveRequest`/`denyRequest`). Kills a dead-end for the admin's most visible queue.
3. **explore_design** — hide/disable the 6 dead schema-context-menu items. Removes a "broken" feel; UI-only.
4. **Presentability sweep** — hide the bi "Prevision → coming soon" card; relabel intelligent AI Agents/Semantic Views brochure tabs + drop unshipped bullets; add `/connect → /data-source-connection` redirect. Pure UI/config, removes all overpromising surfaces.
5. **connect** — delete the stale `api-contracts.ts:63-64` comment and add per-connector Test/Sync buttons (+ detail drawer). Endpoints are live; fixes a post-setup dead-end.
6. **governance** — make access-review counts click-through to the underlying arrays (data is *already fetched*). Flagship compliance value, effectively free.
7. **observability** — resource-monitor Edit + Assign-warehouse + collect `notify_users` on create (`PUT`/`assign` on the same live router). Makes budgets actually enforce.
8. **data_quality** — wire "Save threshold" (`POST dmf/thresholds`) + load active thresholds. Makes the breach engine configurable end-to-end (slightly higher risk: new create flow).
9. **workflow** — add `getTaskLogs` + a "View logs" drawer on execution/deploy rows. Real operational value for scheduled workflows.
10. **intelligent** — Vector Search "Embed a column" + similarity-search (reuse the already-wired `POST /cortex/embeddings`). Turns the read-only tab into the create/search it advertises.

**Then the two mega-initiatives** (larger, higher-ceiling, sequence after the quick wave): (a) the **platform RBAC / effective-grants suite + Access Simulator** across governance + administration + account_overview; (b) the **audit / event-feed spine** (`administration/performance/*` events + `audit/by-account` + `gouvernance/dashboard/*`). Both are mostly FE wiring against live endpoints but touch multiple modules and need lazy-loading UX for the 8–14s cold matrix calls. Fold the **server-side pagination sweep (4B)** and **cache-invalidation helper (4A)** in as cross-cutting refactors alongside these.

---

**Backend-dependent items to flag for product/backend (not FE-fixable now):** bi Prevision forecast/Cortex endpoint; connect `POST /connect/connectors` register; SLO `PUT/DELETE`; observability `/observability/budgets` (verify deployed); first-class `configure-slo`/`configure-cdc` action-registry keys; per-user MFA/SAML.