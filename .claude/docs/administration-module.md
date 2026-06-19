# Administration Module — structure, KPIs/tables, CTAs, governance TODOs

Documents the **Administrator** module after the 2026-06 refactor (validated draw.io:
`vault/data360_full_doc/audits/ADMIN_RESTRUCTURE_2026-06-19.drawio`). For Claude: this is the
single source for the admin section's pages, data sources, the call-to-actions each KPI/table
should expose, the parts that are still unclear, and the governance to-dos.

> **CRITICAL data-source model — why pages look empty.** Three classes:
> - 🟢 **ACCOUNT_USAGE** (QUERY_HISTORY / ACCESS_HISTORY / LOGIN_HISTORY / WAREHOUSE_METERING) + **SHOW / INFORMATION_SCHEMA** → read on the **caller's own connection** → populate **localhost + prod**.
> - 🟢 **Config tables · Redis · process/host** → local services → populate everywhere.
> - 🟠 **EVENT_STORE.USER_REQUESTS** (the HTTP request trail) → written by `UserTracingMiddleware` **only via the background/SVC connection**. **No SVC locally** (cert lives in the prod container) → the middleware can't write it → **all-zero KPIs locally, identical across every window** (see `connection_manager.py get_activity_connection` comment). The fix was to add the ACCOUNT_USAGE-backed `platform-health` endpoint so monitoring isn't USER_REQUESTS-dependent.
> Local backend = `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` (no SVC). To see USER_REQUESTS data locally, point at a backend that has the SVC, or use the 🟢 sources.

## Module shape
- **Hub:** `app/(dashboard)/administration/page.tsx` → `administration/components/AdministrationHub.tsx` — one module, **7 tabs** via `?tab=<id>`, non-destructive (every old `/admin/*` + `/administration/*` route still works; the hub embeds self-contained panels or links into full pages). Sidebar front door wired in `layouts/carbon/carbon-menu-items.ts` (Administration → "Overview" → `routes.administrationHub`).
- **Tabs (id):** `health` · `performance` · `access` · `entitlements` · `api-health` · `server` · `config`.

---

## 1 · Platform Health  (`tab=health`)
- **Component:** `administration/components/PlatformHealthPanel.tsx` · **Service:** `services/admin-platform-health.ts` · **Endpoint:** `GET /administration/platform-health?hours=&user=&module=&limit=` (🟢 ACCOUNT_USAGE, own conn — **local + prod**). Backend: `app/modules/administration/platform_health_reads.py` (**LOCAL commit `26fbfe36` — NOT deployed; tab shows "not deployed yet" until a backend go**).
- **KPIs:** Calls · Error rate · Latency p50/p95/p99 · Distinct users · Distinct objects · Logins (failed). Real value or `—` (no fake-0).
- **Tables (FilterChips sub-views):** Top query types · By user · By warehouse · Top objects accessed. Sortable.
- **Filters:** window 1h/24h/7d · debounced search (client) · `user` (server param). · **AI:** "Analyze with AI" → `POST /cortex/complete` with the view context → docked panel.
- **KPI → CTA (to build/confirm):**
  | KPI | CTA |
  |---|---|
  | Calls | → drill to **Top query types** / By user (busiest) |
  | Error rate | → drill to **errored queries** (filter error_count>0) + cross-link to Performance › Errors |
  | p95 latency | → drill to **slowest** queries (sort By user / query type by p95) |
  | Distinct users | → **By user** view |
  | Distinct objects | → **Top objects** (ACCESS_HISTORY) → cross-link to Access Control |
  | Logins / failed | → cross-link to a **security / login-history** view (failed-login spike = CTA "investigate") |
- **Table-row → CTA:** By-user row → *view this user's grants & access* (→ Access Control); Top-objects row → *who accessed / object lineage / governance (tags, policies)*; By-warehouse row → *warehouse cost/perf* (→ FinOps); Top-query-type row → *query profile / optimize*.
- **UNCLEAR / confirm:** `error_rate` **units** — FE `fmtPct` treats it as already-a-percent (mirrors the perf endpoint); if backend returns a fraction (0.05) it would render "0.05%". **TODO: confirm against `platform_health_reads.py` on deploy.**

