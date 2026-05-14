# Data360 frontend cleanup report

Driven by `api_audit/dead_services_agent.json` (Explore agent recon) +
`api_audit/audit_details.json` (live OpenAPI cross-reference).

Strategy chosen: **aggressive — also drop callers of missing-in-OpenAPI
endpoints, interleaved per module**.

## Wave 1 — dead service exports removed

`tsc --noEmit` is clean after the deletions. **934 lines removed across 11 files.**

| File | Lines | Funcs removed |
|---|---:|---|
| `app/services/api/exploreDesignApi.ts` | -173 | `batchMetadata`, `bulkConfigIngestion`, `configIngestion`, `configMasking`, `createClone`, `createEventTemplate`, `createSchedule`, `detectSensitive`, `executeClone`, `rollbackClone`, `rollbackDDLAction`, `saveExploreState`, `saveModel`, `singleMetadata`, `validateAllFkTypes`, `activateSchedule`, `approveSchedule`, `cancelDeployment`, `rejectSchedule` |
| `app/services/api/workflowApi.ts` | -49 | `createActionTemplate`, `reorderSteps`, `activateSchedule`, `approveSchedule`, `cancelDeployment`, `rejectSchedule` |
| `app/services/api/projectsApi.ts` | -25 | `startRun`, `completeRun`, `saveState` |
| `app/services/api/biDashboardApi.ts` | -13 | `fetchWidgetChartData`, `updateDashboard` |
| `app/services/explore-design/index.ts` | -437 | `deployEventsImmediate`, `executeQueries`, `scheduleDeploymentUnified`, `validateEventsBackend` |
| `app/services/governance/policies.ts` | -143 | `createCustomRLSPolicy`, `createRoleBasedRLSPolicy`, `createSessionRoleRLSPolicy`, `createUserFilterRLSPolicy`, `healthCheck`, `updatePolicyMetadata` |
| `app/services/governance/fetch_grants.ts` | -10 | `availableObjectTypes`, `availablePrivileges` |
| `app/services/governance/index.ts` | -10 | `getClientDashboardAll` |
| `app/services/cortex/ml-features.ts` | -8 | `cosineSimilarity` |
| `app/services/data-quality/index.ts` | -5 | `setQualityThresholds` |
| `app/services/org-accounts/utils.ts` | -61 | `formatShortDate`, `getAlertIcon`, `getCloudColor`, `getCloudIcon`, `getEditionColor` |

**Functions retained** (initially flagged dead by the Explore agent but
verified to have intra-file callers after recheck — agent didn't scan
within the source file):

- `generateEventSQL`, `generateBatchSQL`, `recordDesignEvents` in
  `services/explore-design/index.ts` — used by the deploy flow
  helpers further down in the file.
- `getMaskingPolicyDetailsBatch` in `services/governance/policies.ts`
  — called by `listMaskingPolicies`.

Lesson for the audit pipeline: when scoring "dead", grep the *same*
source file too, not just other files.

## Wave 2 — UI-detached pairs

The 4 service↔service circular exports (`activateSchedule`,
`approveSchedule`, `cancelDeployment`, `rejectSchedule` in both
`exploreDesignApi.ts` and `workflowApi.ts`) are folded into Wave 1
above. They had no UI caller and only called each other, so both copies
are gone.

## Wave 3 — endpoints missing from OpenAPI (next pass)

`audit_details.json` flags 124 frontend endpoints absent from
`/openapi.json`, concentrated in:

| Top segment | Count | Action plan |
|---|---:|---|
| `/explore-design/*` | 29 | Module pass — many are AI/observability stubs (`/ai/optimal-schedule`, `/ai/savings-summary`, `/ai/warehouse-sizing`, `/approvals/{id}`, `/schema-changes/{projectId}`, `/scheduled-deployments`, `/policies`). Either gate behind feature flag or remove callers. |
| `/workflow/*` | 11 | Already detailed in `api_audit/workflow_gap.md` — compute-pools, notebooks, services, git/repos, run-python, run-sql. Remove front callers OR coordinate with backend to ship the missing routes. |
| `/analytics/*` | 10 | Whole module absent backend-side. Decide: kill the front pages or ship the backend. |
| `/governance/*` | 6 | English-spelt routes the front uses (vs French `/gouvernance/*` the backend serves). Front needs to migrate; backend may have moved. |
| `/bi/sales/*` | 2 | Likely renamed to `/bi-dashboard/*`. Re-map. |
| `/observability/{data-lineage,object-dependencies}` | 2 | Backend probably exposes one of these under a different path. Remap. |
| `/api-proxy/health/summary`, `/org-accounts/dashboard/overview`, `/cortex/ml/document-ai/templates`, `/gouvernance/policies/dmf/references` | 4 | Spot fixes per call site. |

This wave needs per-endpoint judgement (gate vs remove vs remap), so
it's queued for the per-module UX passes below.

## Wave 4 — UX changes by module (in progress)

Following the deck `/Users/datalab360/Documents/d360.pptx` (9 slides).
Interleaved with the endpoint cleanup of each module.

### Explore-design (slides 1–7)

| Slide | Change | Status |
|---|---|---|
| 1 | Inline onboarding wizard, kill `ProjectSelector` modal | next |
| 1 | Drop `viewMode='semantic'` tab; relocate actions into TableOptionsSidebar | pending |
| 2 | Right-rail "History" panel reading from `/explore-design/{projectId}/events` | pending |
| 2 | Write-through `recordEvent` (today buffers in atom, only flushes on deploy) | pending |
| 3 | Single source-of-truth between canvas context menu and `TableOptionsSidebar` | pending |
| 4 | `PolicyDiffViewer` in deploy review (today diff is DDL-only) | pending |
| 5 | Move deployment drafts off localStorage onto `EVENT_STORE.DEPLOYMENT_DRAFTS` | pending |
| 6 | Per-step `errorsByStepAtom`; auto-close + notification on success | partly done (notifications slice landed) |
| 7 | Async deploy + docked progress chip; SSE/poll for status | pending |

### Workflow (slide 8)

| Slide | Change | Status |
|---|---|---|
| 8 | Chat-to-workflow generator (`POST /cortex/generate/workflow`) | pending |
| 8 | Promote Snowflake task → workflow project (`POST /workflow/tasks/import`) | pending |
| 8 | Submit-for-approval reuses deployment popup pattern | pending |
| – | Add `recordWorkflowEvent` (workflow service has no audit-trail today) | pending |

### BI dashboard (slide 9)

| Slide | Change | Status |
|---|---|---|
| 9 | Inline drawer instead of "add chart" modal | pending |
| 9 | Linked-data inspector (lineage of a widget) | pending |
| 9 | `POST /cortex/generate/dashboard` | pending |

### Data Quality (slide 9)

Same as BI plus `POST /cortex/generate/dq_check`.

## Notifications slice (already landed)

End-to-end notification system — SQL DDL, backend module, frontend
service + hook + live dropdown — is installed and type-checks. See
`backend/app/modules/notifications/README.md`. This unlocks slide-6
("notification tab for all users") and slide-7 ("notify when long
deploy finishes").
