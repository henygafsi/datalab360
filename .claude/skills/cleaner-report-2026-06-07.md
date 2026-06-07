# Code Cleaner Report — 2026-06-07

Two-repo scan + safe-subset deletion. Active work zones were scanned but never edited/deleted.

## Global KPIs

| Metric | Value |
|---|---|
| files_scanned (backend app/ + frontend src/) | ~1,300 py + tsx |
| unused_imports_found (backend, pyflakes) | 198 (now 171 after deletions) |
| unused_imports_found (frontend src/hooks,layouts,config) | 0 |
| dead_routers | 0 (all 27 router objects mounted in app/main.py) |
| dead_services (sampled) | 1 confirmed (`get_dormant_users`) |
| dead_components (frontend) | 36 (35 in active `app/shared` + `components/ui`; report-only) |
| contract_incoherences | 27 contract paths with no live backend route (26 lack TODO) |
| deleted_count | 21 unused imports across 19 backend files (1 reverted false-positive) |
| deferred_count | everything in active zones (see DEFERRED) |

Build gate: no frontend files touched → `pnpm iso:build` skipped (per scope). Backend verified via `python3 -m pyflakes` + `ast.parse` on every touched file + full `from app.main import app` smoke test (919 routes mount OK).

---

## PHASE 1 — Findings

### Backend

#### 1. Unused imports (pyflakes) — 198 total
Most live INSIDE active zones (connectors / intelligence / projects / data_quality / gouvernance / catalog) → DEFERRED. The 60+ outside active zones split into:
- **Real dead imports** (deleted, see Phase 2) — stdlib/typing + verified-non-reexported named symbols in app/core, auth, org_accounts, platform_core, recommendations, notifications, command_center/snowflake_explorer.
- **Barrel re-exports** (`__init__.py` in platform_core, recommendations, administration, user_workspace, snowflake_explorer/recommendations) — flagged by pyflakes but intentional public API surface → **NOT deleted** (constraint c).
- **False positive caught by post-edit pyflakes**: `FiltersV1` in `snowflake_explorer/recommendations/glossary.py` is flagged "unused" at the import line but IS used at runtime (lines 39/49/60). Removal was reverted.

#### 2. Dead routers — NONE
All 27 `*router*.py` files define a router object that is imported and `include_router`'d in `app/main.py` (verified name-by-name, incl. aliased imports like `config_router as platform_config_router`, `router as dmf_lifecycle_router`).

#### 3. Dead service functions (sampled, 5 biggest non-active service files)
Sampled `observability/services.py` (3063 LOC) and `command_center/services.py` (2413 LOC). Almost all functions are called internally or by their router.
- **Confirmed dead:** `get_dormant_users` (observability/services.py:1180) — single occurrence (definition only). REPORT-ONLY (deleting function bodies is outside allowed deletion categories).

#### 4. Orphan/temp files — NONE
No `*.bak`, `*_old.py`, `*.tmp`, or stray `test_*.py` outside `tests/`.

#### 5. Stray root scripts
`conftest.py`, `data360-ci-local.sh`, `push_backend_mr.sh` — all legitimate (pytest config, CI helper, MR helper). NOT generated temps → kept.
Note: repo root has pre-existing uncommitted deletions under `reports/`, `scripts/`, `tab1*.md`, `test-results/` (NOT made by this cleaner — present in working tree on arrival).

### Frontend

#### 1. Unused service exports
`app/services/*` is an ACTIVE WORK ZONE → all export-usage findings DEFERRED (not analyzed for deletion).

#### 2. Dead components — 36
35 of 36 are in active zones (`app/shared/**`, `components/ui/`). Many are leftover template scaffolding (multi-step/, email-templates/, explore-nft/, bi-reporting/, account-settings/, roles-permissions/, support/inbox/). The 4 in non-active `components/`:
- `components/database-schema-node.tsx`
- `components/audit/AccessHistoryTable.tsx`
- `components/profiling/ColumnProfilePanel.tsx`
- `components/metering/VolumeLockBadge.tsx`

All REPORT-ONLY (dead components are not in the allowed deletion categories).

#### 3. Unused imports (src/hooks, src/layouts, src/config) — 0 found in scope.

