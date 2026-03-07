# Data360 Pro — Frontend Technical Reference

## Stack
**Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS** + **Rizzui** + **Recharts** + **ReactFlow** + **pnpm/Turbo**

## Architecture

```
datalab360Front/apps/data360/src/
├── app/
│   ├── (dashboard)/              # All dashboard page routes
│   │   ├── account-overview/     # Account Overview (Command Center)
│   │   ├── data-source-connection/ # Connect Data
│   │   ├── explore-design/       # Explore & Design
│   │   ├── workflow/             # Workflow (ETL builder)
│   │   ├── bi-dashboard/         # BI Dashboard
│   │   ├── gouvernance/          # Governance (users, roles, grants, policies)
│   │   ├── intelligent/          # AI Intelligence (Cortex)
│   │   ├── data-quality/         # Data Health
│   │   ├── observability/        # Observability
│   │   ├── client-accounts/      # Client Accounts
│   │   └── mapping/              # Legacy mapping wizard
│   ├── services/                 # API service layer (per-module)
│   │   ├── api/                  # Higher-level orchestration
│   │   ├── analytics/            # Analytics
│   │   ├── auth/                 # Authentication
│   │   ├── bi-reporting/         # BI Dashboard
│   │   ├── charts/               # Chart data fetching
│   │   ├── command-center/       # Command Center aggregator
│   │   ├── cortex/               # AI Intelligence
│   │   ├── data-quality/         # Data Quality
│   │   ├── data-source-connection/ # Connect Data
│   │   ├── data360-config/       # Platform config
│   │   ├── deployments/          # Deployment management
│   │   ├── etl/                  # ETL Pipeline
│   │   ├── explore-design/       # Explore & Design
│   │   ├── gouvernance/          # Governance
│   │   ├── mapping/              # Database/table mapping
│   │   ├── observability/        # Observability
│   │   ├── org-accounts/         # Organization Accounts
│   │   └── workflow/             # Workflow
│   ├── shared/                   # Shared components
│   │   ├── command-center/       # CommandCenterDashboard (Account Overview)
│   │   ├── gouvernance/          # RBAC management components
│   │   ├── observability/        # Observability KPI cards
│   │   ├── org-accounts/         # Multi-account components
│   │   ├── project-context/      # Project context panel
│   │   └── project-dashboard/    # Project summary
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
├── config/
│   ├── modules.ts                # Module registry & RBAC
│   ├── routes.ts                 # URL route definitions
│   ├── database.config.ts        # Snowflake DB constants, apiClient
│   ├── constants.ts              # Global constants
│   └── enums.ts                  # TypeScript enums
├── layouts/
│   ├── carbon-layout.tsx         # Primary layout (sidebar + header)
│   ├── carbon-header.tsx         # Top header
│   ├── carbon-sidebar.tsx        # Left sidebar
│   └── carbon-menu-items.ts      # Menu structure
├── lib/
│   ├── api-client.ts             # Axios instance with auth interceptors
│   ├── api-contracts.ts          # Request/response shapes
│   └── auth.ts                   # Auth helpers
├── store/                        # Global state (jotai atoms)
├── hooks/                        # Custom React hooks
├── types/                        # Global types
└── validators/                   # Form validators
```

---

## Module Registry (`config/modules.ts`)

| ID | Module | API Name | Backend Prefix | Page Route |
|----|--------|----------|----------------|------------|
| 1 | Connect Data | `connect_datalake` | `/connect` | `/data-source-connection` |
| 12 | Explore & Design | `explore_design` | `/explore-design` | `/explore-design` |
| 3 | Workflow | `workflow` | `/workflow` | `/workflow` |
| 6 | Governance | `gouvernance` | `/gouvernance` | `/gouvernance` |
| 4 | Business Reporting | `bi_reporting` | `/api/v1/bi-dashboard` | `/bi-dashboard` |
| 10 | AI Intelligence | `intelligent` | `/cortex` | `/intelligent` |
| 5 | Data Health | `data_quality` | `/data-quality` | `/data-quality` |
| 13 | Account Overview | `account_overview` | `/org-accounts` | `/account-overview` |
| 14 | Client Accounts | `client_accounts` | `/org-accounts` | `/client-accounts` |
| 9 | Observability | `observability` | `/observability` | `/observability` |

