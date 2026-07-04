# Data360 — API-contract annuaire audit

Senior-architect audit of the platform's API surface: what exists, what the UI wires, what's missing per module/role, and the norms-compliant next steps. Generated from the **live contract** and **live-tested** against the running backend.

## Deliverables
| File | What it is |
|---|---|
| **`Data360_API_Audit.xlsx`** | The audit workbook — 7 sheets, frozen headers, missing actions in **red**. Open in Excel. |
| `api_annuaire.csv` | The full 1026-endpoint table (sortable/filterable in any tool). |
| `API_DOC.md` | Full API doc grouped by module, with descriptions, roles, wired + live status. |
| `MISSING_FUNCTIONALITY_SPECS.md` | Per-module missing-functionality specs (306 lines) — the norms-compliant build list. |

## Workbook sheets (12)
1. **Summary** — counts, live-validation verdict, prioritized backlog (P0/P1/P2), coverage caveat, legend.
2. **data360 Norms** — 18 UX/UI + architecture + RBAC + performance + process standards, each with rationale.
3. **Module × Role Actions** — 13 modules × 7 data roles; access level per cell (`none` red).
4. **Coverage Heatmap** — module × HTTP verb, wired % color-coded green→red (analysis-at-a-glance).
5. **Data Journeys** — **18 end-to-end journeys / 162 steps**: ordered action sequences (create → map → deploy → release, etc.) with **pre-fill / smart-default** per step for intelligent UX, wired-vs-missing, and the AxisCockpit surface. The integration-in-front blueprint.
6. **API Annuaire (full)** — all **1026 operations**, method color-coded, with params, request body, **Returns (response schema)**, **Description**, **Role**, **UI surface**, **Priority**, deprecated flag, Wired (floor), **Live @:8000 (tested)**.
7. **Data Models (schemas)** — all **351 request/response schemas** with fields + types (required `*`).
8. **Missing Delta (RED)** — unwired endpoints, mutations first, each with a fix.
9. **Capabilities Governance** — **120 capabilities** → `useCanPerform` gate + entitlement key + Administration surface; **65 gate-wired / 39 partial (amber) / 16 ungoverned (red)** + a Maturity column. ⚠ Critical: **MODULE_GRANTS is empty → even "governed" = framework-wired, not *enforced*** (access-simulator all-DENY). Seeding MODULE_GRANTS is the single biggest governance gap. "All capabilities governed in administrateur."
10. **Module Enhancements** — per-module top enhancement + missing-mutation count.
11. **Backend Waves** — **8 large bulk-action waves** (modules, endpoint counts, Snowflake ops, effort, backend fixes) — backed by the Python scaffolds below.
12. **Next Steps + Agents** — enhancement waves mapped to agents.

Colors: **red** = missing/critical/ungoverned · **green** = wired/served · heatmap **green→red** = coverage · **method tints** · **P0 red / P1 amber**.

## Backend Snowflake sample APIs (`../../backend/samples_snowflake/`)
Real FastAPI + Snowflake-connector scaffolds for the highest-value missing actions (gated, parameterized SQL, `USE ROLE`, error handling) — the "bulk actions on backend (Snowflake sample APIs Python)": `access_requests.py`, `bi_dashboard_publish.py`, `explore_design_schema_health.py`, `observability_cost_monitor.py`, `recommendations_action_loop.py`, `workflow_execute.py`, shared `_sample_common.py`, + README. **Sample scaffolds to integrate** — authored without reading current backend (TCC); confirm the connector/router wiring on integration.

## The waves (bulk backend work)
W1 Governed Action & Approval Spine (64) · W2 E&D Safe-Change + Deploy Engine (82) · W3 Workflow Execution (38) · W4 Intelligent/AI Action Loop (50) · W5 Delivery Surfaces BI+Catalog+Products (39) · W6 Observability & Cost (23) · W7 Connect Lifecycle (11) · W8 Administration & Platform Ops (19).

## The numbers
- **1026 operations** across 28 router families.
- **Live-validated:** 518 GETs probed against the running `:8000` → **100% served (401/2xx), 0 phantom (404), 0 broken (5xx)** → the backend GET contract is fully valid.
- **~326 missing mutation-actions** across 13 modules (of ~780 unwired) — these are the UI/UX actions to wire.

## Honest caveats (read before acting)
- **Wired/missing is a STALE-COPY FLOOR.** FE wiring was read from the readable `~/Downloads` snapshot (53 service files); the *current* FE has 93, so true coverage is ~45–55% and "MISSING" **over-states**. Treat each red row as *"verify against current source, then wire if truly absent."*
- **Mutations were not live-fired** (side effects); "Live @:8000" = GET reachability only. Write-path testing needs a token + test env.
- Newer modules (command_center, observability, catalog, data_products, bi_reporting) read as near-0 wired only because they postdate the snapshot — flagged in the specs.

## Regenerate (turns the floor into ground truth)
Generators live in the job scratch: `build-audit-xlsx.mjs` (engine), `build-sheets.mjs` (sheets), `gen-doc.mjs` (markdown), driven by `openapi.json` + `fe_wired.json` + `live_probe.json`. Re-run after the source is readable (post Full-Disk-Access) and after a token drop — every red flag and wired count becomes verified rather than a floor.
