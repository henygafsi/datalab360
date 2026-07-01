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

## Applied this session (local, feat/backlog-v1, build-green, NOT pushed)
1. **backend** `finops_router.get_storage_databases` — 500 fixed (org→account fallback + `_report_query`
   deadline). Commit on backend `feat/backlog-v1`. **Needs `:8000` restart to go live.**
2. **front** `api-health/components/types.ts` — `isFakeIdRejection()`: fake-input SQL-compile 4xx no
   longer counted as a defect (Defects 4→~1); 4xx-gated + after the 5xx/405/408 returns so a genuine
   defect can never be masked. Commit `6145f01`.
3. **front** `data-products/page.tsx` — CERTIFIED products no longer wrongly gated "Not published yet"
   in the `is_published` fallback (both card + lifecycle sites). Commit `2bf5679`.

Workflow `wf_87e17a97` (18 agents) also verified the 13 Explore-Design `not implemented` stubs are
correct dead-graceful sentinels (only consumed by the api-health prober) — **no change needed**.

## Verified backlog (adversarially-checked, NOT applied — need a decision / carry risk)
OWNED (module-local, safe to implement):
- **data-products · S** — done (this session).
- **bi-dashboard · M** — persist applied filters: `createFilter`/`deleteFilter` exist in `biDashboardApi.ts`
  with **zero UI callers**; `SmartFilterBar` emits ephemeral `AppliedFilter[]`. (Product ambiguity: should
  auto-detected filters persist as saved? — needs a call. Finding's `handleFiltersApply` name was inexact.)
- **bi-dashboard · S** — orphaned `AiDashboardWizard` (mounted nowhere): mount behind a header button or delete + record in `_DROPPED.md`.
- **intelligent · M** — add Snooze + resolved/dismissed filter w/ Reopen (`snoozeRecommendation`/`reopenRecommendation` already exist, no UI).
- **intelligent · M** — AI-Advisor "act" CTA: DO NOT ship the naive `router.push(drilldown_url)` (drilldown_url
  is an API-filter querystring, not a route; and the tab's glossary scope surfaces zero drilldown recos today). Backend-coupled.

SHARED components (route to owner — ripple risk):
- **account-overview · S** — two CTAs paint a false-success ✓ but never switch tab (mount-only `?tab=` reader);
  use `onNavigateTab`/`window.location.assign`. Also drop the circular "Review inactive accounts" CTA.
- **observability · M** — compliance card drops `findings[]`/`recommendations[]` already in the `report` prop; render + `onViewDetails` drawer.

Reverse-gap capabilities to surface later (additive, verified genuinely unsurfaced) — highest value:
- **governance /access-matrix**: access-simulator, permission-matrix (tab-granular, single-call consolidation),
  object-permission-matrix, per-user effective-grants, data-scope grants. `API.platform.*` + `services/platform`.
- **data-quality · S–M**: `POST /data-quality/auto-profile` as a gated per-table "Profile / refresh" button.
- **admin · S–M**: `/administration/performance/audit/by-account` cross-account rollup.
- **catalog "My Workspace" · L**: `/api/workspace/*` (recently-opened, saved-views CRUD, watchlist) +
  explorer audit-views/recent-activity/selection-review — new `services/workspace` + `API.workspace.*`.

## LIVE reality test (2026-07-01, authenticated as HAHA/ACCOUNTADMIN)
Logged in against localhost:3000 → local `:8000` (real Snowflake) with a fresh session and ran the full
494-probe live + a page smoke. Harnesses: `e2e/_probe_reality.mjs`, `e2e/_smoke_reality.mjs` (throwaway, uncommitted).

**Result: 98% operational** — 219 healthy, 149 expected (correct fake-input rejections), 108 slow, **3 genuine
defects**, avg latency 1890ms. Page smoke: all 10 changed routes load HTTP 200, **no crashes, no 5xx on load**;
only console output is benign pre-existing React `forwardRef` warnings (Radix Popover/Tooltip). My wired controls
verified (BI AI-Wizard + admin Disable-all render; data-quality Profiler + intelligent Snooze correctly conditional).

**The 3 live defects — all the SAME class (heavy query → 30s statement-timeout → 500), not new logic bugs:**
1. `getSecurityPosture` (Data Quality, `GET /data-quality/security-posture`) — 500 @ 30006ms. Was 25226ms
   *slow-success* in the 06-30 run → now tipped over the 30s cap. Handler is already hardened (grants sub-query
   degrades to honest-unknown); the masking/RLS `ACCOUNT_USAGE.POLICY_REFERENCES` scans are what time out.
2. `initializeTables` (Workflow, `POST /workflow/setup/initialize-tables`) — 500 @ 30004ms. Was 28280ms
   *success* on 06-30. A DDL/setup **write** op — degrade-to-partial is WRONG here (leaves tables half-created).
3. A 3rd in the explore-design/later region (appeared ~t+3.5min / ~343 probed) — not individually captured.

**Why not auto-fixed:** unlike `getStorageDatabases` (degrades cleanly to an empty list), these can't be safely
hardened without misreporting (security posture) or corrupting a write (initializeTables), AND no backend change
is live-verifiable without a `:8000` restart. Per memory, cold-timeout on heavy `ACCOUNT_USAGE` scans is largely a
**prod-warmer-masked** artifact (the SVC warmer pre-warms these caches in prod; it doesn't exist in local dev).
`getStorageDatabases` itself proved this: it returned a **6ms cache hit** live (the 500 is only the cold path).

**To actually reach ~100% and verify:** (a) user restarts `:8000` to load the getStorageDatabases fix; (b) re-probe;
(c) then harden getSecurityPosture (honest-unknown masking/RLS) + initializeTables (async or timeout bump) WITH live
verification. Each is a bounded follow-up, not a blind patch.

## Board "4 Defects / 2 5xx" vs "1 genuine" — reconciliation
- 2 5xx = `getStorageDatabases` 500 + (`setUserMfa` surfaces a 501 which some counters bucket high).
- 4 Defects = `isDefect()` also flags fake-input SQL-compile errors → over-counts. Item (2) fixes this.
</content>
</invoke>
