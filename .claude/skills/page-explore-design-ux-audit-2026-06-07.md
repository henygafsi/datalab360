---
name: page-explore-design-ux-audit-2026-06-07
description: Snowflake schema catalog and data model designer with AI-assisted column classification, schema health scoring, DDL event staging, and a multi-tab right-bar for actions/AI/quality/history/deploy.
---

## Vue

**Route:** `/explore-design` (no sub-segments; project scoped via `?project_id=` query param)

**Layout — three-column when a project is active:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header bar: ProjectSelector | CompactSourceSelector (DB/Schema)     │
│             GlobalSearch | OverflowMenu | AI-toggle | Deploy badge  │
├──────────────────┬──────────────────────────┬───────────────────────┤
│ LEFT PANEL       │ MAIN CANVAS              │ RIGHT BAR (slide-in)  │
│ (collapsible,    │                          │ ContextRightBar       │
│  w-64 → w-80)    │  viewMode='catalog'      │  tabs: actions / ai / │
│                  │  → VirtualizedTableList  │  quality / history /  │
│ "Source Tables"  │    + TableDetailPanel    │  deploy / help        │
│  badge count     │                          │                       │
│  select-all      │  viewMode='modeling'     │ Toggled by PanelRight │
│  search          │  → ModelingCanvas        │ button in header      │
│                  │    (ReactFlow, SSR:false) │                       │
│  per-row actions:│  SourceMindMap           │                       │
│  preview/profile │  (SSR:false)             │                       │
│  masking/ingestion                          │                       │
└──────────────────┴──────────────────────────┴───────────────────────┘
│ BOTTOM: BulkActionsBar (fixed, appears when ≥2 tables selected)     │
│         EventTable panel (slide-in from bottom, showEventPanel)     │
│         HistoryRail (slide-in overlay, showHistoryRail)             │
└─────────────────────────────────────────────────────────────────────┘
```

**Empty state (no project):** Full-page `ProjectGatePanel` — inline picker listing `explore_design` projects via `listProjects`, "New project" button opens `UnifiedProjectWizard`.

**Offline state:** `WifiOff` banner when SSE stream returns `session_expired`; auto-redirects to `/signin?error=sync_offline`.

**Key files:**
- `apps/data360/src/app/(dashboard)/explore-design/page.tsx` — 5 000+ line monolith
- `components/ContextRightBar.tsx` — right-bar with 6 tabs
- `components/AiSavingsDashboard.tsx` — currently orphaned (not mounted)
- `stores/event-store.ts` — Zustand store for DDL events
- `stores/ai-store.ts` — AI feature toggles (`useAiFeatures`)
- `hooks/useAiAnalysis.ts` — runs analyzers against events automatically

---

## Tabs actuels

The page exposes **two view-mode tabs** in the main toolbar (not URL-routed):

| Tab label | `viewMode` value | Component rendered |
|-----------|------------------|--------------------|
| Catalog   | `catalog`        | `VirtualizedTableList` + `TableDetailPanel` |
| Modeling  | `modeling`       | `ModelingCanvas` (ReactFlow) + optional `SourceMindMap` |

`viewMode` is persisted to `localStorage` key `explore-design-view-mode`.

The **ContextRightBar** has six internal tabs (`RightBarTab` union):

| Tab key  | Icon    | Content summary |
|----------|---------|-----------------|
| `actions`| Zap     | DDL quick-actions grouped by category; FocusedAction panel slot |
| `ai`     | Brain   | AI feature toggles, classification results, schema health narrative (partial) |
| `quality`| BarChart3 | Column quality grid from profile data |
| `history`| Clock   | `historyEvents` list (currently fed from local event store, not backend) |
| `deploy` | Rocket  | Pending events count, Deploy CTA |
| `help`   | HelpCircle | Contextual hints |

---

## Actions

All write actions are gated by `PermissionGate module="explore_design"` or `module="explore-design"` depending on call site; deploy additionally requires `action="deploy"`.

### Table Selection & Navigation

| Action | RBAC | Endpoint | Notes |
|--------|------|----------|-------|
| Select database | — | `GET /mapping/databases` via `getDatabases()` | Populates DB dropdown in CompactSourceSelector |
| Toggle schema | — | `GET /mapping/schemas?database=X` via `getSchemas()` | Multi-select; stores `Map<schema, db>` |
| Click table row | — | `GET /mapping/tables` via `getTables()` | Sets `selectedTable`; triggers column load |
| Load columns | — | `GET /mapping/tables/{db}/{schema}/{table}/columns` via `getTableColumns()` | Timeout throws `TableColumnsTimeoutError` |
| Global search | — | client-side filter over loaded tables/columns | Dropdown with type badges (table/column/policy) |
| Select all tables | — | client-side | Enables `BulkActionsBar` when ≥2 selected |
| Table inline Preview | read | `GET /explore-design/{project_id}/tables/{db}/{schema}/{table}/preview` | Opens inline panel; `tablePreview()` |
| Table inline Profile | read | `GET /explore-design/{project_id}/tables/{db}/{schema}/{table}/profile` | Opens inline panel; `fetchTableProfile()` |

### Schema-level Actions (CompactSourceSelector context menu)

| Action | RBAC module | Endpoint | Notes |
|--------|-------------|----------|-------|
| Transfer Ownership | explore_design / write | — | UI only at present |
| Apply Masking to All Tables | explore_design / write | bulk masking flow | Opens `PolicyAssignmentPanel` |
| Apply RLS to All Tables | explore_design / write | bulk masking flow | — |
| Set Ingestion for All | explore_design / write | `POST /explore-design/{project_id}/ingestion/bulk-config` | Opens `IngestionConfigPanel` |
| Clone Schema | explore_design / write | `POST /explore-design/{project_id}/schema-clone` | — |
| Export DDL | read | client-side DDL generation | `generateSnowflakeSQL` util |
| List Dynamic Tables | read | `GET /explore-design/dynamic-tables` via `listDynamicTables()` | Opens data-eng modal |
| List Streams | read | `GET /explore-design/streams` via `listStreams()` | Opens data-eng modal |
| List Alerts | read | `GET /explore-design/alerts` via `listAlerts()` | Opens data-eng modal |
| Drop Schema | explore_design / admin | — | Inline confirm required |

### DDL / Table Mutations (staged as events → auto-sync to backend)

All mutations go through `useEventStore.addEvent()` then auto-sync via `addDDLAction` / `removeDDLAction` on event diff.

| Action | RBAC | Backend sync endpoint | Event type |
|--------|------|-----------------------|------------|
| Rename table | explore_design / write | `POST /explore-design/{pid}/ddl-actions` | `TABLE_RENAMED` |
| Add column | explore_design / write | same | `ADD_COLUMN` |
| Drop column | explore_design / write | same | `REMOVE_COLUMN` |
| Change column type | explore_design / write | same | `COLUMN_TYPE_CHANGED` |
| Set primary key | explore_design / write | same | `PRIMARY_KEY_SET` |
| Validate FK types | explore_design / write | `POST /explore-design/{pid}/validate/fk-types` | `FOREIGN_KEY_ADDED` |
| Discover relationships (AI) | explore_design / write | `POST /explore-design/{pid}/ai/discover-relationships` | `RELATION_CREATED` |
| Configure relations | explore_design / write | `RelationshipModal` + event store | `RELATION_CREATED/REMOVED` |
| Apply masking policy | explore_design / write | `POST /explore-design/{pid}/masking` | `MASKING_POLICY_APPLIED` |
| Apply row-access policy | explore_design / write | same path with type | `RLS_POLICY_APPLIED` |
| Tag column | explore_design / write | same | `TAG_APPLIED` |
| Bulk apply masking | explore_design / write | `POST /explore-design/{pid}/masking` (loop) | `MASKING_POLICY_APPLIED` batch |
| Create table (standard/dynamic/hybrid/stream/alert/event-table) | explore_design / write | `POST /explore-design/{pid}/ddl-actions` | `TABLE_CREATED` |
| Undo / Redo | explore_design / write | `DELETE /explore-design/{pid}/ddl-actions/{event_id}` on undo | client-side with backend sync |

**InsightActionButton usage:** Not yet present in the page. The spec calls for it in the redesigned right-bar Actions tab (DDL Schema group, Keys group, Policies group) — this is a P1 gap.

### Bulk Actions (BulkActionsBar, ≥2 tables selected)

| Action | RBAC | Endpoint |
|--------|------|----------|
| Set PKs | explore_design / write | event store → `addDDLAction` |
| Set Ingestion Mode (full_refresh / incremental / snapshot / scd_type1 / scd_type2) | explore_design / write | `POST /explore-design/{pid}/ingestion/bulk-config` |
| Apply Masking | explore_design / write | `POST /explore-design/{pid}/masking` |
| Configure Relations | explore_design / write | `RelationshipModal` |

### Deployment

| Action | RBAC | Endpoint |
|--------|------|----------|
| Open Deploy modal | explore_design / deploy | — |
| Conflict check before deploy | explore_design / write | `POST /explore-design/{pid}/conflict-check` |
| Dry run | explore_design / deploy | `POST /explore-design/{pid}/dry-run` |
| Full dry run | explore_design / deploy | `POST /explore-design/{pid}/full-dry-run` |
| Pre-deploy checks | explore_design / deploy | `POST /explore-design/{pid}/pre-deploy-checks` |
| SQL diff | explore_design / deploy | `POST /explore-design/{pid}/sql-diff` |
| Execute DDL | explore_design / deploy | `POST /explore-design/{pid}/ddl-actions/execute` |
| Impact analysis | explore_design / deploy | `POST /explore-design/{pid}/impact-analysis` |
| Enhanced impact analysis | explore_design / deploy | `POST /explore-design/{pid}/impact-analysis/enhanced` |
| Post-verify | explore_design / deploy | `POST /explore-design/{pid}/post-verify` |
| Approve deployment | explore_design / admin | `POST /explore-design/{pid}/deployments/{did}/approve` |
| Reject deployment | explore_design / admin | `POST /explore-design/{pid}/deployments/{did}/reject` |

---

## Interventions IA

### 1. AI Column Classifier

| Attribute | Value |
|-----------|-------|
| Trigger | User clicks "Classify" in right-bar AI tab or per-table icon |
| Snowflake call | `POST /explore-design/{pid}/ai/classify-columns` — body: `{database, schema, table, columns[]}` |
| Output | `Map<tableId, Record<columnName, category>>` stored in `columnClassifications` state; `ClassificationBadge` renders inline (PII/MEASURE/DIMENSION/DATE_KEY/FK/FLAG/AUDIT) |
| Cortex feature | Cortex Complete / CLASSIFICATION task on column metadata |

### 2. AI Relationship Discovery

| Attribute | Value |
|-----------|-------|
| Trigger | User clicks "AI Discover Relationships" button (toolbar or right-bar) |
| Snowflake call | `POST /explore-design/{pid}/ai/discover-relationships` — body: `{tables: [{database, schema, table_name}]}` |
| Output | `TableRelationship[]` list; fires `RELATION_CREATED` events automatically; renders as edges on ModelingCanvas |
| Cortex feature | Cortex Complete — FK inference from column name/type patterns |

### 3. Schema Health Score

| Attribute | Value |
|-----------|-------|
| Trigger | User clicks "Health" chip in CompactSourceSelector stats bar (requires `isAiEnabled('schema_health_score')`) |
| Snowflake call | `POST /explore-design/{pid}/ai/schema-health` — body: `{database, schema}` |
| Output | `SchemaHealthResult {overall_score, sub_scores, recommendations, cortex_credits}` displayed in popover chip (green ≥80 / amber ≥50 / red <50); result cached in component state for re-display |
| Cortex feature | Cortex Analyst — multi-dimension schema quality scoring |

### 4. AI Warehouse Sizing

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation or `aiWarehouseSizing` call |
| Snowflake call | `POST /explore-design/{pid}/ai/warehouse-sizing` |
| Output | `WarehouseSizingResult` — recommended warehouse size; surfaced as recommendation row in AI grid (P1 gap — not yet mounted) |
| Cortex feature | Cortex Cost Optimizer |

### 5. AI Clustering Keys

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation grid (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/clustering-keys` |
| Output | `ClusteringKeysResult` — recommended cluster-by columns with rationale |
| Cortex feature | Cortex Query Acceleration advisor |

