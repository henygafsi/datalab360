# Account Overview — Command Center UI Reference

## File: `command-center/index.tsx`
**Route:** `/account-overview` | **Module ID:** 13

---

## Architecture

```
CommandCenterDashboard (main component)
├── GlobalFilterBar — Cross-tab cascading filters
├── Tabs (9 tabs)
│   ├── OverviewTab — Platform summary, module health, radar, activity feed
│   ├── ProjectsTab — Projects & deployments with AuditTable
│   ├── SecurityAdvTab — Login/MFA/client types with AuditTable
│   ├── GovernanceGrantsTab — Roles, policies, grants with AuditTable
│   ├── DataOperationsTab — Data loading + automation (merged)
│   ├── PerformanceTab — Query latency, slow queries with AuditTable
│   ├── CostTab — Credits, storage, billing
│   ├── ComputeTab — Warehouses, replication, tasks/pipes
│   └── PlatformActivityTab — Data360 events, sessions, audit with AuditTable
└── Shared Components
    ├── KpiCard — Metric card with icon, trend arrow
    ├── SectionCard — Titled card container
    ├── AuditTable — Generic sortable/filterable table
    ├── ChartTooltip — Dark-mode chart tooltip
    └── LoadingSection — Centered loader
```

---

## Reusable Components

### GlobalFilterBar
Persistent filter bar above all tabs. Cascading filters:
- **Period** — 7d, 30d, 90d, 180d, 365d
- **Project Type** — explore_design, workflow, bi_dashboard
- **User** — from `/filter-options` usernames
- **Role** — owner, editor, viewer
- **Environment** — production, staging, dev
- **Status** — pending_approval, approved, deployed, failed
- **Module** — connect, explore_design, workflow, etc.
- **Clear All** — resets to defaults (`{ days: 180 }`)

Filter state persists across tab switches. Changing any filter triggers re-fetch of the active tab.

### AuditTable
Generic sortable/filterable/paginated table. Features:
- **Column sorting** — click header for asc/desc with arrow indicators
- **Column search** — toggle filter row with per-column text search
- **Pagination** — configurable page size (default 15), page buttons
- **Row count** — "1–15 of 234" badge
- **CSV export** — downloads filtered/sorted data
- **Dark mode** — full dark mode support
- **Status badges** — auto-renders status columns as colored badges via `statusBadgeColor()`
- **Relative time** — renders timestamps as "2h ago" with full date tooltip

**Usage:**
```tsx
<AuditTable
  data={data.recent_deployments}
  title="Recent Deployments"
  pageSize={20}
  columns={[
    { key: 'project_name', label: 'Project', sortable: true, filterable: true,
      render: (v) => <span className="font-medium">{v}</span> },
    { key: 'status', label: 'Status', sortable: true, filterable: true,
      render: (v) => <Badge color={statusBadgeColor(v)}>{v}</Badge> },
    { key: 'deployed_at', label: 'Deployed', sortable: true,
      render: (v) => <span title={v}>{relativeTime(v)}</span> },
  ]}
/>
```

### KpiCard
Metric display card with icon, trend arrow, and color.
```tsx
<KpiCard label="Credits (30d)" value={1234} icon={DollarSign} color="amber" trend={-5} suffix="%" />
```

---

## Tab Components

### 1. OverviewTab
**Data:** `SummaryResponse`, `ModuleHealthResponse`, `ActivityFeedResponse`, `IntelligentKpis`, `AccountHealthScoreResponse`
**Layout:**
- 6 KPI cards (users, projects, quality, credits, MFA, AI models)
- Module health grid (4 cols, status dots)
- Observability radar chart + recent activity feed

### 2. ProjectsTab
**Data:** `ProjectsOverviewResponse`
**API:** `getProjectsOverview(filters)`
**Layout:**
- 5 KPI cards (total, explore, workflow, pending, success rate)
- 3 charts: projects by type pie, deployment status pie, daily runs bar
- AuditTable: recent deployments (sortable, filterable)
- Pending approvals list
- Members & contributors panel

### 3. SecurityAdvTab
**Data:** `SecurityOverviewResponse`
**API:** `getSecurityOverview(days)`
**Layout:**
- 5 KPI cards (logins, success rate, failed, MFA, policies)
- Login trend composed chart (success vs failed stacked bars)
- Client type pie chart, MFA coverage progress bar
- AuditTable: failed login attempts

### 4. GovernanceGrantsTab
**Data:** `GovernanceGrantsOverviewResponse`
**API:** `getGovernanceGrantsOverview(filters)`
**Layout:**
- 6 KPI cards (roles, policies, tags, grants, users, object types)
- Policy distribution pie, grants by object type pie
- Grants per role bar chart, privilege distribution bar chart
- Policy coverage cards, roles per user list
- Recent grant changes list
- AuditTable: audit trail

### 5. DataOperationsTab
**Data:** `DataOperationsOverviewResponse`
**API:** `getDataOperationsOverview(filters)`
**Layout (merged Data Loading + Automation):**
- 6 KPI cards (files, rows, volume, success, task runs, active tasks)
- Section: Data Loading — daily volume composed chart, pipe activity, loading errors
- Section: Automation — task execution trend stacked bar, active tasks, dynamic tables
- AuditTable: recent failed tasks

### 6. PerformanceTab
**Data:** `PerformanceOverviewResponse`
**API:** `getPerformanceOverview(days)`
**Layout:**
- 5 KPI cards (queries, P50, P95, slow queries, query types)
- Query latency trend (P50/P95/P99 area+line)
- Query type distribution bar, compile vs execute area chart
- AuditTable: slowest queries

