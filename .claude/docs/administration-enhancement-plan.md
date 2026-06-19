# Administrator — Full Enhancement Plan (governance · monitoring · warehouse · affectation)

Vision: ONE admin operating surface to **govern** (who-can-do-what), **monitor** (is it healthy + scaling), **cost** (warehouse/FinOps), and **operate** (assign roles/modules/features per account) Data360 at scale. Builds on the refactored 8-tab hub (`.claude/docs/administration-module.md`). All data from Snowflake **native metadata** on the caller's own connection (works localhost + prod, no SVC) unless flagged 🟠 USER_REQUESTS (SVC/prod-only).

## Native-metadata source map (the fuel)
| Need | ACCOUNT_USAGE / native view | Status |
|---|---|---|
| Calls/latency/errors | QUERY_HISTORY | ✅ wired (platform-health) |
| Warehouse credits/cost | WAREHOUSE_METERING_HISTORY | ✅ wired |
| **Warehouse load / queuing / concurrency** | **WAREHOUSE_LOAD_HISTORY** (AVG_RUNNING, AVG_QUEUED_LOAD, AVG_QUEUED_PROVISIONING, AVG_BLOCKED) | ❌ TODO — scalability |
| **Warehouse resize/suspend/resume events** | **WAREHOUSE_EVENTS_HISTORY** | ❌ TODO |
| **Cost trends (daily)** | METERING_DAILY_HISTORY / METERING_HISTORY | ❌ TODO |
| Storage | TABLE_STORAGE_METRICS / STORAGE_USAGE | ✅ wired (snapshot); trends ❌ |
| Grant lineage / graph | GRANTS_TO_USERS / GRANTS_TO_ROLES | ✅ users; roles-graph ❌ |
| Policy coverage | POLICY_REFERENCES / TAG_REFERENCES | ✅ wired |
| Access / who-accessed | ACCESS_HISTORY | ✅ wired |
| Logins / failed | LOGIN_HISTORY | ✅ wired |
| **Per-role/module/project cost** | QUERY_HISTORY.QUERY_TAG ⋈ QUERY_ATTRIBUTION_HISTORY | ❌ per-project only today |
| HTTP request trail | EVENT_STORE.USER_REQUESTS | 🟠 SVC/prod |

## Pillars

### P1 · Governance (who-can-do-what) — operate it
- ✅ grant lineage (granted_by/at), who-accessed-what, policy coverage, access history, entitlement matrix (table).
- ❌ **Role Permission Matrix → drill**: cell (role × privilege/object) → the underlying grants.
- ❌ **Grant operations from admin**: grant/revoke role/privilege with audit + RBAC (super-admin), confirm + optimistic.
- ❌ **Policy management**: list + create/apply masking/RLS/tag from admin (reuse governance policy services); coverage gaps → "apply policy" CTA.
- ❌ **Full role graph**: GRANTS_TO_ROLES → role→role inheritance + role→privilege→object tree.

### P2 · Monitoring of SCALABILITY (the new ask)
- ✅ calls/errors/latency KPIs, live server-metrics.
- ❌ **Warehouse load/queuing**: WAREHOUSE_LOAD_HISTORY → per-warehouse running vs queued vs blocked load (the scaling signal); flag warehouses that queue (need resize / multi-cluster).
- ❌ **Query queuing/concurrency**: QUERY_HISTORY QUEUED_OVERLOAD_TIME / QUEUED_PROVISIONING_TIME by warehouse — concurrency pressure.
- ❌ **Auto-scale / lifecycle events**: WAREHOUSE_EVENTS_HISTORY (resize/suspend/resume) timeline.
- ❌ **Time-series / sparklines** everywhere (DATE_TRUNC hour) — calls/errors/latency/credits/load trends. Biggest cross-tab gap.
- ❌ **Anomaly/spike signals**: error spike, latency regression, queue spike, failed-login spike (security).

### P3 · Warehouse usage / FinOps
- ✅ credits per warehouse (snapshot).
- ❌ **Cost trends** (daily METERING_DAILY_HISTORY) + compute vs cloud-services split over time.
- ❌ **Idle / under-utilized warehouses**: load ≈ 0 but credits burned → auto-suspend tuning CTA.
- ❌ **Per-role / per-module / per-project cost** (QUERY_TAG ⋈ QUERY_ATTRIBUTION_HISTORY) — needs general-path tag instrumentation first (per-project already wired in project_rollup_batch). Highest FinOps value.
- ❌ **Storage trends** + Time-Travel/Fail-safe cost.

### P4 · Operate · Affectation per account-role (the new ask)
A super-admin operating panel to ASSIGN, per account (and per user):
- ❌ **Roles**: grant/revoke account roles to users (GRANTS_TO_USERS write via SQL, RBAC super-admin, audited).
- ❌ **Modules**: enable/disable Data360 modules per account (the MODULES/apiName map + module_grants).
- ❌ **Features**: per-account feature entitlements (the existing matrix — extend to per-account column when multi-account).
- ❌ **Warehouses**: assign default/allowed warehouses per role.
- Bulk affectation + audit trail + RBAC (platform super-admin / ACCOUNTADMIN only). Cross-tenant only for `*`/ORGADMIN.

### Cross-cutting (immediate)
- ✅ pagination (no scroll) + responsive one-pager (done).
- ❌ **Report / export per page** (Phase 1): export the current view's rows + KPIs as CSV (+ a report header: tab, account, window, generated-at). Shared util + per-tab "Export" button.
- ❌ **Search ameliorations**: global admin search (jump to tab + pre-filter); multi-field per-table search with match highlight.
- ❌ **Display correctness**: audit each tab's backend return vs render — fix wrong units (error_rate ratio→% pattern), null→"—", empty-vs-not-deployed, account-scope. (Some fixed: ServerMetrics ratio, Config RBAC.)

## Phased delivery (prioritized)
- **Phase 1 — Reports + search + display fixes** (FE-mostly, this turn): export per page, search upgrade, a display-correctness sweep. Immediate, verifiable.
- **Phase 2 — Scalability monitoring** (BE+FE): WAREHOUSE_LOAD_HISTORY + queuing + WAREHOUSE_EVENTS_HISTORY + time-series sparklines. The "scalability/warehouse" ask.
- **Phase 3 — FinOps cost attribution** (BE+FE): cost trends + per-role/module cost (QUERY_TAG instrumentation + rollup).
- **Phase 4 — Affectation management** (BE+FE): per-account role/module/feature/warehouse assignment, RBAC-gated, audited.

Each phase: build → tsc/py_compile → commit feat/backlog-v1 → (backend deploy via CI on your go) → screenshot-verify. Constraint reminder: live verification needs a fresh login (auth expired) or your screenshots.
