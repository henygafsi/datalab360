# Endpoint Health — Ground-Truth Audit (2026-07-01)

Trigger: user pasted an `/admin/api-health` probe export (494 rows) + a screenshot
showing **"54% Success rate"**, asking to "fix all endpoints errors … reach 100%".

## The reframe (READ THIS FIRST)
The 54% is a **metric artifact, not 226 broken endpoints.** The probe drives every
endpoint with a fake id (`__test_health_check__`), a fake table (`TEST_TABLE`) or an
empty body, so most "warn" rows are the backend **correctly** rejecting bad input.

### Honest classification of all 494 probed endpoints
| Bucket | Count | Meaning |
|---|---:|---|
| Healthy (fast 2xx) | 207 | fine |
| **Expected — fake-input rejection** | **202** | backend correctly 404/400/422s the probe's fake id / empty body — **not defects** |
| Slow ≥3s (22 severe ≥8s) | 62 | real perf (mostly inherent ACCOUNT_USAGE latency; prod SVC-warmer only) |
| FE-stub (no backend route) | 13 | FE functions documented as not-implemented (all Explore-Design) |
| Expected authz / 501 | 2 | correct by design (`setUserMfa` 501, `deleteReaderAccount` needs ORGADMIN) |
| Transport re-probe | 1 | `listEventTemplates` transient blip |
| **Genuine 5xx defect** | **1** | `getStorageDatabases` → 500 |

**Operational rate = 491/494 = ~99%.**

### The screenshot is stale
- Screenshot timestamp: **30 Jun 21:20**. `api-health/page.tsx` mtime: **30 Jun 21:39** (19 min later).
- The current committed board already replaced the single "Success rate" tile with
  **"Operational rate" (~99%)** + **"Healthy rate" (~54%)** side by side, plus a legend
  (`KpiStrip.tsx:48-49`, `page.tsx:1189 operationalRate`, `1510 successRate={operationalRate}`).
- The label "Success rate" the user screenshotted **no longer exists in the code.**
  → The honest-metric work is **already done**; do not rebuild it.

### The UX-display ask is also already largely built
`FunctionalApiView.tsx` already renders, per endpoint: Action (what it does),
Description, **Paramètres** (name/in/required), **body fields**, **Retourne**, live/stored
**timing**, and **"Fraîcheur / température des données"** (cache TTL · scope · key strategy).
That is exactly "all info of functional and params and temp of data entries per endpoint."

## What is genuinely left (the real work)
1. **`getStorageDatabases` 500** — FIXED in `backend/app/modules/org_accounts/finops_router.py`
   (org→account fallback + `_report_query` deadline → degrade-to-partial-200). Static-verified
   (py_compile). **Needs `:8000` restart by the user to go live.**
2. **api-health defect classification polish** — fake-input-induced SQL-compilation errors
   (`TEST_TABLE does not exist`) are currently counted by `isDefect`, inflating the board's
   own "Defects: 4" vs the true ~1. Make them Expected.
3. **13 FE-stubs (Explore-Design)** — verify UI reachability; graceful self-disable for dead ones,
   wire the live-journey ones (e.g. saveTemplate/applyTemplate if a "Save template" control exists).
4. **Reverse-gap** — 23 backend routes with no FE surface (≈15 real capabilities: access-simulator,
   permission-matrix, effective-grants, workspace saved-views/watchlist/investigation-modes,
   snowflake-explorer/*, data-quality/auto-profile). Verify + surface the high-value ones.
5. **Per-module data-journey UI gaps** — missing UI that breaks an end-to-end journey (NOT the
   4-axis/a11y pass — that was done 2026-07-01 in `UX_AUDIT_OVERNIGHT_2026-07-01.md`).

## Board "4 Defects / 2 5xx" vs "1 genuine" — reconciliation
- 2 5xx = `getStorageDatabases` 500 + (`setUserMfa` surfaces a 501 which some counters bucket high).
- 4 Defects = `isDefect()` also flags fake-input SQL-compile errors → over-counts. Item (2) fixes this.
</content>
</invoke>
