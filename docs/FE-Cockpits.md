---
tags: [frontend, module/command-center, module/org-accounts, module/observability, feature/scorecards]
---

# FE — Command Center · Org Accounts · Observability · Shared

## Command Center (`/account-overview`, shared `app/shared/command-center/`, 28 files)
`CommandCenterDashboard` (entry `index.tsx`) → `CommandCenterCockpit`, `ExecutiveOverview`, `AdnScoreCard`/`AdnAxes`, `AiAdvisor`/`AiActionBlocks`/`SnowflakeInsightsAdvisor`, `LineageFlow`, `SecurityMap`, `WorkflowPreviewCanvas`, tabs (snowflake-explorer, org-accounts, modules, dwh-action-plan), `MonitoringPanel`, `TopProblemsPanel`, `ActionsPanel`. Backend: [[Command-Center]], [[Snowflake-Explorer]].

## Org Accounts (`/client-accounts` + command-center org tab; shared `app/shared/org-accounts/`, 15 items)
`accounts-table`, `account-detail-modal`, `AccountCreationWizard`, `AccountLifecycleMenu`, `health-overview`, `AiComputeCostPanel`, `ResourceMonitorCreateRail`. Backend: [[Org-Accounts]].

## Observability (`/observability/*`)
`ObservabilityCockpit` + per-sub-page dirs; shared cards in `app/shared/observability/` (14): health-overview-tab, health-score-card, compliance-card, cost-overview-card, security-posture-card, cross-module-flow, trust-center-card. Backend: [[Observability]].

## Shared cross-cutting (`app/shared/`)
- `insights/` — Detect→Notify→Act glue: `GovernedActionButton`, `InsightActionButton`, `CapabilityGate`, `DryRunGate`, `useActionGate`, `RequestAccessBadge`. Backend: [[Recommendations]].
- `score-cards/`, `cockpit/` (`AxisCockpit`, `KpiStrip`), `source-hub/`, `project-context/`, `project-dashboard/`, `chat/`, `data-preview/`, `action-rail/`, `context-bar/`, `bottom-panel/`.
- Grain guardrail: cockpit/account-grain KPIs ← `/command-center/kpis/{dim}` + `/recommendations`; per-object ← `/catalog/objects/{id}/scores` + `/catalog/recommendations?object_fqn=`.

[[Frontend-Home]] · [[Frontend-Architecture]]
