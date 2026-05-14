# Next UX/UI cleanup — audit & backlog

Snapshot after the slice that just shipped on
`feat/ux-notifications-deploy-tracking-20260514`:

- ✅ **Slide 1** — inline project wizard replaces ProjectSelector modal
- ✅ **Slide 6 + 7** — live notification dropdown + header deploy chip,
  per-deployment status/duration/step in every row, backend DDL
- ✅ **Wave 1 cleanup** — 50 dead exports removed (−934 lines)

The remaining slides + the discovered debt fall into four buckets below,
ordered by **return-on-cleanup**: quick wins first, then the heavier UX
work.

---

## Bucket A — Quick wins (under 1h each, mostly delete)

| # | What | Where | Effort | Why |
|---|---|---|---|---|
| A1 | **Delete or activate ApprovalPanel** | `app/(dashboard)/explore-design/components/ApprovalPanel.tsx` | 5 min | Imported in `page.tsx` but never rendered (no state controls it). Pure noise. Delete unless slide 4's approval-chain preview will land it back. |
| A2 | **Kill MessagesDropdown** (or wire it) | `layouts/messages-dropdown.tsx` + every layout that mounts it | 15 min | Hard-coded `messagesData` mock + always-pulsing green dot. There's no chat API behind it (the real chat module is in `app/shared/chat/ChatSidebar.tsx`). Either delete the header dropdown or rewire the dot to the chat unread count. |
| A3 | **Consolidate header-menu-right** | `layouts/helium/header.tsx`, `layouts/lithium/header.tsx`, `layouts/boron/header.tsx` | 30 min | `<MessagesDropdown />` + clones of the bell block are duplicated across helium / lithium / boron header variants. Pick one source of truth (the carbon one we already touched) and re-export. |
| A4 | **Drop the `viewMode='semantic'` tab** | `app/(dashboard)/explore-design/page.tsx` | 20 min | Deck slide 1 asks: "Supprimer la tab sementic et les actions redondantes". Move its couple of useful actions into `TableOptionsSidebar`. |
| A5 | **Remove duplicate imports flagged by lint** | `app/(dashboard)/explore-design/page.tsx:49,61,79` | 5 min | ESLint already flagging `no-duplicate-imports`. One-line fixes. |

**Total: <1.5h, drops ~600 lines, zero risk.**

---

## Bucket B — Single-surface UX (1–4h each)

| # | Slide | What | Where | Effort |
|---|---|---|---|---|
| B1 | 2 | **Right-rail History panel** reading `EVENT_STORE.DESIGN_EVENTS` (last 20 events scoped to current project) | `app/(dashboard)/explore-design/page.tsx` (add right rail) + new `RightRailHistory.tsx` | 2h |
| B2 | 2 | **Promote `recordEvent` to write-through** — today buffered in a Jotai atom and only flushed on deploy. Each user action POSTs a single event. | `app/services/explore-design/index.ts` + `stores/event-store.ts` | 3h |
| B3 | 3 | **Merge modeling canvas context menu + TableOptionsSidebar** — single source of truth for rename/PK/FK/policy actions | `app/(dashboard)/explore-design/components/ModelingCanvas.tsx` + `components/TableOptionsSidebar.tsx` | 3h |
| B4 | 4 | **Hard pre-check gate before deploy** — `canAdvanceAtom` returns false until errors clear | `stores/deployment-store.ts` + `components/deployment/StepDryRun.tsx` | 1h |
| B5 | 4 | **PolicyDiffViewer** in `StepReview` — today the diff is DDL-only, masking-policy changes don't render | `components/deployment/StepReview.tsx` + new `PolicyDiffViewer.tsx` | 3h |
| B6 | 7 | **Wire the deployment popup to the new `/deployments/track` endpoints** — calls `startDeployment` on open, `advanceStep` per Next button, `completeDeployment` on terminal | `components/deployment/Step*.tsx` + `DeploymentContext.tsx` | 4h |
| B7 | 9 | **BI dashboard: replace `AddChartPanel` modal with right-side drawer** so the user sees the canvas while configuring | `app/(dashboard)/bi-dashboard/components/AddChartPanel.tsx` | 3h |
| B8 | 9 | **DQ dashboard: same drawer pattern** for "Add check" + add a `<TextToDQCheck />` composer slot | `app/(dashboard)/data-quality/PageBuilder.tsx` | 3h |

---

## Bucket C — Cross-cutting infrastructure (≥1 day each)