## 2 · Performance  (`tab=performance` → `/admin/performance`)
- **Page:** `admin/performance/page.tsx` (+ `components/{AxisPanels,DetailPanel,shared,usePerfFetch}.tsx`). **Endpoints:** `GET /administration/performance/{acct}/{overview,by-endpoint,by-user,by-module,by-cache/{axis},errors}` (🟠 **USER_REQUESTS — SVC/prod-only; empty locally**).
- **Axes:** Endpoints · Users · Cache · Modules · Projects · Errors. **KPI band:** Requests/min · Avg response (p50/p90/p99) · Error rate · Cache hit · Requests/5min · Deny rate · Distinct users · Distinct paths.
- **Filters (shipped):** window · account · debounced search · status sub-filter (errors 4xx/5xx; endpoints method). **Hierarchy:** per-row drill `focus` → cross-axis chips ("Errors on this endpoint"); master-detail `DetailPanel`. **AI:** Analyze-with-AI (→ `/cortex/complete`).
- **KPI → CTA:** Error rate → Errors axis · Distinct paths → Endpoints · Distinct users → Users · Cache hit → Cache axis (+ "invalidate/warm cache" action TODO) · Deny rate → filter denied requests (security).
- **Table-row → CTA:** Endpoint row → "Errors on this endpoint" (real) + "Users (context)" *(— context-only: user rows have no path field; chip self-labels `filter:`/`context:` so it never implies a scope it can't apply)*. Error row → open request/stack detail. User row → cross-link to Access Control.
- **UNCLEAR:** all axes empty locally (USER_REQUESTS). The **honest empty-state** explains it. **TODO: re-point the KPI band to the 🟢 platform-health endpoint** so Performance isn't empty locally (currently only the new Platform Health tab uses it).

## 3 · Access Control  (`tab=access` → `/administration/access-center` + embedded panels)
- **Components:** `administration/access-center/**` (AccessControlCenter, RolesPermissionsPanel), `admin/RealAccessPanel.tsx`, `admin/RoleGrantsPanel.tsx`, `administration/access-center/components/AccessHistoryPanel.tsx` (new). **Endpoints (🟢 own conn):** `gouvernance/users-with-roles`, `gouvernance/grants-for-role/{role}`, `d360-roles/{action-registry, ., {role}/permissions, effective/{username}}`, `administration/entitlements`, `governance-posture`, `observability/lineage/access-patterns` (ACCESS_HISTORY).
- **FIXED real bug:** `getRolesForGrantsMatrix` was typed `string[]` but rows are read as objects → empty rows. Added `RoleGrant` + `normalizeGrant()` in `services/governance/fetch_grants.ts` accepting **both** object + legacy-string shapes; string rows now render and are marked non-revocable. **TODO: confirm the live backend grant shape on deploy.**
- **Enhancements:** debounced search + "X of Y" · role→users drill-down chips · status filter · AccessHistoryPanel (top objects · access count · **distinct users** · last-seen).
- **Table-row → CTA:** Role row → view holders / grants / **revoke** (RBAC-gated); User row → effective permissions / their grants; Object row (access history) → who-accessed / lineage / **apply policy or tag** (→ Governance); Grant row → revoke (non-revocable string rows disabled w/ tooltip).
- **UNCLEAR:** the `/access-center` tabbed page's empty-on-load is a deliberate "select a role" prompt (not a bug). ACCESS_HISTORY is **object-grain only** — the feed has no per-user "who" (needs a USER_NAME join for true who-accessed-what).

## 4 · Entitlements & Feature Governance  (`tab=entitlements` → `/administration/feature-governance`)
- **Endpoints (🟢 config):** `administration/entitlements`, `entitlements/{module}/{feature_key}`, `governance-posture`. Module × feature enablement matrix.
- **CTA TODO:** per-cell toggle (enable/disable feature per account) with audit; filter by module/account; "governance posture" KPIs → drill to gaps. **Not yet given the filter/AI deep-dive treatment.**

## 5 · API Health  (`tab=api-health` → `/admin/api-health`)
- Endpoint prober (🟢 local). **CTA TODO:** "re-probe", filter by status, drill failing endpoint → its route/handler. Not yet enhanced.

## 6 · Server Metrics  (`tab=server` → `admin/ServerMetricsPanel.tsx` → `/admin/server-metrics`)
- Backend **process/host** metrics (🟢 local, **in-memory — RESETS on backend restart**). CTA TODO: thresholds/alerts. Not yet enhanced.

## 7 · Config & Settings  (`tab=config` → `/admin/data360-config` + `/admin/platform-settings`)
- Metadata/tables/date-columns/cache config (🟢 config). Already functional; CTA TODO: same filter/honest-empty polish.

---

## Governance — detail & TODOs (cross-cutting)
- [ ] **Grant lineage** — who granted what to whom + when (not surfaced; needs ACCESS_HISTORY/grants join).
- [ ] **Policy coverage** — which objects have masking/RLS/tags → cross-link from Top-objects + Access Control (governance-posture endpoint exists; not visualized per-object).
- [ ] **Role Permission Matrix → drill** to the underlying grants (cells clickable).
- [ ] **Who-accessed-what (user-grain)** — ACCESS_HISTORY join on USER_NAME for true per-user access trail.
- [ ] **Confirm grant shape** (object vs string) on backend deploy (normalizer handles both meanwhile).
- [ ] **RBAC gating** — every mutating CTA (revoke, toggle entitlement) must stay `useCanPerform`-gated (currently preserved).

## Open / unclear (flag before relying)
- 🟠 **Backend `/administration/platform-health` not deployed** (local `26fbfe36`) — needs a go. Until then the Platform Health tab shows "not deployed yet" (graceful).
- **Performance KPI band still USER_REQUESTS-sourced** → empty locally; re-point to platform-health (TODO above).
- **`error_rate` units** (fraction vs percent) — confirm.
- **Live verification pending** — all build-verified (tsc) only; the one-by-one endpoint test harness `e2e/ux-audit/_admin-endpoints-test.mjs` (17 endpoints) needs a fresh login: `E2E_TEST_USER=… E2E_TEST_PASS='…' E2E_TEST_ACCOUNT=… node e2e/ux-audit/_admin-endpoints-test.mjs`.
- **Remaining tabs (4·5·6·7)** not yet given the filter/drill/AI deep-dive.

## Commits (this refactor, on `feat/backlog-v1`)
`702fad2` perf deep-dive · `7737133` hub + nav · `555ba53` Platform Health + Access Control · backend `26fbfe36` (LOCAL, undeployed).