Key exports: `MODULES`, `getVisibleModules()`, `findModuleByApiName()`, `expandModulesToIncludeSubModules()`, `collapseSubModulesToParents()`

---

## Sidebar Menu (`layouts/carbon-menu-items.ts`)

```
1. Account Overview
2. Connect Data (Data Source Connection + Configuration)
3. Explore & Design
4. Workflow
5. Governance (Users, Roles, Grants, Policies, Security Matrix, Projects)
6. Business Reporting (BI Dashboard)
7. AI Intelligence (Semantic Models, Data & Governance)
8. Data Health (Quality Reports)
9. Observability + Data360 Config
```

---

## API Client (`config/database.config.ts`)

```typescript
import apiClient from '@/config/database.config';
// Base URL: http://127.0.0.1:8000
// Auth token injected automatically via interceptors
const response = await apiClient.get('/data-quality/summary');  // NO /api prefix
```

Constants: `DATABASE_CONFIG`, `API_CONFIG`, `DEFAULTS`, `buildFQN()`, `getGovernanceFQN()`

---

## Pages & Services

### 1. Account Overview (`/account-overview`)

**Page:** `(dashboard)/account-overview/page.tsx`
**Shared Component:** `shared/command-center/index.tsx` (~1870 lines)

**Architecture:**
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

**GlobalFilterBar:** Persistent cross-tab filters:
- Period (7d, 30d, 90d, 180d, 365d)
- Project Type, User, Role, Environment, Status, Module
- Clear All resets to `{ days: 180 }`

**AuditTable Features:**
- Column sorting (asc/desc with arrow indicators)
- Column text search (per-column filters)
- Pagination (configurable page size, default 15)
- Row count badge ("1–15 of 234")
- CSV export
- Dark mode support
- Status badges via `statusBadgeColor()`
- Relative time rendering ("2h ago" with tooltip)

**Services** (`services/command-center/`):
```typescript
getSummary(): SummaryResponse
getModuleHealth(): ModuleHealthResponse
getActivityFeed(limit): ActivityFeedResponse
getInfrastructure(): InfrastructureResponse
getPipelines(): PipelinesResponse
getCostBreakdown(days): CostBreakdownResponse
```

**Services** (`services/org-accounts/hooks.ts`):
```typescript
getProjectsOverview(filters?): ProjectsOverviewResponse
getGovernanceGrantsOverview(filters?): GovernanceGrantsOverviewResponse
getDataOperationsOverview(filters?): DataOperationsOverviewResponse
getSecurityOverview(days): SecurityOverviewResponse
getPerformanceOverview(days): PerformanceOverviewResponse
getPlatformActivityFiltered(filters?): PlatformActivityResponse
getFilterOptions(): FilterOptionsResponse
getAccountHealthScore(): AccountHealthScoreResponse
getCortexCosts(days): CortexCostsResponse
```

**Types** (`services/org-accounts/types.ts` — 1025+ lines):
- `CommandCenterFilters { days, project_type?, username?, status?, environment?, role_name?, module_name?, event_type?, warehouse_name?, query_type? }`
- `FilterOptionsResponse { project_types[], environments[], usernames[], roles[], modules[], warehouses[], statuses[] }`
- `ProjectsOverviewResponse`, `SecurityOverviewResponse`, `PerformanceOverviewResponse`, etc.

---

### 2. Connect Data (`/data-source-connection`)

**Page:** `(dashboard)/data-source-connection/page.tsx`

**Components:** AWS/Azure/Databricks/Iceberg integration forms, `DatalakeBrowser`

**Services** (`services/data-source-connection/`):
```typescript
// s3Servicer.ts
submitS3Form(formData: S3FormData): Promise<any>

// connectionServices.tsx
setupAzureStorageIntegration()
setupAzureNotificationIntegration()
createAzureStage()
setupAwsStorageIntegration()
createAwsStage()
connectSnowflakeDatalake()
listSnowflakeStages()
listSnowflakeStageFiles()
getIntegrationDetails()
postgresIngest()
mysqlIngest()
databricksTest()
databricksCatalogs()
databricksSchemas()
databricksTables()
databricksIngest()
icebergTest()
icebergNamespaces()
icebergTables()
icebergIngest()
```

---

### 3. Explore & Design (`/explore-design`)

**Page:** `(dashboard)/explore-design/page.tsx`
**Components:** `ModelingCanvas`, `TableDetailPanel`, `EventTable`, `ProjectSelector`, Event modals

