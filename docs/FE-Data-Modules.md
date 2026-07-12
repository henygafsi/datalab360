---
tags: [frontend, module/connectors, module/explore-design, module/workflow]
---

# FE — Connect · Explore-Design · Workflow

## Connect (`/data-source-connection`, `/data-source-config`, `/sources`)
`SourceHub` (S3/Snowflake source selection & ingestion), `SourcesOverview`/`SourceTree` DWH explorer. `ConnectorHealthStrip` ← `/connect/connectors/health` is the **gold-standard component-level UX** (loading/empty/error/dark per component). Backend: [[Connectors]].

## Explore-Design (`/explore-design`, `/explore-design/catalog`)
Components in `app/(dashboard)/explore-design/components/`: `DesignDockPanel`, `DagViewer` (react-flow), `ColumnMappingModal`/`AddColumnModal`/`CreateTableModal`, ingestion trio (`IngestionConfigPanel` → `IngestionDryRunPanel` → `IngestionResultsPanel`), `ImpactAnalysisPanel`, `AuditTrailPanel`, `GovernanceAccessPanel`, plus `ai-guided/`, `deployment/`, `release/`. Catalog sub-page `?tab=` synced (Sources | Products | All). Backend: [[Explore-Design]], [[Catalog]].

## Workflow (`/workflow`, `/workflow/dev-tools`)
ETL DAG builder (desktop-gated ≥768 px): `ETLNodeTypes`/`ETLPalette`/`ETLConfigSidebar`, `WorkflowListCockpit`, `WorkflowSmartPanel` (⚠ rides `deprecated=True` deployment routes — migrate to `/deployments/track`), `GuidedAiWorkflowWizard`, `ScheduleManager`, `RunActionsMenu`/`RunCompareDrawer`/`RunFixRail`, `ETLExecutionHistory`, `TaskLogsDrawer`. Block catalog mirrors backend: `etl-blocks-catalog.json` + `custom-blocks-store.ts`. ⚠ `WorkflowProjectBar`: its `getRunSummary → /runs/summary` call is a phantom 404 (+ `completed` vs `succeeded` field mismatch), but its `UsageTab`/`CostTab`/`GovernanceTab` ARE imported by `WorkflowSmartPanel` — fix the summary call, don't delete the file. Backend: [[Workflow]], deployment tracking via [[Chat-Notifications-Workspace]].

[[Frontend-Home]]