| # | Slide | What | Effort |
|---|---|---|---|
| C1 | 5 | **Drafts in EVENT_STORE, not localStorage** — table `EVENT_STORE.DRAFTS` + `useDraft<T>` hook + migrate `deployment-store`, `dashboard-store`, `ai-store`, ETL builder | 1d |
| C2 | 8 | **Workflow events module** — symmetric to deployment_tracking: `WORKFLOW_PROGRESS` table + `recordWorkflowEvent` + chip extended to show workflow runs alongside deploys | 1d |
| C3 | 8 | **Snowflake-task → workflow project import** — `POST /workflow/tasks/import` + `WORKFLOW_TASK_LINK` mapping table; promote button in `TasksPanel` | 1d |
| C4 | 8 + 9 | **Unified `/cortex/generate/{kind}` route** for workflow / dashboard / dq generators; one ChatComposer component used in three pages | 1d |
| C5 | — | **Workflow ETLPipelineBuilder.tsx is 2231 lines / 92KB** — split into `ETLNodeManager.tsx` + `ETLStepForm.tsx` + `etl-blocks/*` utilities; nothing changes UX but maintainability ↑↑ | 1d |

---

## Bucket D — Endpoints missing in OpenAPI (from `api_audit/audit_details.md`)

124 frontend calls that aren't in `/openapi.json`. Group:

| Top segment | Calls | Strategy |
|---|---:|---|
| `/explore-design/*` (29) | many `/ai/*` stubs (`optimal-schedule`, `savings-summary`, `warehouse-sizing`, `discover-relationships`, …) | Either ship backend stubs returning 501 with a `feature_flag_off` marker, or gate the callers behind `useFeatureFlag('ai_recos')` so they don't fire. **Recommendation: gate.** |
| `/workflow/*` (11) | compute-pools, notebooks, services, git/repositories, `run-python`, `run-sql` | See `api_audit/workflow_gap.md`. Either remove the front callers OR coordinate with backend to ship the routes. The deck slide 8 implies these features ARE wanted. **Recommendation: keep, ship backend.** |
| `/analytics/*` (10) | whole module — `user-activity`, `query-performance`, `warehouse-usage`, `cost-attribution` | Decide: front pages exist (`app/services/analytics/index.ts`) but backend doesn't. Either ship backend or hide the pages behind a feature flag for v1. |
| `/governance/*` (6) | English-spelt routes (vs French `/gouvernance/*` the backend serves) | Remap the front callers — pure rename, low effort. |
| `/bi/sales/*` (2) | likely renamed to `/bi-dashboard/*` | Remap. |
| `/observability/{data-lineage,object-dependencies}` (2) | backend probably exposes one under a different path | Spot fix. |
| Misc (4) | `/api-proxy/health/summary`, `/org-accounts/dashboard/overview`, `/cortex/ml/document-ai/templates`, `/gouvernance/policies/dmf/references` | Per call-site judgement. |

---

## Top-5 priority for the next session

If we resume after the Vercel preview validates the slice on-branch, do
them in this order:

1. **A2 — Kill MessagesDropdown** (15 min). Header gets cleaner, the
   chip + bell live solo, no more fake pulsing.
2. **A1 + A4 + A5** — three deletes / one consolidation (≤30 min total).
3. **B6 — Wire the deployment popup to `/deployments/track`** (4h). This
   is the last lap to make the new chip + notifications carry real data
   end-to-end. **Without B6 the chip stays empty in prod.**
4. **B1 — Right-rail History panel** (2h). Big visible win for slide 2;
   uses an EVENT_STORE read we already have.
5. **B3 — Merge canvas + sidebar menus** (3h). Removes the duplicate
   "open Options" friction users hit constantly in modeling.

**Total**: ~10h to land Wave 2 of the cleanup, all of which sit on
the same Vercel preview branch.

---

## Vercel preview URLs to test

- Front MR creation: <http://gitlab.datalab360.io/azouari/datalab360Front/-/merge_requests/new?merge_request%5Bsource_branch%5D=feat%2Fux-notifications-deploy-tracking-20260514>
- Back MR creation: <http://gitlab.datalab360.io/root/backend/-/merge_requests/new?merge_request%5Bsource_branch%5D=feat%2Fux-notifications-deploy-tracking-20260514>

What to look at on the preview:
- `/explore-design` with no project → inline wizard fires (Identify /
  Context / Confirm). No popup.
- Header bell → empty inbox until the backend has the DDL applied + a
  notification is broadcast. Once `notifications_setup.sql` runs and
  somebody calls `POST /notifications/broadcast`, badge counter
  increments within 30s.
- Header deploy chip → invisible until `deployment_tracking_setup.sql`
  runs and `POST /deployments/track` is called. Then it shows the
  active deploy with progress bar + duration; click → resume.

If the Snowflake DDL hasn't been applied yet, **the front degrades
gracefully**: `/notifications` returns 404 → bell shows 0, chip stays
hidden. Nothing else breaks.