**Services** (`services/explore-design/` — ~5200 lines):
```typescript
// Types
type IngestionMode = 'full_refresh' | 'incremental' | 'snapshot' | 'scd_type1' | 'scd_type2' | 'scd_type3'
type EventType = 'TABLE_SELECTED' | 'TABLE_RENAMED' | 'COLUMN_RENAMED' | ... (20+ types)
type EventStatus = 'pending' | 'validated' | 'failed' | 'applied'

interface TableMetadata { database, schema, table, columns, constraints }
interface IngestionConfig { mode, config }
interface TableRelationship { source, target, type }

// Functions
listProjects()
getProjectEvents(projectId, filter)
listDDLActions(projectId)
getMetadata(database, schema, table)
fetchRelationships(projectId)
getRecentDeploymentErrors()
deployProject()
validateDeployment()
```

**Stores:**
- `stores/event-store.ts` — Table events, column changes, deployments (jotai)
- `stores/deployment-store.ts` — Validation, approval workflow
- `stores/version-store.ts` — Schema versioning

---

### 4. Workflow (`/workflow`)

**Page:** `(dashboard)/workflow/page.tsx`
**Components:**
| Component | Description |
|-----------|-------------|
| `WorkflowHomePage.tsx` | Main page: sidebar + ETL builder + right panel |
| `ETLPipelineBuilder.tsx` | ReactFlow-based ETL DAG builder (1166 lines) |
| `WorkflowBuilder.tsx` | ReactFlow DAG builder with node config sidebar |
| `WorkflowCard.tsx` | Workflow list card |
| `VersionHistory.tsx` | Version snapshots with create/rollback |
| `ExecutionHistory.tsx` | Run history with status filters, error logs |
| `DeploymentScheduler.tsx` | Deploy modal (immediate/with_approval/scheduled) |
| `DeploymentHistory.tsx` | Deployment list with approve/reject/activate |
| `ScheduleManager.tsx` | Cron schedule UI (hourly/daily/weekly/monthly/custom + timezone) |
| `ETLExecutionHistory.tsx` | Compact ETL execution log with SQL preview |
| `ETLPalette.tsx` | Draggable ETL block palette by category |
| `ETLNodeTypes.tsx` | 16+ custom ReactFlow node renderers |
| `ETLConfigSidebar.tsx` | Node configuration panel |
| `etl-blocks.ts` | Block type definitions |

**Services** (`services/workflow/` or `api/workflowApi.ts`):
```typescript
// CRUD
createWorkflow()
getWorkflow()
listWorkflows()
updateWorkflow()
deleteWorkflow()
renameWorkflow()

// Execute
executeWorkflow()
scheduleWorkflow()
suspendTask()
resumeTask()

// Versions
getWorkflowVersions()
createWorkflowVersion()
rollbackWorkflow()

// Runs
getWorkflowRuns()

// Deployments
scheduleDeployment()
approveDeployment()
rejectDeployment()
activateDeployment()
getWorkflowDeployments()

// Contributors
getWorkflowContributors()
addWorkflowContributor()
removeWorkflowContributor()

// Dev Tools
listGitRepositories()
createGitRepository()
describeGitRepository()
listGitBranches()
listComputePools()
createComputePool()
listNotebooks()
createNotebook()
executeNotebook()
runAdHocSQL()
runAdHocPython()
```

**Approval Flow:**
```
DeploymentScheduler (modal)
  → User selects: immediate | with_approval | scheduled
  → POST /workflows/{id}/deployments

DeploymentHistory (panel)
  → PENDING_APPROVAL: [Approve] [Reject] buttons
  → APPROVED: [Activate] button
  → Each action calls respective endpoint
```

---

### 5. BI Dashboard (`/bi-dashboard`)

**Page:** `(dashboard)/bi-dashboard/page.tsx`
**Components:** `DashboardSelector`, `DashboardEditor`, Grid-based dashboard builder

**Services** (`services/bi-reporting/dashboards-local.ts`):
```typescript
interface DashboardItem { id, type, componentId, position, config }
interface Dashboard { id, name, items[], createdBy, updatedAt }

getAllDashboards()
getDashboard(id)
createDashboard(input)
updateDashboard()
deleteDashboard()
duplicateDashboard()
```

**Stores:** `bi-dashboard/stores/dashboard-store.ts` — Active dashboard, pages, widgets

