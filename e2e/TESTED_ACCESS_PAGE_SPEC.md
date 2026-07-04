# Spec — Administration › Tested Access page + user-info Role Switch (2026 standard)

Goal (user): role UX at 2026 standard — the **tested access matrix as a new page in Administration** (role × page × feature, post-test evidence, start with 2 users), **role visible + switchable in the user info menu**, and CRUD/design enhancement across administration. End goal: **test ALL**.

## A. New page: `/administration?tab=testedAccess` (11th tab, "Tested Access")

**Files (post-TCC):**
- `apps/data360/src/app/(dashboard)/administration/components/TestedAccessPanel.tsx` (new)
- register in `AdministrationHub.tsx` `TABS[]`: `{ id: 'testedAccess', label: 'Tested Access', icon: ShieldCheck }`
- data loader: `apps/data360/src/app/services/administration/testedAccess.ts` (new)

**Data source, two stages:**
1. **Stage 1 (ships immediately):** static import of `tested_access_matrix.json` (harness output copied to `apps/data360/public/test-results/tested_access_matrix.json` by the runbook; loader `fetch('/test-results/tested_access_matrix.json')`, honest empty-state if absent: "No test run yet — run e2e/_multirole-ui.mjs").
2. **Stage 2 (backend):** `POST /api/administration/test-runs` (harness uploads) + `GET /api/administration/test-runs/latest`; history keeps last N runs → trend sparkline. Small FastAPI router + table; follows `/api/administration/entitlements` pattern.

**Layout (matches AdministrationHub conventions, dark, no popups):**
- **KpiStrip** (existing shared component): Users tested · Pages · Features probed · Coverage % · Enabled/Disabled/Absent counts · Last run (relative). "—" when no run.
- **User comparator bar:** chips for each tested user (username + resolved role + login ok/fail). 2+ selectable → matrix shows side-by-side cell pairs (HAHA ✓ / D360V ✗ pattern makes privilege deltas instantly visible).
- **Matrix table:** rows = pages (sidebar order), columns = selected users; cell = page state pill (`renders`/`denied`/`redirected`/`empty` + read-only-banner badge) and, expanded, per-feature rows (`enabled ✓ green / disabled ◐ amber / absent ⊘ grey / untestable — hatched`).
- **Evidence rail (right, docked — no popup):** click a cell → screenshot (`shots/{user}_{route}.png`), probe type, timestamp, raw cell JSON. Uses the DockedFormPanel/right-rail pattern (per feedback: docked > modal).
- **Gating:** page itself visible to any authenticated user (read surface); "Upload/refresh run" action gated `useCanPerform('administration','write')` (mirror entitlements-toggle gating).

**Diff mode (differentiation check):** header banner if all selected users produ