### 6. AI Materialization

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation grid (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/materialization` |
| Output | `MaterializationResult` — TABLE vs VIEW vs DYNAMIC_TABLE recommendation |
| Cortex feature | Cortex Materialization advisor |

### 7. AI Ingestion Mode

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation grid (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/ingestion-mode` |
| Output | `IngestionModeOptimizerResult` — full_refresh vs incremental vs snapshot |
| Cortex feature | Cortex data pattern analysis |

### 8. AI Recommend SCD

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab or catalog table row action chip (P2 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/recommend-scd` |
| Output | `RecommendScdResult` — SCD type 1/2 recommendation |
| Cortex feature | Cortex data change pattern detection |

### 9. AI Optimize Types

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation grid (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/optimize-types` |
| Output | `OptimizeTypesResult` — per-column type optimization suggestions |
| Cortex feature | Cortex Column Type Optimizer |

### 10. AI Suggest Columns

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation grid (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/suggest-columns` |
| Output | `SuggestColumnsResult` — missing columns inferred from table name/context |
| Cortex feature | Cortex Schema Completeness advisor |

### 11. AI Check Naming

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar AI tab recommendation grid (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/check-naming` |
| Output | `CheckNamingResult` — naming convention violations + suggestions |
| Cortex feature | Cortex naming convention linter |

### 12. AI Deploy Schedule

| Attribute | Value |
|-----------|-------|
| Trigger | Right-bar deploy tab or deployment wizard (P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/deploy-schedule` |
| Output | `DeployScheduleResult` — optimal deploy window recommendation |
| Cortex feature | Cortex workload prediction |

### 13. AI Deployment Risk

| Attribute | Value |
|-----------|-------|
| Trigger | DeploymentValidation wizard pre-checks step |
| Snowflake call | `POST /explore-design/{pid}/ai/deployment-risk` |
| Output | `DeploymentRiskResult` — risk score + mitigations |
| Cortex feature | Cortex change risk classifier |

### 14. AI Savings Dashboard

| Attribute | Value |
|-----------|-------|
| Trigger | Component `AiSavingsDashboard` fetches on mount (currently **orphaned**, not mounted anywhere) |
| Snowflake call | `GET /explore-design/{pid}/ai/savings?days=30` |
| Output | `AiSavingsResponse {credits_saved, cost_saved_usd, roi_multiplier, recommendations_accepted, performance_gain_pct}` |
| Cortex feature | Cortex credit tracking |

### 15. AI Feedback Loop

| Attribute | Value |
|-----------|-------|
| Trigger | User accepts/dismisses/defers a recommendation (accept/dismiss/defer buttons in AI grid — P1 gap) |
| Snowflake call | `POST /explore-design/{pid}/ai/feedback` |
| Output | `AiFeedbackResponse` — confirmation; stats surfaced via `GET /explore-design/{pid}/ai/feedback/stats` (P2 gap — currently admin-only) |
| Cortex feature | Cortex model fine-tuning feedback |

### 16. AI Guided Model Wizard (AiGuidedModelWizard)

| Attribute | Value |
|-----------|-------|
| Trigger | User selects AI fork in `UnifiedProjectWizard` or clicks "Change approach → AI" |
| Snowflake call | Sequence: `aiClassifyColumns` → `aiDiscoverRelationships` → `aiSchemaHealth` → `detectRelations` (repointed to `/ai/discover-relationships`) |
| Output | Pre-populated `TABLE_CREATED` + `FOREIGN_KEY_ADDED` events seeded into event store; ModelingCanvas populated with scaffolded schema |
| Cortex feature | Multi-step Cortex pipeline |

---

## Redesign Right-Bar

### Details tab

**Focused-table summary card** (populated when `selectedTable !== null`):

| Field | Source |
|-------|--------|
| FQN (`database.schema.table`) | `selectedTable.{database, schema, table}` |
| Object type badge (TABLE / VIEW / DYNAMIC_TABLE / STREAM / HYBRID) | `selectedTable.type` or inferred from creation modal |
| Column count | `tableColumns.length` |
| PK columns | `tableColumns.filter(c => c.isPrimaryKey).map(c => c.name)` |
| Sensitive column count | `tableColumns.filter(c => c.isSensitive).length` (also from `columnClassifications` PII entries) |
| Ingestion mode | `allTableConfigs.get(selectedTable.id)?.ingestionMode` |
| Last-modified timestamp | from `inlineProfileData` or backend metadata |
| Schema health score chip | `aiSchemaHealth` result cached in `ai-store` — color-coded green/amber/red |
| DMF count | count of DMF-type policy events for this table from event store |

**Empty state** (no table selected) — schema-level stats:
- Total tables in selected schema(s)
- Configured count (status=`configured`)
- Pending count
- Storage estimate (from profile data if available)

### Actions tab

**Schema DDL group:**

| Button | Endpoint | Undo support |
|--------|----------|--------------|
| Rename table | event `TABLE_RENAMED` → `POST /explore-design/{pid}/ddl-actions` | Yes — `undoEvent()` + `DELETE /explore-design/{pid}/ddl-actions/{eid}` |
| Add column | event `ADD_COLUMN` | Yes |
| Drop column | event `REMOVE_COLUMN` (with `CascadeConfirmModal`) | Yes |
| Change column type | event `COLUMN_TYPE_CHANGED` | Yes |

All four should use `InsightActionButton` with optimistic undo support.

**Keys and Relations group:**

| Button | Endpoint |
|--------|----------|
| Set primary key | event `PRIMARY_KEY_SET` via `createPrimaryKeyEvent()` |
| Validate FK types | `POST /explore-design/{pid}/validate/fk-types` |
| AI discover relationships | `POST /explore-design/{pid}/ai/discover-relationships` |
| Configure relations | opens `RelationshipModal` |

**Policies group:**

| Button | Endpoint |
|--------|----------|
| Apply masking policy | event `MASKING_POLICY_APPLIED` via `createMaskingPolicyEvent()`; opens `PolicyAssignmentPanel` |
| Apply row-access policy | event `RLS_POLICY_APPLIED`; opens `PolicyAssignmentPanel` |
| Tag column | event `TAG_APPLIED` |
| Bulk apply masking | loops `createMaskingPolicyEvent` for all selected tables |

### Status SSE

SSE cache keys that trigger `sseRefreshKey` increment (full page data reload):

```
PROJECTS, TABLES, DATABASES, SCHEMAS, DEPLOYMENTS, DYNAMIC_TABLES, STREAMS
```

Source: `CACHE_KEYS` from `useCacheInvalidation`; filtered in `useEffect` on `lastInvalidationAtom`.

### AI Tips

**Right-bar AI tab — three sections:**

1. **Top KPI strip** — AI savings row (open recommendations, accepted last 30 days, estimated cost savings, perf gain). Data source: `AiSavingsDashboard` component (`GET /explore-design/{pid}/ai/savings`). Currently orphaned — needs mounting inside `ContextRightBar` AI tab.

2. **Schema health narrative** — 2-sentence narrative derived from `aiSchemaHealth` result already fetched in `CompactSourceSelector` (store result in `ai-store` or prop-drill via `profileData`). Displayed below the score chip.

3. **Recommendations grid** — category-badged rows covering 16 recommendation types:
   - Categories A–P map to: clustering-keys, warehouse-sizing, materialization, ingestion-mode, recommend-scd, optimize-types, suggest-columns, check-naming, deploy-schedule, discover-relationships, classify-columns, schema-health, deployment-risk, feedback, savings, custom.
   - Confidence percentile filter chip (slider 0–100%).
   - Per-row actions: **Accept** (`aiRecordFeedback` with `accepted`), **Dismiss** (`dismissed`), **Defer** (`deferred`), **Bulk-accept** (all visible rows).
   - Results from `aiClusteringKeys`, `aiWarehouseSizing`, `aiMaterialization`, `aiIngestionMode`, `aiRecommendScd`, `aiOptimizeTypes`, `aiSuggestColumns`, `aiCheckNaming`, `aiDeploySchedule` are persisted as rows (not ephemeral modal buttons).

4. **Footer** — `aiGetFeedbackStats` (`GET /explore-design/{pid}/ai/feedback/stats`) rendering model accuracy over 30 days. Currently only surfaced in admin health-check; needs to move here.

### History tab

Replaces the current `HistoryRail` slide-out overlay with an embedded panel inside the right-bar History tab.

**Data source:** `GET /explore-design/{project_id}/events?limit=50` (via `getExploreEvents`) — renders `EVENT_STORE.DESIGN_EVENTS` rows.

**Layout per row:**
- Date group header (grouped by calendar day)
- Status badge: `pending` / `deployed` / `failed` / `rolled-back`
- Actor (username)
- Object FQN (`database.schema.table`)
- DDL snippet (toggle expand)
- **Pending rows only:** Discard button (`removeDDLAction`) + inline Deploy CTA (opens `DeploymentValidation`)
- Collapsible "Impact analysis" section per pending change — data from `enhancedImpactAnalysis` (`POST /explore-design/{pid}/impact-analysis/enhanced`)

---

## Henry Tasks

### P1 — Critical gaps (block production readiness)

| Task | Gap | Endpoint(s) |
|------|-----|-------------|
| Catalog header KPI strip (5 cards) | Row count, column count, aggregate quality score, sensitive column %, PK coverage — currently only shown inside `inlineProfileData` panel, not pinned to table header | `GET /explore-design/{pid}/tables/{db}/{schema}/{table}/profile` |
| AI Recommendations grid in right-bar AI tab | `aiClusteringKeys`, `aiWarehouseSizing`, `aiMaterialization`, etc. results shown as one-shot modal buttons, not persistent rows; grid with confidence filter + accept/dismiss/defer + `aiRecordFeedback` wiring missing | `POST /explore-design/{pid}/ai/clustering-keys` (and 7 other AI Phase 2–4 endpoints) |
| `AiSavingsDashboard` orphan: mount in right-bar AI tab | Component exists at `components/AiSavingsDashboard.tsx` but is imported nowhere | `GET /explore-design/{pid}/ai/savings` |
| Pending changes rail in right-bar History tab | Currently a slide-out `HistoryRail` overlay; needs to be embedded in right-bar History tab using `getExploreEvents` instead of local event store | `GET /explore-design/{pid}/events?limit=50` |

### P2 — High-value improvements

| Task | Gap | Endpoint(s) |
|------|-----|-------------|
| `aiGetFeedbackStats` surfaced in AI tab footer | Currently wired only in admin health-check; needs a 30d model accuracy footer in right-bar AI tab | `GET /explore-design/{pid}/ai/feedback/stats` |
| Impact analysis embedded in right-bar Deploy tab | `ImpactAnalysisPanel` exists but is a standalone modal triggered from toolbar; should be a collapsible section in right-bar Deploy tab and in History pending rows | `POST /explore-design/{pid}/impact-analysis/enhanced` |
| `TableDetailPanel` sub-tabs: Lineage, DMF trend, Grants, History | Currently `TableDetailPanel` is a flat properties panel; needs tabbed layout with Lineage graph (event relationships), DMF policy trend chart, GRANTS list, and event history | `GET /explore-design/{pid}/events` |
| SCD type recommendation chip in catalog table row actions | No surface for `aiRecommendScd` in the catalog; should show as a chip in the per-row action bar when result is available | `POST /explore-design/{pid}/ai/recommend-scd` |

### P3 — Polish

| Task | Gap | Endpoint(s) |
|------|-----|-------------|
| `TemplateLibrary` promoted to right-bar drawer panel | Currently a full-screen modal (`showTemplateLibrary` state); should live as a persistent right-bar drawer so templates are browsable without blocking the canvas | `GET /explore-design/{pid}/templates` (wraps with fallback; endpoint not yet on backend) |
| `SchemaVersionDisplaySwitch` wired to right-bar History tab version timeline | Component imported from `@/app/shared/project-context` but only shown in a standalone `ProjectContextPanel`; needs to drive a version timeline in History tab | `GET /explore-design/{pid}/versions` |

---

## Snowflake Features

| Feature | Usage in page |
|---------|---------------|
| Cortex Complete | Column classification (`ai/classify-columns`), relationship discovery (`ai/discover-relationships`), SCD recommendation (`ai/recommend-scd`), column type optimizer (`ai/optimize-types`), suggest columns (`ai/suggest-columns`), naming checker (`ai/check-naming`) |
| Cortex Analyst | Schema health scoring (`ai/schema-health`) — multi-dimension score with sub-scores and natural language recommendations |
| Cortex Cost Optimizer | Warehouse sizing (`ai/warehouse-sizing`), materialization advisor (`ai/materialization`), ingestion mode optimizer (`ai/ingestion-mode`), clustering keys (`ai/clustering-keys`) |
| Cortex Query Acceleration | Clustering key advisor — ranks candidate cluster-by columns by query acceleration potential |
| Cortex Deployment Intelligence | Deployment risk assessment (`ai/deployment-risk`), optimal deploy window (`ai/deploy-schedule`) |
| Cortex Continuous Learning | Feedback ingestion (`ai/feedback`), model accuracy stats (`ai/feedback/stats`), savings attribution (`ai/savings`) |
| Dynamic Tables | `listDynamicTables`, `suspendDynamicTable`, `resumeDynamicTable`, `refreshDynamicTable`, `dropDynamicTable` — full lifecycle via `de-objects.ts` |
| Streams | `listStreams`, `getStreamData`, `dropStream` — CDC streams on source tables |
| Snowflake Alerts | `listAlerts`, `dropAlert` — condition-based alerting objects |
| Hybrid Tables | `HybridTableModal` — creates Snowflake Hybrid Tables (row-store + columnar) |
| Event Tables | `EventTableModal` — creates Snowflake Event Tables for log ingestion |
| Masking Policies | `getMaskingPolicies`, `createMaskingPolicyEvent` — column-level data masking via governance module |
| Row Access Policies | `RLS_POLICY_APPLIED` event type — row-level security |
| Object Tags | `TAG_APPLIED` event type — Snowflake object tagging for governance |
| DDL Atomic Execution | `POST /explore-design/{pid}/ddl-actions/execute` with `ExecuteDDLAtomicBody` — transactional DDL rollout |
| Schema Clone (Dry Run) | `POST /explore-design/{pid}/dry-run` — clones schema to sandbox environment before executing DDL |
| Watermarks | `GET /explore-design/{pid}/watermarks` — tracks incremental load high-water marks per source table |
