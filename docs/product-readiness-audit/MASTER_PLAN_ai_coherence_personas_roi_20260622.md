# Master Plan — AI-guided · cross-module coherence · personas/collab · ROI (overnight 2026-06-22)

Goals (directional, not literal): a platform that uses LLM/AI to propose possibilities + guided steps/sub-steps **prefilled from context**, that **knows your sources**, frames **business value (ROI/TTM/cost/storage/deployment)**, all **governed + coherent cross-modules/projects**, with **collaboration & personas** fixed. Backed by the 4 research maps in this folder.

## Key facts (from research)
- **AI**: ~35 LLM endpoints; most wired in services, under-surfaced as guided CTAs. Context-prefill supported (project/schema/events).
- **Coherence**: deployed Explore models have NO provenance link to BI/products/catalog/observability; 3 competing active-project stores; `explore_project_id` missing everywhere.
- **Personas**: 6 conflicting role systems; `ContributorRole` type conflict (owner vs admin); `projectId` ignored in `useCanPerform`; collab features stubbed (removeContributor noop, no real-time chat, @mention no notify).
- **ROI**: `recommendations_service` already returns `{roi, ttm, business_impact, risks}`; `ai/savings` has `roi_multiplier`; many cost/storage endpoints unused (table-storage, cost-simulation, finops/anomalies, bi cost).

## Waves (by module = strict file ownership, no conflicts)

### WAVE 1 — high-leverage, bounded, FE-only (tonight)
| Owner | Changes |
|---|---|
| **explore-design/** | (a) Wire `?table=` deep-link param (DQ→Explore preselect); (b) AI ingestion-mode recommendation CTA in IngestionConfigPanel; (c) Deploy pre-flight AI card: combine score-deployment-risk + optimize-schedule (savings_vs_peak) + readiness into one ROI/risk panel; (d) honest error on removeContributor noop in AccessManagementSlot |
| **governance/** + shared/governance | (a) "Open in Explore" link on explore-type rows in governance/projects; (b) governance/users RBAC gate (`isAdminRole`); (c) policy-suggest: when classify-columns flags PII, propose masking/RLS CTA |
| **data-quality/** | Surface `dmf-suggest` as "Suggest checks" one-click in the rules tab |
| **hooks + workflow + services/api/types** | (a) key `activeProjectAtom` by module (fix last-write-wins); (b) unify `ContributorRole` → owner/editor/viewer (drop workflow `admin`); (c) WorkflowProjectGate → useProjectContext('workflow'); (d) removeContributor service: return real status (no silent noop) |
| **shared/command-center + org-accounts + bi-dashboard** | (a) render `roi.estimate` + `ttm` badges in cost recommendations rail (data already there); (b) FinOps anomaly alert card (`finops/anomalies`); (c) BI: add optional `explore_project_id` to widget config + "View in BI" deep-link from Explore deployed model |

### WAVE 2 — needs more wiring (next)
- Project ROI panel (aggregate ai/savings + warehouse-sizing + ingestion runs + estimate-vs-reference).
- Cortex Analyst NL→SQL inline (BI query bar, Explore preview) beyond the Intelligent tab.
- Top-Insights "what changed?" card on account-overview/observability.
- Governance policy auto-create from PII classification (full flow).
- DataProduct create: explore-project picker → prefill table_fqn (+ provenance).

### WAVE 3 — backend-dependent (your go to deploy)
- `projectId` honored in `/my-permissions` (project-scoped RBAC).
- @mention → notification rows; presence channel (SSE); chat real-time.
- Deployed-model registry endpoint `GET /explore-design/deployments` → cross-module provenance.
- Realized-vs-estimated savings tracking; cross-module cost attribution; per-project ROI rollup.
- The monetization axis (free 100k / live subscription+PAYG) from `explore_design_target_feasibility_*`.

## Discipline (lessons this session)
- Strict file ownership per agent (no two agents touch the same file).
- grep + ≤80-line offset reads (agents overflow on full-file reads).
- No commit; one consolidated `tsc` + `next build` gate after each wave; verify live vs the local backend (data flowing).
- Keep existing guidelines (light theme, same components, dark: variants preserved) — NO reskin.
