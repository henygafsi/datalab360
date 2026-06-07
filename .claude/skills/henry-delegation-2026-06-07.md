# Henry — Backend Delegation (from Alice full-suite sweep — 2026-06-07)

> ## ⚠ CORRECTION (même jour, post-vague H1-H8) — manifest 823 → 847 paths
>
> Document produit sur un snapshot PÉRIMÉ (823 paths, avant la fin des agents H1-H8
> et la restauration bi_dashboard). Re-vérifié contre le manifest actuel (847 paths)
> + curl live api.datalab360.io :
>
> | Claim original | Statut réel |
> |---|---|
> | `/bi-dashboard/*` (19) "greenfield" | ✅ RESTAURÉ — module live en prod, remonté localement |
> | `POST /cortex/analyst/query` | ✅ FAIT (vague H5) |
> | `POST /gouvernance/drop-users-batch` | ✅ FAIT (vague H7) |
> | `/command-center/tabs/{tab}` | ❌ **SEUL VRAI P1 RESTANT** — consommateur réel (`services/command-center/index.ts:241`), 404 local ET live |
> | `/bi/sales/{dashboard,overview}` (2) | ⚰ DÉPRÉCIER — contrat sans consommateur, 404 partout |
> | `/catalog/views/.../ddl` | ⚰ DÉPRÉCIER — contrat sans consommateur |
> | `/sources/detected-models` | ⚰ DÉPRÉCIER — contrat sans consommateur |
> | `POST /metadata/init_metadata` | ✖ PAS UN GAP — textes d'erreur uniquement, aucun appel API |
>
> **Bilan corrigé : 27 annoncés → 1 vrai P1 + 4 dépréciations.**

Source: Alice ran across all 11 module skills. Endpoint existence resolved against the
authoritative backend route manifest (`from app.main import app` → 823 entries — STALE, voir correction),
NOT fabricated HTTP statuses (dev server was OFFLINE; `api.datalab360.io/health` = 200).

### Limitations (read before treating "0 gaps" as final)
- **Existence verified at PATH level, not METHOD level.** `routes.txt` was built from
  `{r.path for r in app.routes}` — paths only, no HTTP verb. The 27 ABSENT paths are
  grep-confirmed-missing (solid). But a "registered" path whose backend exposes only `GET`
  while the contract calls `POST/PUT/DELETE` would show as covered yet still need backend dev.
  Method-level (405 / wrong-verb) gaps in the 6 "fully covered" modules were NOT checked
  (the contract's verb lives in the FE service layer, not in `api-contracts.ts`). To close:
  spot-check mutating contract calls against `reports/backend-route-manifest.json` (method+path).
- **UX / panel KPIs are static-inferred / carried-forward**, not freshly measured this run
  (dev offline → page components not re-read). `smartrightbar_axes_ok`, `cortex_tips_manquants`,
  `insight_action_buttons_manquants` are summarized from each file's prior "Remaining Gaps" —
  do NOT read `0/8` as a fresh live audit. Endpoint KPIs ARE fresh (from the manifest).
- **`dataSource` (5 paths) is counted in both connect and sources** `endpoints_testés` — the
  ~390 figure double-counts that overlap; both modules have 0 backend gaps so the delegation is
  unaffected.
- **`bi-dashboard` has its own route (`(dashboard)/bi-dashboard/`) and `biDashboardApi.ts` but
  no own `page-*.md`.** Its 21 missing routes (19 dashboard + 2 retail) are attributed to
  account-overview for bookkeeping; they are a greenfield BI module, not an account-overview-native feature.

## Global delegation KPIs

| KPI | Value |
|-----|-------|
| modules_audited | 11 |
| contract_paths_checked | ~390 |
| routes_registered (covered) | ~363 |
| routes_missing (404 → backend dev) | 27 |
| modules_with_backend_gaps | 6 (account-overview, catalog, intelligent, explore-design, governance; BI under account-overview) |
| modules_fully_covered (0 backend dev) | 6 (connect, data-products, data-quality, observability, sources, workflow) |
| henry_p1_backend_tasks | 8 task groups, 27 routes total (BI = 2 groups: 19 dashboard + 2 retail = 21) |

## All needed backend dev (Henry P1) — by module

### account-overview  (22 missing routes — biggest block)
1. **BI self-service module — 19 routes** (`/bi-dashboard/*`): entire domain in `api-contracts.ts`, zero backend routes. CRUD dashboards/pages/widgets/filters + render/snapshot/drill-through/export + nl-to-chart/auto-create/templates/retail-kpis. New `backend/app/modules/bi_dashboard/` (router+service+schemas) + mount in `app/main.py`. Split into sub-tasks.
2. **BI retail — 2 routes**: `/bi/sales/overview`, `/bi/sales/dashboard`.
3. **`/command-center/tabs/{tab}`**: generic tab dispatcher missing (individual tab routes exist). `command_center/router.py`.

### catalog  (2 missing)
4. `GET /catalog/views/{db}/{schema}/{view}/ddl` — `catalog/router.py` + service (GET_DDL VIEW).
5. `GET /sources/detected-models` — connectors/sources router.

### intelligent  (1 missing)
6. `POST /cortex/analyst/query` — Cortex Analyst NL→SQL. `intelligence/cortex/router.py` (already TODO(henry-P1)-tagged in contract).

### explore-design  (1 missing)
7. `POST /metadata/init_metadata` — metadata bootstrap. `projects/explore_design/router.py` or dedicated metadata router + mount.

### governance  (1 missing)
8. `POST /gouvernance/drop-users-batch` — batch user drop (backend has `drop-roles-batch` + `drop-user` singular). `gouvernance/routers/`.

### Fully covered — no backend dev needed
connect, data-products, data-quality, observability, sources, workflow — 100% of contract paths registered. Remaining gaps there are frontend/UX (SmartRightBar wiring, CTA annotations, Cortex tips), which is out of scope for "backend dev."

## ⚠ Execution gate (must surface before Henry edits)

Every backend gap above lands inside the **active work zones** other agents are editing right now:
`app/modules/catalog/`, `connectors/`, `intelligence/`, `projects/`, `gouvernance/`, plus
`command_center/` and a new `bi_dashboard/` module. Per project rules + standing memory:
- This file IS the delegation (Alice Step 6 handoff). Henry **executing** these edits in-session
  would collide with concurrent agents and needs an explicit go.
- Backend changes are never committed/pushed without approval; frontend pushes go to `feat/backlog-v1`.

Recommended order when given the go: governance (1) → catalog (2) → intelligent (1) → explore-design (1) → command-center tab (1) → BI module (21, last — largest, greenfield, lowest collision risk).
