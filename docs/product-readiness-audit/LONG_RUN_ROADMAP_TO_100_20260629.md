# Data360 — Long-run roadmap to 100% (objective audit + iterative plan)

**Date:** 2026-06-29 · **Mode:** read-only audit (4 Sonnet agents) + synthesis · **Scope:** frontend; backend items flagged + deferred (separate repo, deploy-gated).

**Hard constraints (from the directive):** dry-runs & tests are **free**; **no production scheduling** until payment; the cost→pay flow must be *ready* but charge nothing; governance display is **admin/project-owner gated**; Snowflake/web complexity must be made **simple**; AI/agent must act **only through governed, traced, approval-gated** actions.

---

## 0. What already exists (the base — don't rebuild)

| Capability | Where | State |
|---|---|---|
| **MCP test/enrichment engine** | `tools/mcp/` — `data360-health` (`probe_endpoint`, `run_health_matrix` over the 1020-op catalog), `data360-roles` (`provision_persona`/`teardown_persona`, `access_matrix`, `data_access`, `watch_cache_invalidations`), `data360-ux` (`render_route`, `sweep_routes`, `page_perf`), `data360-snowflake` | working |
| **Cost→dry-run→pay primitive** | `app/shared/insights/DryRunGate.tsx` (free sample dry-run vs costed real run w/ `{credits,usd,note}` + `paymentRequired`; payment capture = deliberate TODO) | ready, no charge |
| **Action-level RBAC** | `useCanPerform` + `GovernedActionButton` + action-registry | enforced |
| **Governance-denied → request-access** | `GovernanceDenialListener` (shipped this session) | enforced |
| **Real-time cache** | role-aware `@account_role_cache` + SSE singleton (fixed this session) | working |
| **API catalog** | 1020 ops, FunctionalApiView in `/admin/api-health` | working |

---

## 1. Objective findings by pillar (folded from the 4 audits)

### Pillar A — Govern *every feature + every action* (display show/hide per role)
**Root issue: four fragmented registries, only two enforced.**

| Registry | Enforced at runtime? |
|---|---|
| Module-level (`modules.ts` + `/user/me/modules` → `allowedModules`) | drives sidebar — **but `allowedModules` is fetched and never consumed** |
| Action-RBAC (`action-registry` + `useCanPerform`) | **YES** (the only real gate) |
| GUI-permissions (page-level, `getMyPageAccess`) | **NO** — write-only; never read in middleware/layout |
| Feature-entitlements (`/administration/entitlements`) | **NO** — no `useFeatureEnabled` consumer exists |

P0 defects: **module-key mismatches** silently break grants — `connect`↔`connect_datalake`, `org_accounts`↔`client_accounts`, `intelligent`↔`cortex`. Whole modules ungated (mapping, account-overview, client-accounts, dashboard). No approval on **BI publish/share, data-product publish, cortex generate, workflow execute**. Mutation **tracing** covers only ~11 files; `TrackEventPayload` has **no `project_id`**. `useCanPerform` ignores `projectId` (account-global).

### Pillar B — State-of-the-art UX per feature
P0: **brand violations** — `StepConfigure.tsx:186` "Deploy directly to Snowflake", `:411` "Create Snowflake TASK", `StepConnectSource.tsx:26` "Existing Snowflake table" (customer-facing). **Explore&Design modal overload** (10+ modals; the docked `ContextRightBar` is bypassed). P1: tab ARIA only correct in Intelligent (6 modules lack `role="tab"`); **4 different right-panel implementations** (unify to one `RightTabPanel`); color-only status badges (WCAG 1.4.1); **progressive disclosure** for warehouse complexity (sqlDBM/Lucidchart two-phase entry). P2: Observability landing needs KPI strip + tab bar; Intelligent 12 tabs → 3 groups; Workflow dynamic-import has no loading state. P3: "DMF" → "Quality Checks" alias; cross-module footer + Tailwind dynamic-class purge; split 3000-line pages.

### Pillar C — Endpoint coverage / MCP enrichment (toward 100%)
1020 ops; governance functionally ~100% — only **12 genuinely-unwired** (mainly `/api/platform/grants/*` data-scope + `/projects/{id}/rls`), **99 wired-but-hardcoded** (contract debt), 19 false positives. The `data360-health` MCP `run_health_matrix` is the enrichment/coverage spine.

### Pillar D — "Prompt-to-automate" data-role agent
Surfaces exist (cortex-chat, recommendations, action-registry, GovernedActionButton, approval inbox) but are **not composed into an agent** that proposes governed actions. No agent today turns a prompt into project/module/grant actions.

### Pillar E — Cost prediction → dry-run → pay-later
`DryRunGate` is the primitive but is wired in only a few explore-design/workflow spots; **no backend per-action cost-estimate** feeds `estimatedCost` (passed manually); payment capture is an open decision (W8). Dry-run/free path works.

