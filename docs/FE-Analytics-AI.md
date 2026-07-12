---
tags: [frontend, module/bi-dashboard, module/cortex, module/data-quality, module/data-products]
---

# FE — BI Dashboard · Intelligent · Data Quality · Data Products

## BI Dashboard (`/bi-dashboard`, `/bi-dashboard/[projectId]`)
`DashboardEditor`/`DashboardGrid`/`GridChartCard` (react-grid-layout), `DynamicChart`/`ChartPaletteRail`/`AddChartPanel`, AI build (`AiDashboardWizard`, `AutoCreateModal` → `/bi-dashboard/nl-to-chart`, `/auto-create`), `SmartFilterBar`/`TimeIntelligenceBar`/`DrillThroughPanel`, `BiSmartRightBar`, `LandingCockpit`, templates. Backend: [[BI-Dashboard]].

## Intelligent (`/intelligent?tab=`)
Single-page AI hub: tabs semantic-models, cortex-chat, ai-advisor, ml-features. `IntelligentCockpit`, `AskLanding`, `AiCostBadge`/`AiSessionCounter`. Services `services/cortex/*`. Backend: [[Cortex]].

## Data Quality (`/data-quality`)
DQ dashboard + `SmartRightBar` — best-instrumented surface (all 9 dimensions, full loading/empty/error/dark states). Backend: [[Data-Quality]].

## Data Products (`/data-products`)
Catalog with lifecycle/publish/recommendations panels; object-level 5-dim gold KPIs via `/catalog/objects/{id}/360` + `/scores`. Backend: [[Data-Products]], [[Catalog]].

### Right-panel ecosystem (cross-module)
`ObjectSmartPanel` (+Trust Scores ← `/catalog/objects/{fqn}/scores`, CTAs from `recommended_actions`), `ContextRightBar` (⚠ "Ask AI" Send button dead ~line 625), `QualityPanel` (⚠ "Duplicate risk"/"Freshness" MetricCards hardcoded), `ProjectContextPanel` (weakest: 5/6 tabs placeholder), `ActionRail`, `ContextBar`. ⚠ `useCatalogSmartBar.ts` was dead and is deleted (its SSE auto-refetch + History ideas remain worth reviving); `services/catalog/rightbar.ts` is **live** — imported by GovernanceAccessPanel, ObjectSmartPanel and (dynamically) ContextRightBar. Use a stable module-level URL factory to avoid useSection refetch loops.

[[Frontend-Home]]
