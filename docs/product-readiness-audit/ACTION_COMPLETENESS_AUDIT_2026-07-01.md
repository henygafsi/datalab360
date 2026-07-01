# Action-Completeness & Interactivity Audit — 2026-07-01

Goal: audit every feature's UI for missing CRUD / assign / revoke / etc. actions, unclear or dead-end
controls, and wire the gaps (front) / enhance the backend where genuinely missing.

## Ground truth
- **496 backend mutation ("action") endpoints; only 16 have no front path reference** → backend action
  coverage is ~97% wired. Backend is ahead of the front (as always in this repo).
- The path-heuristic's blind spot (and the real signal): an action **wired in a service but with no button**
  (e.g. a `deleteFilter` that exists but nothing calls), and **destructive controls without confirmation**.
  These need per-feature component reading, done across 3 waves below.

## Applied & committed (local `feat/backlog-v1`, build-green, NOT pushed)
Wave B — wire "backend-exists / no-button" actions (`a414007`):
- **data-quality** — per-table "Profiler" → `POST /data-quality/auto-profile`
- **explore-design** — "Save layout" → `PUT /explore-design/projects/{id}/erd` (persists ERD positions)
- **intelligent** — Snooze (1/7/30d) + Active/Archived filter + Reopen for recommendations
- **bi-dashboard** — mounted the orphaned AiDashboardWizard behind a gated "AI Wizard" button

Shared-component fix (`290b97f`): account-overview drill CTAs (`SnowflakeAccountsTab`, `OrgAccountsTab`) painted
a false-success ✓ via a same-page `router.push('?tab=')` that the mount-only tab reader ignored → now use
`onNavigateTab` and actually switch tabs.

Wave C — destructive-confirm parity + one dead-capability wire (`f060023`):
- **governance/PolicyCard** — per-object policy **Revoke** now routes through `ConfirmDialog` (was 1-click)
- **governance/ProjectCollaborationPanel** — comment **Delete** now confirms
- **administration/FeatureGovernanceMatrix** — bulk **"Disable all"** now confirms with a blast-radius message
- **observability/budget** — `deleteCostMonitor` had **zero callers** → wired a gated per-row **Delete** button

Correctly returned **"no change"** (gap not real — anti-churn): obs alert-ack (already wired), account-MFA
enforcement toggle (already in AccountLifecycleMenu), projects RLS bindings (endpoints exist but no host surface +
feature-gated OFF), and all of workflow / users / explore-design mutation coverage.

## Convergence
Three passes on a mature app: each wave yields fewer, narrower fixes. Wave C: 3/6 modules pure no-change; the
other 3 gave 4 verified fixes; **0 rejected across all waves**. **The action-completeness audit has converged** —
a Wave D of "wire existing" would return near-zero. Remaining work is **feature-builds** (new surfaces), which
need a product decision and can't be verified against the live backend (no `:8000` restart this session).

## Feature-build backlog (needs your decision — these are NEW surfaces, not button-wires)
| Feature | Orphan service fns (real, unwired) | Why it's a build |
|---|---|---|
| **Governance access-matrix** | access-simulator, permission-matrix, object-permission-matrix, users/{}/effective-grants, grants/data-scope | new panels on `/governance/access-matrix` |
| **Observability spend-budgets** | createSpendBudget/update/delete + `listSpendBudgets` renders nowhere | whole list+form surface missing |
| **Observability cost-monitor edit** | updateCostMonitor, assignCostMonitorWarehouse | prefilled edit panel + warehouse picker |
| **Governance per-user MFA** | setUserMfa / getUserMfaStatus | new gated toggle (users table shows MFA read-only) |
| **Governance SAML SSO** | createSAMLIntegration | SAML branch (issuer/SSO-url/x509) in the OAuth wizard |
| **Governance security-matrix bulk** | initializeSecurityMatrix, bulkCreate…, deleteSecurityMatrixByRole | import/seed/by-role surfaces |
| **Explore-design cascade-impact** | cascadeDrop/cascadeRename/validateFkTypes + `CascadeConfirmModal` imported, never rendered | trigger + impact-compute glue |
| **"My Workspace" layer** | `/api/workspace/*` saved-views CRUD, watchlist, recently-opened | new `services/workspace` + UI |
| **Projects RLS bindings** | `POST/DELETE /projects/{id}/rls` | row-access authoring form (feature-gated OFF) |

Judgment-call one-liners (left, your call): workflow "Re-run deployment" confirm parity; explore-design saved
event-template delete confirm (localStorage-only); contract-hygiene nits (obs alert-ack + account-MFA use a
BASE_URL path instead of an `API.*` entry).
</content>