---

### 6. Governance (`/gouvernance`)

**Pages:**
| Route | Page | Description |
|-------|------|-------------|
| `/gouvernance` | Redirect | Routes to `/gouvernance/policies` |
| `/gouvernance/users` | `users/page.tsx` | User management |
| `/gouvernance/roles` | `roles/page.tsx` | Role management |
| `/gouvernance/grants` | `grants/page.tsx` | Grant management |
| `/gouvernance/policies` | `policies/page.tsx` | Unified policies UI |
| `/gouvernance/security-matrix` | `security-matrix/page.tsx` | RBAC matrix visualization |
| `/gouvernance/projects` | `projects/page.tsx` | Project management |

**Services** (`services/gouvernance/`):
```typescript
// index.ts — Main API functions
getQueryAccessHistory()
getStageStorageInfo()
getDwhStorageInfo(database, schema)
getSrcTableStorageInfo()
getDwhSchemas()
getDwhHealthInfo(schemaName)
getClientDashboardInfo()
getConnectorsInfo()
getAllUsersActivity(filters)
getDashboardErrors(params)
setUserMfa()
getUserMfaStatus()

// fetch_users.ts
listUsers(), createUser(), updateUser(), deleteUser()
getUserDetails(), getUserRoles()

// fetch_roles.ts
listRoles(), createRole(), updateRole(), deleteRole()
getRoleDetails()

// fetch_grants.ts
listGrants(), grantPrivilege(), revokePrivilege()
getGrantDetails()

// policies.ts (~60KB) — All policy types
getMaskingPolicies(), getRlsPolicies()
getAggregationPolicies(), getTagPolicies()
getNetworkPolicies(), getPasswordPolicies(), getSessionPolicies()
createPolicy(), updatePolicy(), deletePolicy(), applyPolicy()
```

**Shared Components** (`shared/gouvernance/`):
- `roles/` — Role CRUD components
- `users/` — User management components
- `grants/` — Grant management
- `security-matrix/` — RBAC visualization
- `policy-grants/` — Policy grant management
- `stage-grants/` — Stage grants
- `user-grants/` — User grants

---

### 7. AI Intelligence (`/intelligent`)

**Page:** `(dashboard)/intelligent/page.tsx`
**UI:** Tab-based interface (Semantic Models, Cortex Chat, ML Features, Advanced ML)

**Services** (`services/cortex/`):
```typescript
// query.ts
queryCortex(request): CortexQueryResponse

// semantic-models.ts
listSemanticModels()
getSemanticModelContent()
createSemanticModel()
deleteSemanticModel()
generateSemanticModel()
validateSemanticModelYaml()

// ml-features.ts (11KB)
// Text analysis, translation, entity extraction

// ml-advanced.ts (8.5KB)
createFineTuneJob()
listFineTuneJobs()
createDocumentAIModel()
trainClassification()
createTopInsights()

// kpis.ts
getCortexKpis(): CortexKpis

// recommend.ts
getCortexRecommend(request): RecommendResponse
```

---

### 8. Data Health (`/data-quality`)

**Page:** `(dashboard)/data-quality/page.tsx`
**UI:** Tab navigation (Completeness, Freshness, Ingestion, Schema, Classification, Cost, Security, DMF)

**Services** (`services/data-quality/`):
```typescript
// index.ts
runBuiltinDmfCheck(projectId, request)
getDmfResults(projectId, params)
suggestDmfs(projectId, params)
getQualitySummary(database, days)
getCompletenessMetrics()
getFreshnessMetrics()
getIngestionMetrics()
getSchemaQuality()
getClassificationCoverage()
getCostMetrics()
getSecurityPosture()
getDmfDashboardResults()
getTrendAnalysis()
setQualityThresholds()

// reports-local.ts (localStorage-based)
createQualityReport()
getQualityReports()
updateQualityReport()
deleteQualityReport()
```

---

### 9. Observability (`/observability`)

**Page:** `(dashboard)/observability/page.tsx`
**UI:** KPIs, compliance, lineage, security, cost analytics