### Pillar F — Scalable test matrix
Engine exists (`data360-roles` `provision_persona`/`access_matrix` + `data360-ux` `sweep_routes` + `data360-health` `run_health_matrix`). **Blocker:** live per-role data tests need the local backend (SVC alive) + valid login — saved Playwright auth expired; deployed host SVC is dead.

---

## 2. The 100% definition (Definition of Done per pillar)

- **A:** one enforced **(module, feature, action)** catalog; admin can show/hide *any* feature/action *per role*; every mutation traced w/ `project_id`; high-impact mutations approval-gated.
- **B:** zero brand violations; one `RightTabPanel` + `TabBar` (ARIA) across all modules; all 4 states + dark + a11y per page; progressive disclosure for warehouse data.
- **C:** 0 genuinely-unwired needed endpoints; hardcoded paths migrated to `api-contracts.ts`; `run_health_matrix` green per role.
- **D:** prompt→plan→(governed, dry-run, approval, traced)→execute agent live, account-admin/project-owner gated.
- **E:** every costed action behind `DryRunGate` with a real predicted cost; pay step ready (charges nothing); **no prod schedule**.
- **F:** per-role × module × action matrix green in CI against local.

---

## 3. Long-run phased roadmap (iterative; each wave: build → `pnpm iso:build` → MCP/Playwright verify → commit → re-audit)

| Phase | Wave | Deliverable | Agents/tools | Needs |
|---|---|---|---|---|
| **P0 quick wins** | W-A0 | Brand P0 strings + 5 explore-design modals → docked `ContextRightBar` | code + `/review-ux` | FE |
| | W-A1 | Fix module-key mismatches; consume `allowedModules` in sidebar | code | FE |
| **Govern everything** | W-A2 | Enforce GUI-permissions in dashboard layout/guard (page show/hide per role) | code | FE |
| | W-A3 | `useFeatureEnabled(module,feature)` hook → gate feature surfaces (entitlements become real) | code | FE |
| | W-A4 | **Unified `(module,feature,action)` catalog** = single admin surface to toggle display per role; backfill ungated modules; converge the 4 registries | code + backend (registry endpoint) | FE + backend |
| | W-A5 | Trace every mutation (`trackFeatureClick`) + add `project_id` to `TrackEventPayload` | code | FE (+verify track route) |
| | W-A6 | Approval flows: BI publish/share, data-product publish, cortex generate, workflow execute → `GovernedActionButton` approve + inbox | code | FE + backend |
| **UX first-class** | W-B1 | Shared `TabBar` (ARIA) + unified `RightTabPanel` across modules | code + `/review-ux` | FE |
| | W-B2 | Color→icon status; progressive disclosure (Explore&Design); Observability/Intelligent tab restructure; loading states | code | FE |
| **Coverage/MCP** | W-C1 | Wire the 12 unwired gov endpoints (data-scope, project RLS) | code | FE + verify backend |
| | W-C2 | Migrate 99 hardcoded gov paths → `api-contracts.ts` | code (mechanical) | FE |
| **Automation agent** | W-D1 | Prompt→plan: agent proposes actions from the action catalog (read-only plan) | code + cortex | FE |
| | W-D2 | Execute path: each proposed action runs through `useCanPerform` → `DryRunGate` (free) → approval (governor/modeler/admin) → traced run; account-admin/project-owner gated | code | FE + backend |
| **Cost/pay** | W-E1 | Backend per-action cost-estimate endpoint → feed `DryRunGate.estimatedCost`; wire `DryRunGate` on all costed actions | code + backend | backend |
| | W-E2 | Payment step ready (provider chosen) — **charges nothing; no prod schedule; dry-run/test free** | code | **payment-provider decision** |
| **Test to 100%** | W-F1 | CI matrix: `provision_persona` per role → `sweep_routes` + `access_matrix` + `run_health_matrix` → assert display/cache/grants | MCP servers + Playwright | **live backend + creds** |

**Iteration loop:** after each wave, re-run the relevant audit agent (UX / action-governance / coverage) to confirm the gap closed and surface the next — converge on 100% rather than one-shot.

---

## 4. Blockers / decisions (gate specific waves)

1. **Live test creds (W-F1):** export `DATA360_E2E_PASSWORD` or refresh `e2e/.auth/state.json` (expired 6 days ago). Front is already repointed to local `:8000`.
2. **Backend "go" (W-A4/A6/C1/E1):** registry-convergence endpoint, approval state, cost-estimate, project RLS, the `PROJECT_ID` column migration for project-scoped RBAC — all backend, deploy-gated.
3. **Payment provider (W-E2):** required to finish the pay step (still charges nothing).
4. **Secrets hygiene:** backend `app/.env` is tracked in git — rotate + gitignore.

---

## 5. Recommended start (no blockers)
**W-A0 → W-A1 → W-A2/A3 → W-B1**: brand fixes + modal-docking + key-mismatch repair + enforce page/feature governance + unified TabBar/RightTabPanel. All pure-FE, build-green, and directly deliver "make complex simple" + "admin governs display of any feature/action" — the core of the directive — while creds/backend/payment unblock the rest.