### 7. CostTab
**Data:** `CostBreakdownResponse`
**API:** `getCostBreakdown(30)`
**Layout:**
- 5 KPI cards (credits, trend, storage, balance, daily avg)
- Daily credit trend area chart
- Cost by category pie, top warehouses bar
- Storage breakdown pie, credit balance grid

### 8. ComputeTab
**Data:** `InfrastructureResponse`
**API:** `getInfrastructure()`
**Layout:**
- 4 KPI cards (warehouses, total credits, top consumer, replication DBs)
- Warehouse credits horizontal bar chart
- AuditTable: warehouse details (name, total/compute/cloud credits)
- Replication databases list, tasks/pipes/clustering/MV summary grid

### 9. PlatformActivityTab
**Data:** `PlatformActivityResponse`, `ActivityFeedResponse`, `SummaryResponse`
**API:** `getPlatformActivityFiltered(filters)`, `getActivityFeed(100)`
**Layout:**
- 6 KPI cards (events, sessions, peak users, modules, roles, permissions)
- User sessions composed chart (sessions bar + unique users line)
- Module usage pie, governance stats grid
- AuditTable: full activity feed (module, event, user, status, time)
- AuditTable: platform audit trail (action, entity, by, when)

---

## Data Flow

```
mount → fetchOverview() + getFilterOptions()
tab switch → fetchActiveTab() with current filters
filter change → re-fetch active tab with new filters
refresh → clear all data → fetchOverview()
```

### State Variables
```typescript
filters: CommandCenterFilters          // Global filters (days, project_type, username, etc.)
filterOptions: FilterOptionsResponse   // Dropdown options from /filter-options
summary: SummaryResponse               // Overview data
moduleHealth: ModuleHealthResponse
activityFeed: ActivityFeedResponse
obsKpis: IntelligentKpis
infra: InfrastructureResponse
costData: CostBreakdownResponse
securityData: SecurityOverviewResponse
projectsData: ProjectsOverviewResponse
govGrantsData: GovernanceGrantsOverviewResponse
dataOpsData: DataOperationsOverviewResponse
performanceData: PerformanceOverviewResponse
platformData: PlatformActivityResponse
healthScore: AccountHealthScoreResponse
tabLoading: Record<string, boolean>
```

---

## Workflow Module UI Reference

**Path:** `(dashboard)/workflow/`

### Pages
| File | Component | Description |
|------|-----------|-------------|
| `page.tsx` | Entry point | Renders WorkflowHomePage (SSR disabled) |
| `WorkflowHomePage.tsx` | Main page | Left sidebar (workflow list) + center (ETL builder) + right panel (versions/runs/deployments) |
| `Workflow.tsx` | Alt builder | Alternative ReactFlow workflow builder |
| `WorkflowCard.tsx` | List card | Workflow card with name, step count, schedule |
| `ETLPipelineBuilder.tsx` | Visual editor | ReactFlow-based ETL DAG builder (1166 lines) |

### Components (`workflow/components/`)
| Component | Description |
|-----------|-------------|
| `VersionHistory.tsx` | Version snapshots with create/rollback, changes summary |
| `ExecutionHistory.tsx` | Run history with status filters, error logs, execution details |
| `DeploymentScheduler.tsx` | Deploy modal (immediate / with_approval / scheduled) |
| `DeploymentHistory.tsx` | Deployment list with approve/reject/activate actions |
| `ScheduleManager.tsx` | Cron schedule UI (hourly/daily/weekly/monthly/custom + timezone) |
| `ETLExecutionHistory.tsx` | Compact ETL execution log with SQL preview |
| `WorkflowBuilder.tsx` | ReactFlow DAG builder with node config sidebar |
| `ETLPalette.tsx` | Draggable ETL block palette by category |
| `ETLNodeTypes.tsx` | 16+ custom ReactFlow node renderers (source, join, filter, aggregate, etc.) |
| `ETLConfigSidebar.tsx` | Node configuration panel |
| `etl-blocks.ts` | Block type definitions |

### Services (`services/workflow/index.ts`)
**1070+ lines** — Full workflow API client:
- CRUD: `getWorkflows()`, `createWorkflow()`, `updateWorkflow()`, `renameWorkflow()`
- Execute: `executeWorkflow()`, `scheduleWorkflow()`, `suspendTask()`, `resumeTask()`
- Versions: `getWorkflowVersions()`, `createWorkflowVersion()`, `rollbackWorkflow()`
- Runs: `getWorkflowRuns()`
- Deployments: `scheduleDeployment()`, `approveDeployment()`, `rejectDeployment()`, `activateDeployment()`, `getWorkflowDeployments()`
- Contributors: `getWorkflowContributors()`, `addWorkflowContributor()`, `removeWorkflowContributor()`
- Dev Tools: git repos, compute pools, container services, notebooks, ad-hoc SQL/Python

### Approval Flow UI
```
DeploymentScheduler (modal)
  → User selects: immediate | with_approval | scheduled
  → POST /workflows/{id}/deployments

DeploymentHistory (panel)
  → Lists deployments with status badges
  → PENDING_APPROVAL: [Approve] [Reject] buttons
  → APPROVED: [Activate] button
  → Each action calls respective endpoint
```

---

## Component Library & Patterns

### UI Framework
- **Rizzui:** Button, Badge, Input, Modal, Tooltip, Text, Select, Loader, Tab
- **Recharts:** BarChart, PieChart, AreaChart, ComposedChart, RadarChart
- **Lucide React:** All icons
- **ReactFlow:** DAG visualization (workflow builder)

### Dark Mode Convention
```
bg-white dark:bg-gray-900
bg-gray-50 dark:bg-gray-800
text-gray-900 dark:text-white
text-gray-600 dark:text-gray-400
border-gray-200 dark:border-gray-700
Chart stroke="#374151" ticks fill="#9CA3AF"
```

### Chart Color Palette
```typescript
['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']
```
