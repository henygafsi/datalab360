# Session-handling, SSE & activity-tracing anomaly scan

**Date:** 2026-06-28 · **Branch:** feat/backlog-v1 · **Mode:** read-only detection + one targeted fix (SSE singleton). **Scope:** frontend (`apps/data360/`). Backend items detected and deferred per direction.

Sources scanned: discussion history + project memory, temp audit harnesses (`e2e/_sse-count.mjs`, `e2e/_redundant-calls-audit.mjs`, `e2e/_ui-*-audit.mjs`), and the live code (`useCacheInvalidation.ts`, `CacheInvalidationProvider.tsx`, `useAuth.ts`, `useTrackEvent.ts` + all callers).

---

## 1. SSE connection duplication — **ANOMALY (FIXED this session)**

**Finding:** `useCacheInvalidation` (`src/hooks/useCacheInvalidation.ts:206`) is **not** a singleton — each call builds its own `AbortController` + `fetch('/cache-stream/stream')` (line 418) in its own `useEffect` (line 521). A prior session built the singleton `CacheInvalidationProvider` (mounted once in `(dashboard)/layout.tsx`) + broadcast atoms, but never migrated the direct callers. Grounded count (not the subagent's "7–11" estimate):

| File | direct calls | streams opened |
|---|---:|---:|
| `intelligent/snowpark-services-content.tsx` (4 sibling panels) | 4 | 4 |
| `shared/command-center/index.tsx` | 1 | 1 |
| `admin/data360-config/page.tsx` | 1 | 1 |
| `admin/platform-settings/page.tsx` | 1 | 1 |
| `bi-dashboard/page.tsx` | 1 | 1 |
| `hooks/useCatalogSmartBar.ts` | 1 | 1 |
| **+ Provider singleton (correct)** | 1 | 1 |

→ Intelligent page opened **~5** concurrent `/cache-stream/stream` connections; bi-dashboard/command-center/admin pages **2** each. Target is **1** per tab (the `_sse-count.mjs` harness header documents "singleton target: 1; pre-fix: ~5 per page").

**Fix applied:** added `useOnCacheInvalidation(keys, cb)` + drop-in `useCacheInvalidationSubscription({ onInvalidate })` to `CacheInvalidationProvider.tsx`. These subscribe to the Provider's broadcast `lastInvalidationAtom` (persisted, fresh object ref per event — not the 100ms-cleared `invalidatedKeysAtom`) and fire once per new event, seeding `seenRef` so a pre-mount event isn't replayed. All 6 callers swapped to the aliased subscription via a **single import-line change each** (call bodies untouched → behavior-preserving). Verified: only the Provider now imports the real stream-opening hook. tsc + eslint clean.

**Verification limit:** the live `_sse-count.mjs` proof needs a running dev server + `DATA360_E2E_PASSWORD` — neither available here. Confidence rests on the static guarantee (single importer of the stream hook) + code review, **not** a live connection count.

## 2. Session-read duplication — **MINOR ANOMALY (not fixed)**

`useAuth` (`src/hooks/useAuth.ts:36–51`) already dedupes via a module-level cache + in-flight promise. Bypassed by raw `fetch('/api/auth/session')` in 2–3 spots:
- `shared/org-accounts/tabs/warehouses-tab.tsx:286`
- `administration/components/CostGovernancePanel.tsx:392`
- `signin/sign-in-form.tsx:60` (sign-in path — acceptable)

→ Extra round-trips for `account_name`. Fix: read via `useSession()`/`useAuth`. **Low priority; candidate for W1 route-hygiene wave.**

## 3. SVC vs user-session provenance — **ABSENT (backend, deferred)**

The FE has no way to tell SVC-prewarmed (role-keyed Redis) data from live user-session data — no `X-Data-Origin`/`_meta.source` header or flag is emitted or consumed. Adding provenance is a **backend** response-metadata change (then a small FE badge). Detected; deferred per the FE-only direction.

## 4. Activity tracing scope — **GLOBAL, not project-scoped (partial fix candidate)**

`useTrackEvent` (`src/hooks/useTrackEvent.ts`) derives `module` from the URL only; `TrackEventPayload` has **no `project_id`**. Components hand-stuff `projectId` into `details` ad hoc (e.g. `bi_dashboard_created`). The user explicitly wants **tracing scoped to projects**. FE-safe additive fix: add optional `project_id` to `TrackEventPayload`, auto-attach from `useProjectContext`/URL. **Gated on confirming `POST /api/data360/track` tolerates the extra field** (backend ignores unknown keys → safe; verify first).

## 5. Listener/subscription duplication — **OK after §1**

`GovernanceDenialListener` is mounted once in the shell and dedupes denial bursts (4s window) — fine. The snowpark 4× re-subscription (the only other duplication) is resolved by §1.

---

## Remaining vision (detected, NOT yet built — needs scoping)

The message also asks for: approval **metadata in Account Overview**, **collab sharing history** (versions / payment), and **observability KPIs as product + ROI** (governance / security / cost / storage / utility). These overlap existing memory waves (account-overview enrichment, ROI/TTM badges) and are **underspecified**. They are NOT in this scan's scope; they need a requirements pass before building. One phrase — *"update when prod"* — is unparseable and needs clarification.