**Services** (`services/observability/`):
```typescript
// Intelligent KPIs
getIntelligentKpis(): IntelligentKpis
getObservabilityDashboard(): DashboardSummary

// Compliance
getGdprComplianceReport(): GdprReport
getSoc2ComplianceReport(): Soc2Report

// Lineage & Dependencies
getDataLineage(params)
getAccessPatterns(days)
getObjectDependencies()
getDependencyGraph()

// Activity & User
getActivitySummary(days)
getActivityHeatmap(days)
getLoginHistory(params)

// Security
getSecurityPosture()
getSensitiveDataSummary()

// Cost & Warehouse
getWarehouseUsage(days)
getDailyCredits(days)
getStorageMetrics()

// Performance
getPerformanceMetrics(days)
getSlowQueries(params)

// Resources
getUnusedTables(daysThreshold)
getDormantUsers(daysThreshold)

// Trust Center
getTrustCenterFindings()
getTrustCenterSummary()
```

**Shared Components** (`shared/observability/`):
- `health-score-card` — Health score visualization
- `cost-overview-card` — Cost analytics
- `compliance-card` — GDPR/SOC2 compliance
- `dependencies-card` — Dependency graph
- `trust-center-card` — Trust Center
- `security-posture-card` — Security metrics
- `performance-metrics-card` — Performance
- `recommendations-card` — AI recommendations

**Types** (`services/observability/types.ts` — 170+ lines):
- `IntelligentKpis { health_score, status, governance, cost, performance, usage, compliance, recommendations }`
- `GdprReport`, `Soc2Report`, `LineageResponse`, `AccessPatternsResponse`
- `PerformanceMetrics`, `SlowQueriesResponse`

---

### 10. Client Accounts (`/client-accounts`)

**Page:** `(dashboard)/client-accounts/page.tsx`

**Services** (`services/org-accounts/`):
```typescript
getDashboardOverview()
getDashboardUsage()
getDashboardTrends()
getAccountCredits()
getAccountStorage()
getAccountHealth()
getAccountLogins()
getAccountQueries()
getAccountWarehouses()
getAccountAlerts()
getDataTransfer()
getReaderAccounts()
getShares()
getShareDetail()
getBalance()
getContract()
getRateSheet()
getMetering()
getClusteringCosts()
getMaterializedViewCosts()
getPipeCosts()
getSearchOptimizationCosts()
```

**Types** (`services/org-accounts/types.ts` — 630+ lines):
- `ClientAccount`, `DashboardOverviewResponse`, `DashboardUsageResponse`
- `CreditTrendResponse`, `HealthResponse`, `AlertsResponse`
- `StorageResponse`, `LoginsResponse`, `WarehousesResponse`

---

### 11. Analytics (`/analytics`)

**Services** (`services/analytics/`):
```typescript
getUserActivitySummary(days?): Promise<UserActivitySummary>
getUserActivityDetails(params?): Promise<UserActivityDetail[]>
getUserActivityTrends(days?): Promise<Array>
getQueryPerformance(days?): Promise<QueryPerformanceMetrics>
getSlowQueries(params?): Promise<SlowQuery[]>
getQueryPerformanceByWarehouse(days?): Promise<Array>
getQueryPerformanceByUser(days?): Promise<Array>
getWarehouseUsage(days?): Promise<WarehouseUsageMetrics[]>
getWarehouseUsageTrends(params?): Promise<Array>
getIdleWarehouses(days?): Promise<Array>
getCostAttribution(params?): Promise<CostAttribution[]>
```

---

### 12. Data360 Config (Intelligent Refresh)

**Services** (`services/data360-config/`):
```typescript
getData360Config(): Promise<Data360ConfigResponse>                // Platform metadata schemas
getTableRefreshMapping(params?): Promise<TableRefreshMappingResponse>  // LAST_ALTERED timestamps
triggerRefresh(body): Promise<{ status, refreshed_zone?, refreshed_table? }>  // Zone refresh
getCacheConfig(): Promise<Record<string, number>>                 // Current TTL overrides
patchCacheConfig(body): Promise<{ status, key, value_seconds }>   // Override TTL
```

**Types:**
- `TableRefreshMappingItem { table_name, schema, last_altered, zone, cache_keys[] }`
- `RefreshTriggerRequest { zone?, table?, force? }`
- `CacheConfigOverrideRequest { key, value_seconds }`

---

### 13. Additional Services