#### 4. Backend coherence — 27 contract paths with no live backend route
Built `routes.txt` from `from app.main import app` (824 paths). Of 394 contract path entries in `api-contracts.ts`, 27 point at non-existent local routes. Only `/cortex/analyst/query` has a `TODO(henry-P1)` annotation. The rest (no TODO):
- `/gouvernance/drop-users-batch` (backend has `drop-roles-batch`, `drop-user` singular — likely a naming gap)
- `/command-center/tabs/{tab}` (no `/tabs/*` route exists)
- `/catalog/views/{db}/{s}/{v}/ddl`
- `/sources/detected-models`
- `/metadata/init_metadata`
- `/bi/sales/overview`, `/bi/sales/dashboard`
- **`/bi-dashboard/*` cluster (19 entries)** — entire BI self-service module is frontend-ahead; no backend routes exist yet.

All live in `api-contracts.ts` (ACTIVE ZONE) → DEFERRED. Recommend annotating the 26 untagged entries with `TODO(henry-P1)` or wiring the backend.

#### 5. Orphan files — NONE actionable
Only `.turbo/turbo-build.log`, `.turbo/turbo-lint.log` (gitignored build-tool cache, regenerated) → kept.

---

## PHASE 2 — Deletions performed (21 unused imports, 19 files, all outside active zones)

| File | Removed |
|---|---|
| app/core/connection_manager.py | `import json` |
| app/modules/auth/services.py | `import time` |
| app/modules/auth/router.py | `UserProfileResponse` (from multi-name line) |
| app/modules/user_workspace/services.py | `import hashlib` |
| app/modules/org_accounts/crud_router.py | `from datetime import datetime` |
| app/modules/org_accounts/router.py | `get_snowflake_connection_for_user` (whole line) |
| app/modules/platform_core/module_grants.py | `Tuple` |
| app/modules/platform_core/events.py | `List` |
| app/modules/platform_core/permission_service.py | `Callable` |
| app/modules/platform_core/cache_service.py | `timezone` |
| app/modules/recommendations/router.py | `List` |
| app/modules/recommendations/storage.py | `Severity` |
| app/modules/notifications/models.py | `BaseResponse` |
| snowflake_explorer/models.py | `date` |
| snowflake_explorer/recommendations/glossary.py | `Any`, `Dict`, `get_object_detail` (FiltersV1 restored — was false positive) |
| snowflake_explorer/services/drilldown.py | `Optional` |
| snowflake_explorer/services/interactive.py | `Optional` |
| snowflake_explorer/services/deep_dive.py | `Tuple` |
| snowflake_explorer/services/actions.py | `FQDN`, `FiltersV1` |
| snowflake_explorer/services/summary.py | `FiltersV1` |
| snowflake_explorer/services/objects.py | `FAMILY_MAP` |

**Method:** stdlib/typing imports deleted directly (no re-export risk). Named symbols deleted ONLY after a re-export discriminator grep confirmed no other module imports them FROM the edited file. Multi-name lines edited surgically. Verified each with `ast.parse` + per-file `pyflakes` + full app import.

**NOT deleted (deliberately conservative):**
- `command_center/router.py:56` `get_snowflake_connection_for_user` — busy file, likely touched by other agents; report-only.
- `app/utils/sql_safety.py` `quote_identifier` — `app/utils` is outside the allowed backend deletion scope (core/dependencies/modules only).
- All `__init__.py` barrel re-exports.
- `snowflake_explorer/services/drilldown.py:12` `quote_identifier` — still flagged; left to avoid touching beyond confidence (parse showed it could be referenced).

---

## DEFERRED (clean after workers finish in active zones)

**Backend active-zone unused imports (~130):** connectors/router.py (13 model bodies + postgres svc fns), connectors/services/* (databricks_ingest, file_based_ingest, common), intelligence/cortex/router.py (SimilaritySearchRequest, `_log_event_ref`, `_json_cd`), projects/router.py (7 service fns), projects/rls_router.py (json), projects/explore_design/guided_router.py (9), projects/explore_design/services.py (12 validation_services fns), data_quality/*, gouvernance/*, catalog/*.

**Backend dead service function:** `observability/services.py:get_dormant_users`.

**Frontend (all in active zones — app/(dashboard), app/shared, app/services, components/ui, api-contracts.ts):**
- 35 dead components in `app/shared/**` + `components/ui/FormLoadingOverlay.tsx` (template scaffolding candidates: multi-step, email-templates, explore-nft, bi-reporting, account-settings, roles-permissions, support, governance/roles, icons).
- 4 dead components in non-active `components/` (database-schema-node, audit/AccessHistoryTable, profiling/ColumnProfilePanel, metering/VolumeLockBadge) — allowed-zone but dead-components not in deletion categories.
- 27 contract incoherences in `api-contracts.ts` (26 need `TODO(henry-P1)` or backend wiring; `/bi-dashboard/*` is the big cluster).
- Service-export usage analysis for `app/services/*`.