**ETL Pipeline** (`services/etl/` — 40+ types):
```typescript
// Pipeline CRUD
getComponentTemplates(): ComponentTemplatesResponse
createPipeline(), listPipelines(), getPipeline()
updatePipeline(), deletePipeline()
executePipeline(pipelineId, dryRun?), executeInline(request)
validatePipeline(), getValidateSuggestions()
getPipelineRuns(pipelineId, limit?)

// Schedule Management
createSchedule(), listSchedules(), getSchedule()
updateSchedule(), deleteSchedule()
suspendSchedule(), resumeSchedule()
getScheduleHistory(scheduleId, limit?)

// Utilities
formatDuration(), getStatusColor(), getStatusIcon(), cronToHuman()
CRON_PRESETS[], TIMEZONES[]
```

**Mapping** (`services/mapping/`):
```typescript
getDatabases(), getSchema(database)
getTables(database, schema), getTableColumns(database, schema, table)
getTablesTarget(database), autoMapKeys()
getProjectState(), postMapping()
```

**Projects API** (`services/api/projectsApi.ts`):
```typescript
listProjects(), getProject(), createProject()
updateProject(), deleteProject()
addEvent(), listEvents()
listContributors()
```

**Charts** (`services/charts/`):
```typescript
fetchChartData(request: ChartDataRequest): ChartDataResponse
useChartData() // React hook
```

**Auth** (`services/auth/`):
```typescript
login(credentials: LoginData): Promise<LoginResponse>
registerUser(userData): Promise<any>
silentReauth(): Promise<boolean>  // NextAuth silent session refresh
```

---

## Custom Hooks

### Cache-Aware Data Fetching

**`useCacheAwareQuery<T>`** (`hooks/useCacheAwareQuery.ts`):
```typescript
const { data, loading, error, refetch, isStale, lastFetchedAt } = useCacheAwareQuery(
  fetchFn,
  { cacheKeys: [CACHE_KEYS.PROJECTS], debounceMs: 300, initialData }
);
// Auto-refetches when specified cache keys are invalidated via SSE
```

**`useCacheInvalidationWatcher`** (`hooks/useCacheAwareQuery.ts`):
```typescript
const { wasInvalidated, lastInvalidation } = useCacheInvalidationWatcher([
  CACHE_KEYS.USER_ACTIVITY, CACHE_KEYS.PLATFORM_EVENTS
]);
// Watch for invalidation without automatic refetching
```

### SSE Cache Invalidation

**`useCacheInvalidation`** (`hooks/useCacheInvalidation.ts`):
```typescript
const { isConnected, clientId, lastEvent, error, reconnect } = useCacheInvalidation({
  autoReconnect: true, maxRetries: 5
});
// Connects to /api/cache/stream for real-time cache invalidation events
// Auto-reconnects with exponential backoff
// Exports CACHE_KEYS object with 60+ cache key constants
```

### Governance Data Hooks

**`hooks/use-gouvernance.ts`**:
```typescript
useClientDashboard(options?): { data, loading, error, refetch }
useAllUsersActivity(filters?, options?): { data, loading, error, refetch }
useStageStorageInfo(options?): { data, loading, error, refetch }
useDwhStorageInfo(databaseName?, schemaName?, options?): { data, loading, error, refetch }
useDwhHealthInfo(schemaName, options?): { data, loading, error, refetch }
useConnectorsInfo(options?): { data, loading, error, refetch }
useQueryAccessHistory(options?): { data, loading, error, refetch }
```

### Toast Notifications

**`useToast()`** (`hooks/use-toast.ts`):
```typescript
const { toasts, toast, dismiss } = useToast();
toast({ title, description, variant }); // Toast notification state manager
```

---

## Component Libraries

### UI Framework: Rizzui
`Button`, `Badge`, `Input`, `Modal`, `Tooltip`, `Text`, `Select`, `Loader`, `Tab`, `Dropdown`

### Charts: Recharts
`BarChart`, `LineChart`, `AreaChart`, `PieChart`, `RadarChart`, `Treemap`, `ComposedChart`, `ScatterChart`, `RadialBarChart`

### Icons
- **Primary:** `lucide-react` (RefreshCw, GitBranch, AlertTriangle, Database, Shield, DollarSign, etc.)
- **Secondary:** `react-icons/pi` (specialty duotone icons)

### DAG Visualization: ReactFlow
Node-edge graph builder for modeling canvas and workflow ETL builder

### Notifications: react-hot-toast

### Authentication: next-auth

---

## State Management

| Store | Location | Pattern | Purpose |
|-------|----------|---------|---------|
| Dashboard | `bi-dashboard/stores/dashboard-store.ts` | jotai atoms | Active dashboard, pages, widgets |
| Events | `explore-design/stores/event-store.ts` | jotai atoms | Table events, column changes |
| Deployment | `explore-design/stores/deployment-store.ts` | jotai atoms | Validation, approval workflow |
| Version | `explore-design/stores/version-store.ts` | jotai atoms | Schema versioning |
| Global | `store/` | jotai atoms | Cross-component (carbonMenuItemAtom, etc.) |

**Pattern:** `jotai` for cross-component state, `useState` for local component state

---

## Dark Mode Convention

Every element needs `dark:` classes:
```
bg-white dark:bg-gray-900
bg-gray-50 dark:bg-gray-800
text-gray-900 dark:text-white
text-gray-600 dark:text-gray-400
border-gray-200 dark:border-gray-700
```

Charts:
```
Grid stroke: "#374151"
Ticks fill: "#9CA3AF"
Tooltip: backgroundColor '#1F2937', color '#F9FAFB'
```

---

## Chart Color Palette

```typescript
['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']
```

---

## Page Structure Convention

```
Gradient header (bg-gradient-to-r from-{color}-600 to-{color}-700)
  └── Title + KPI badges
Tab navigation (state + array of tab objects)
Tab content (charts + tables in responsive grid)
  └── grid-cols-1 md:grid-cols-2 lg:grid-cols-3
Loading state (Loader from rizzui, centered)
Error state (retry button)
```

---

## Service Layer Pattern

```typescript
// src/app/services/{module}/index.ts
import apiClient from '@/config/database.config';
import { ResponseType } from './types';

export async function getData(params?: { days?: number }): Promise<ResponseType> {
  const response = await apiClient.get('/{prefix}/endpoint', { params });
  return response.data;
}
```

---

## Key Type Files

| Service | File | Key Interfaces |
|---------|------|----------------|
| command-center | `types.ts` (255 lines) | `SummaryResponse`, `ModuleHealthResponse`, `ActivityFeedResponse`, `InfrastructureResponse`, `CostBreakdownResponse` |
| org-accounts | `types.ts` (1025+ lines) | `CommandCenterFilters`, `FilterOptionsResponse`, `ProjectsOverviewResponse`, `SecurityOverviewResponse`, `PerformanceOverviewResponse` |
| observability | `types.ts` (170+ lines) | `IntelligentKpis`, `GdprReport`, `Soc2Report`, `LineageResponse`, `PerformanceMetrics` |
| gouvernance | `types.ts` | `QueryAccessHistory`, `StageSize`, `DwhStorageSummary`, `UserActivityWithQuery`, `MfaStatus` |
| explore-design | inline | `TableMetadata`, `IngestionConfig`, `TableRelationship`, `EventType`, `EventStatus` |
| etl | `types.ts` | `Pipeline`, `Schedule`, `ComponentTemplate` |
| api | `types.ts` | `BackendColumnMapping`, `ContributorRole`, `Project`, `Workflow` |

---

## Error Handling

```typescript
import { getApiErrorMessage } from '@/lib/api-client';
// Toast notifications for user feedback
import toast from 'react-hot-toast';

try {
  const data = await apiCall();
} catch (error) {
  toast.error(getApiErrorMessage(error));
}
```

Error boundaries wrap critical pages (AccountOverview, etc.).
Silent auth refresh via `silentReauth()` service.

---

## Performance Optimizations

### Architecture Pattern
- Client-side rendering with `useState` + `useEffect` data fetching
- Manual `apiClient.get()` calls with `try/catch`
- Tab-based lazy loading (fetch on tab switch)
- SSE cache invalidation for real-time data freshness

### Applied React Performance (March 2026)

**Command Center (`shared/command-center/index.tsx`)**:
- `useTransition` for non-blocking tab switching
- `useDeferredValue` on AuditTable column filter inputs
- `React.memo` on: KpiCard, SectionCard, ChartTooltip, FilterSelect, GlobalFilterBar, all 9 tab components
- `useMemo` for AuditTable filtered/sorted/pageData computations
- `useCallback` for handleSort, exportCsv, all fetch functions

**Observability Dashboard (`shared/observability/index.tsx`)**:
- `useTransition` for non-blocking tab switching
- `useCallback` for all fetch functions (fetchKpis, fetchComplianceData, fetchActivityData, fetchCostData)

**Dashboard (`shared/dashboard/index.tsx`)**:
- Already uses `useMemo` for date calculations
- SSE cache invalidation watcher for auto-refresh

### Available for Future Use
- **TanStack Virtual** — Virtualized scrolling for 100K+ row tables
- **`next/dynamic`** with `ssr: false` — Lazy-load Recharts components
- **Suspense boundaries** — Progressive section loading
- **Web Workers** (Comlink) — Offload transformations > 50ms

### Intelligent Auto-Refresh Architecture

```
1. Backend: table_refresh_mapping.py tracks LAST_ALTERED per table
2. Frontend: useCacheInvalidation() connects to SSE stream
3. On mutation: @invalidates_cache(CacheKey.X) → Redis clear → SSE broadcast
4. Frontend: useCacheAwareQuery() auto-refetches affected data
5. Data360 Config: /table-refresh-mapping checks LAST_ALTERED timestamps
6. Zone-based invalidation: changing PROJECTS table → invalidates projects zone
```

**Cache-aware fetch pattern:**
```typescript
// Automatic refetch when PROJECTS cache key is invalidated
const { data, loading, isStale } = useCacheAwareQuery(
  () => getProjectsOverview(filters),
  { cacheKeys: [CACHE_KEYS.PROJECTS, CACHE_KEYS.DEPLOYMENTS] }
);
```

---

## Snowflake Intelligence Service Functions

```typescript
// Row Timestamps
activateRowTimestamps(database: string): Promise<RowTimestampActivationResponse>
getRowTimestampStatus(database: string, schema?: string): Promise<RowTimestampStatusResponse>

// Cross-Account Audit
getCrossAccountUsage(days?: number): Promise<CrossAccountUsageResponse>
getQueryAuditHistory(params?: { days?, username?, query_type?, min_duration_ms? }): Promise<QueryAuditResponse>
getAccessAuditHistory(params?: { days?, username?, object_name? }): Promise<AccessAuditResponse>
getLoginAuditHistory(params?: { days?, username?, is_success? }): Promise<LoginAuditResponse>
```

## ETL Block Types (Workflow DAG Builder)

| Category | Blocks |
|----------|--------|
| Source | `source`, `org_usage_source` (ORGANIZATION_USAGE), `audit_source` (ACCOUNT_USAGE), `stream_consume`, `git_file` |
| Transform | `join`, `filter`, `aggregate`, `select`, `rename`, `cast`, `formula`, `sort`, `union`, `distinct`, `limit` |
| AI | `recommendation`, `segmentation`, `clustering` |
| Script | `sql_script`, `python_script`, `notebook_run` |
| Destination | `destination`, `export_file` |
| Infrastructure | `dynamic_table`, `compute_pool`, `container_service` |

## Bookmarks Store (SAP-Grade Favorites)

```typescript
// Jotai + localStorage persistence
import { useBookmarks } from '@/store/bookmarks-store';

const { bookmarks, addBookmark, removeBookmark, isBookmarked, toggleBookmark } = useBookmarks();
toggleBookmark({ label: 'Dashboard', href: '/bi-dashboard', module: 'BI' });
```

## Deployment Approval UI

- **Command Center**: Approve/Reject buttons in Pending Approvals card + deployment table Actions column
- **Governance Projects**: Pending Deployments section with approve/reject for all `pending_approval` deployments
- **Rejection Modal**: Reason input with dark mode support, auto-refreshes data after action

---

## Total Statistics

- **Pages:** 14 core Data360 pages + admin config
- **Services:** 18 modules with 230+ API functions
- **Custom Hooks:** 8 (cache-aware, SSE, governance, toast)
- **Type Definitions:** 450+ interfaces
- **Shared Components:** 60+ domain-specific directories
- **API Endpoints Wrapped:** 280+
- **State Management:** jotai atoms (bookmarks, sidebar, dashboard) + page-specific stores
- **ETL Block Types:** 28 (source, transform, AI, script, destination, infrastructure)
- **Cmd+K Search:** 19 module pages + 5 quick actions + bookmarked favorites
- **Performance-optimized dashboards:** command-center, observability, main dashboard
- **Intelligent refresh:** SSE + LAST_ALTERED timestamp-driven cache invalidation (15 zones)
- **Snowflake Intelligence:** Row timestamps, cross-account audit, DQL/login/access history
