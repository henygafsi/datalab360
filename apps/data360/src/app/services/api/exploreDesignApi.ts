/**
 * Explore & Design Module API client — /explore-design/*
 * Handles: project, templates, metadata, profiling, preview, detection,
 * schema-clone, ingestion, masking, mappings, DDL actions, models, deploy, scheduling.
 */
import apiClient from '@/lib/api-client';
import type {
  // Project
  CreateExploreProjectRequest,
  CreateExploreProjectResponse,
  Project,
  WizardState,
  SaveStateRequest,
  SaveStateResponse,
  EventListResponse,
  // Templates
  TemplateListResponse,
  CreateTemplateRequest,
  ConfigTemplate,
  // Metadata
  TableRef,
  BatchMetadataResponse,
  BatchMetadataParams,
  TableMetadata,
  // Profiling
  TableProfile,
  ColumnProfile,
  // Preview
  TablePreview,
  ColumnPreview,
  // Detection
  DetectSensitiveRequest,
  DetectSensitiveResponse,
  DetectRelationsRequest,
  DetectRelationsResponse,
  // Schema Clone
  SchemaCloneRequest,
  SchemaClone,
  ExecuteCloneResponse,
  RollbackCloneResponse,
  // Ingestion
  IngestionConfigRequest,
  IngestionConfigResponse,
  BulkIngestionConfigRequest,
  BulkIngestionConfigResponse,
  ExecuteIngestionRequest,
  ExecuteIngestionResponse,
  IngestionScheduleRequest,
  IngestionScheduleResponse,
  // Masking
  MaskingConfigRequest,
  MaskingConfigResponse,
  // Mappings
  CreateMappingRequest,
  ColumnMapping,
  MappingListResponse,
  // DDL Actions
  CreateDDLActionRequest,
  DDLAction,
  DDLActionListResponse,
  ExecuteDDLResponse,
  RollbackDDLResponse,
  DDLActionStatus,
  // Models
  SaveModelRequest,
  SaveModelResponse,
  ModelVersionListResponse,
  ListModelsParams,
  // Deploy
  QuickDeployResponse,
  CreateExploreDeploymentRequest,
  ExploreDeployment,
  ExploreDeploymentListResponse,
  RejectScheduleRequest,
  // Scheduling
  CreateScheduleRequest,
  Schedule,
  ScheduleListResponse,
  // Versions
  VersionListResponse,
  // New Feature Endpoints
  DryRunRequest,
  DryRunResult,
  FullDryRunRequest,
  FullDryRunResult,
  PostVerifyRequest,
  PostVerifyResult,
  ImpactAnalysisRequest,
  ImpactAnalysisResult,
  IngestionDryRunRequest,
  IngestionDryRunResult,
  QualityGatesRunRequest,
  QualityGatesRunResult,
  IngestionRunsResponse,
  ConflictCheckRequest,
  ConflictCheckResult,
  // Phase A — Event Validation
  ValidateFkTypesRequest,
  ValidateFkTypesResult,
  ValidateFkTypesProjectResult,
  CascadeRenameRequest,
  CascadeRenameResult,
  CascadeDropRequest,
  CascadeDropResult,
  EnhancedImpactAnalysisRequest,
  EnhancedImpactAnalysisResult,
  // Phase B — Deployment Pipeline
  ExecuteDDLAtomicBody,
  PreDeployChecksRequest,
  PreDeployChecksResult,
  SqlDiffRequest,
  SqlDiffResult,
  // Phase C — Self-Serve Ingestion
  SqlPreviewRequest,
  SqlPreviewResult,
  WatermarkListResult,
  Watermark,
  // Phase D — Event Lifecycle
  AuditTrailParams,
  AuditTrailResult,
  CreateEventTemplateRequest,
  CreateEventTemplateResult,
  EventTemplate,
  ApplyEventTemplateRequest,
  ApplyEventTemplateResult,
  // AI Phase 1 — Schema Intelligence
  ClassifyColumnsRequest,
  ClassifyColumnsResult,
  DiscoverRelationshipsRequest,
  DiscoverRelationshipsResult,
  SchemaHealthRequest,
  SchemaHealthResult,
  // AI Phase 2 — Modeling Copilot
  SuggestColumnsRequest,
  SuggestColumnsResult,
  CheckNamingRequest,
  CheckNamingResult,
  OptimizeTypesRequest,
  OptimizeTypesResult,
  RecommendScdRequest,
  RecommendScdResult,
  // AI Phase 3 — Cost Optimizer
  WarehouseSizingRequest,
  WarehouseSizingResult,
  ClusteringKeysRequest,
  ClusteringKeysResult,
  MaterializationRequest,
  MaterializationResult,
  IngestionModeOptimizerRequest,
  IngestionModeOptimizerResult,
  // AI Phase 4 — Deployment Intelligence
  DeploymentRiskRequest,
  DeploymentRiskResult,
  DeployScheduleRequest,
  DeployScheduleResult,
  // AI Phase 5 — Continuous Learning
  AiFeedbackRequest,
  AiFeedbackResponse,
  AiFeedbackStatsResponse,
  AiSavingsResponse,
} from './types';

const PREFIX = '/explore-design';

// ============================================================================
// Project (Explore-specific)
// ============================================================================

export async function createExploreProject(body: CreateExploreProjectRequest) {
  const { data } = await apiClient.post<CreateExploreProjectResponse>(PREFIX, body);
  return data;
}

export async function getExploreProject(projectId: string) {
  const { data } = await apiClient.get<Project>(`${PREFIX}/${projectId}`);
  return data;
}

// ============================================================================
// State (Wizard)
// ============================================================================

export async function getExploreState(projectId: string) {
  const { data } = await apiClient.get<WizardState>(`${PREFIX}/${projectId}/state`);
  return data;
}

export async function saveExploreState(projectId: string, body: SaveStateRequest) {
  const { data } = await apiClient.put<SaveStateResponse>(
    `${PREFIX}/${projectId}/state`,
    body,
  );
  return data;
}

// ============================================================================
// Events (Module-filtered)
// ============================================================================

export async function getExploreEvents(
  projectId: string,
  params?: { event_type?: string; limit?: number },
) {
  const { data } = await apiClient.get<EventListResponse>(
    `${PREFIX}/${projectId}/events`,
    { params },
  );
  return data;
}

// ============================================================================
// Templates
// ============================================================================

export async function listTemplates(projectId: string) {
  const { data } = await apiClient.get<TemplateListResponse>(
    `${PREFIX}/${projectId}/templates`,
  );
  return data;
}

export async function createTemplate(projectId: string, body: CreateTemplateRequest) {
  const { data } = await apiClient.post<{ template_id: string; template_name: string }>(
    `${PREFIX}/${projectId}/templates`,
    body,
  );
  return data;
}

// ============================================================================
// Metadata
// ============================================================================

export async function batchMetadata(
  projectId: string,
  tables: TableRef[],
  params?: BatchMetadataParams,
) {
  const { data } = await apiClient.post<BatchMetadataResponse>(
    `${PREFIX}/${projectId}/tables/metadata`,
    tables,
    { params },
  );
  return data;
}

export async function singleMetadata(
  projectId: string,
  database: string,
  schema: string,
  table: string,
) {
  const { data } = await apiClient.get<TableMetadata>(
    `${PREFIX}/${projectId}/tables/${database}/${schema}/${table}/metadata`,
  );
  return data;
}

// ============================================================================
// Profiling
// ============================================================================

export async function tableProfile(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  params?: { sample_size?: number },
) {
  const { data } = await apiClient.get<TableProfile>(
    `${PREFIX}/${projectId}/tables/${database}/${schema}/${table}/profile`,
    { params },
  );
  return data;
}

export async function columnProfile(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  column: string,
  params?: { sample_size?: number; top_n?: number },
) {
  const { data } = await apiClient.get<ColumnProfile>(
    `${PREFIX}/${projectId}/tables/${database}/${schema}/${table}/columns/${column}/profile`,
    { params },
  );
  return data;
}

// ============================================================================
// Preview
// ============================================================================

export async function tablePreview(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  params?: { limit?: number },
) {
  const { data } = await apiClient.get<TablePreview>(
    `${PREFIX}/${projectId}/tables/${database}/${schema}/${table}/preview`,
    { params },
  );
  return data;
}

export async function columnPreview(
  projectId: string,
  database: string,
  schema: string,
  table: string,
  column: string,
  params?: { limit?: number; distinct_only?: boolean },
) {
  const { data } = await apiClient.get<ColumnPreview>(
    `${PREFIX}/${projectId}/tables/${database}/${schema}/${table}/columns/${column}/preview`,
    { params },
  );
  return data;
}

// ============================================================================
// Detection
// ============================================================================

export async function detectSensitive(projectId: string, body: DetectSensitiveRequest) {
  const { data } = await apiClient.post<DetectSensitiveResponse>(
    `${PREFIX}/${projectId}/detect/sensitive`,
    body,
  );
  return data;
}

export async function detectRelations(projectId: string, body: DetectRelationsRequest) {
  const { data } = await apiClient.post<DetectRelationsResponse>(
    `${PREFIX}/${projectId}/detect/relations`,
    body,
  );
  return data;
}

// ============================================================================
// Schema Clone
// ============================================================================

export async function createClone(projectId: string, body: SchemaCloneRequest) {
  const { data } = await apiClient.post<SchemaClone>(
    `${PREFIX}/${projectId}/schema-clone`,
    body,
  );
  return data;
}

export async function executeClone(
  projectId: string,
  cloneId: string,
  warehouse?: string,
) {
  const { data } = await apiClient.post<ExecuteCloneResponse>(
    `${PREFIX}/${projectId}/schema-clone/${cloneId}/execute`,
    undefined,
    { params: warehouse ? { warehouse } : undefined },
  );
  return data;
}

export async function rollbackClone(projectId: string, cloneId: string) {
  const { data } = await apiClient.post<RollbackCloneResponse>(
    `${PREFIX}/${projectId}/schema-clone/${cloneId}/rollback`,
  );
  return data;
}

// ============================================================================
// Ingestion
// ============================================================================

export async function configIngestion(projectId: string, body: IngestionConfigRequest) {
  const { data } = await apiClient.post<IngestionConfigResponse>(
    `${PREFIX}/${projectId}/ingestion/config`,
    body,
  );
  return data;
}

export async function bulkConfigIngestion(
  projectId: string,
  body: BulkIngestionConfigRequest,
) {
  const { data } = await apiClient.post<BulkIngestionConfigResponse>(
    `${PREFIX}/${projectId}/ingestion/bulk-config`,
    body,
  );
  return data;
}

export async function executeIngestion(
  projectId: string,
  body: ExecuteIngestionRequest,
) {
  const { data } = await apiClient.post<ExecuteIngestionResponse>(
    `${PREFIX}/${projectId}/ingestion/execute`,
    body,
  );
  return data;
}

export async function scheduleIngestion(
  projectId: string,
  body: IngestionScheduleRequest,
) {
  const { data } = await apiClient.post<IngestionScheduleResponse>(
    `${PREFIX}/${projectId}/ingestion/schedule`,
    body,
  );
  return data;
}

// ============================================================================
// Masking
// ============================================================================

export async function configMasking(projectId: string, body: MaskingConfigRequest) {
  const { data } = await apiClient.post<MaskingConfigResponse>(
    `${PREFIX}/${projectId}/masking/config`,
    body,
  );
  return data;
}

// ============================================================================
// Column Mappings
// ============================================================================

export async function createMapping(projectId: string, body: CreateMappingRequest) {
  const { data } = await apiClient.post<{ mapping_id: string }>(
    `${PREFIX}/${projectId}/mappings`,
    body,
  );
  return data;
}

export async function listMappings(projectId: string) {
  const { data } = await apiClient.get<MappingListResponse>(
    `${PREFIX}/${projectId}/mappings`,
  );
  return data;
}

// ============================================================================
// DDL Actions
// ============================================================================

export async function addDDLAction(projectId: string, body: CreateDDLActionRequest) {
  const { data } = await apiClient.post<DDLAction>(
    `${PREFIX}/${projectId}/ddl-actions`,
    body,
  );
  return data;
}

export async function batchAddDDLActions(
  projectId: string,
  body: {
    actions: Array<{
      ddl_sql: string;
      ddl_type?: string;
      priority?: number;
      target_table?: string;
      description?: string;
    }>;
  },
) {
  const { data } = await apiClient.post(
    `${PREFIX}/${projectId}/ddl-actions/batch`,
    body,
  );
  return data;
}

export async function listDDLActions(
  projectId: string,
  params?: { status?: DDLActionStatus },
) {
  const { data } = await apiClient.get<DDLActionListResponse>(
    `${PREFIX}/${projectId}/ddl-actions`,
    { params },
  );
  return data;
}

export async function executeDDLActions(
  projectId: string,
  body?: ExecuteDDLAtomicBody,
) {
  const { data } = await apiClient.post<ExecuteDDLResponse>(
    `${PREFIX}/${projectId}/ddl-actions/execute`,
    body ?? {},
  );
  return data;
}

export async function rollbackDDLAction(projectId: string, eventId: string) {
  const { data } = await apiClient.post<RollbackDDLResponse>(
    `${PREFIX}/${projectId}/ddl-actions/${eventId}/rollback`,
  );
  return data;
}

export async function removeDDLAction(projectId: string, eventId: string) {
  const { data } = await apiClient.delete<{ status: string; event_id: string }>(
    `${PREFIX}/${projectId}/ddl-actions/${eventId}`,
  );
  return data;
}

// ============================================================================
// Model Versions
// ============================================================================

export async function saveModel(projectId: string, body: SaveModelRequest) {
  const { data } = await apiClient.post<SaveModelResponse>(
    `${PREFIX}/${projectId}/models`,
    body,
  );
  return data;
}

export async function listModels(projectId: string, params?: ListModelsParams) {
  const { data } = await apiClient.get<ModelVersionListResponse>(
    `${PREFIX}/${projectId}/models`,
    { params },
  );
  return data;
}

// ============================================================================
// Deploy
// ============================================================================

export async function quickDeploy(projectId: string, versionId: string) {
  const { data } = await apiClient.post<QuickDeployResponse>(
    `${PREFIX}/${projectId}/deploy`,
    undefined,
    { params: { version_id: versionId } },
  );
  return data;
}

export async function requestDeployment(
  projectId: string,
  body: CreateExploreDeploymentRequest,
) {
  const { data } = await apiClient.post<ExploreDeployment>(
    `${PREFIX}/${projectId}/deployments`,
    body,
  );
  return data;
}

export async function listDeployments(
  projectId: string,
  params?: { status?: string },
) {
  const { data } = await apiClient.get<ExploreDeploymentListResponse>(
    `${PREFIX}/${projectId}/deployments`,
    { params },
  );
  return data;
}

export async function approveDeployment(projectId: string, deploymentId: string) {
  const { data } = await apiClient.post<ExploreDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/approve`,
  );
  return data;
}

export async function rejectDeployment(
  projectId: string,
  deploymentId: string,
  body?: { reason?: string | null },
) {
  const { data } = await apiClient.post<ExploreDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/reject`,
    body,
  );
  return data;
}

export async function executeDeployment(projectId: string, deploymentId: string) {
  const { data } = await apiClient.post<ExploreDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/execute`,
  );
  return data;
}

export async function cancelDeployment(projectId: string, deploymentId: string) {
  const { data } = await apiClient.post<ExploreDeployment>(
    `${PREFIX}/${projectId}/deployments/${deploymentId}/cancel`,
  );
  return data;
}

// ============================================================================
// Scheduling
// ============================================================================

export async function createSchedule(projectId: string, body: CreateScheduleRequest) {
  const { data } = await apiClient.post<Schedule>(
    `${PREFIX}/${projectId}/schedule`,
    body,
  );
  return data;
}

export async function approveSchedule(projectId: string, scheduleId: string) {
  const { data } = await apiClient.post<Schedule>(
    `${PREFIX}/${projectId}/schedule/${scheduleId}/approve`,
  );
  return data;
}

export async function rejectSchedule(
  projectId: string,
  scheduleId: string,
  body?: RejectScheduleRequest,
) {
  const { data } = await apiClient.post<Schedule>(
    `${PREFIX}/${projectId}/schedule/${scheduleId}/reject`,
    body,
  );
  return data;
}

export async function activateSchedule(projectId: string, scheduleId: string) {
  const { data } = await apiClient.post<Schedule>(
    `${PREFIX}/${projectId}/schedule/${scheduleId}/activate`,
  );
  return data;
}

export async function suspendTask(projectId: string) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${projectId}/task/suspend`,
  );
  return data;
}

export async function resumeTask(projectId: string) {
  const { data } = await apiClient.post<{ status: string }>(
    `${PREFIX}/${projectId}/task/resume`,
  );
  return data;
}

export async function listSchedules(
  projectId: string,
  params?: { status?: string },
) {
  const { data } = await apiClient.get<ScheduleListResponse>(
    `${PREFIX}/${projectId}/schedules`,
    { params },
  );
  return data;
}

// ============================================================================
// Version History (Unified delegation)
// ============================================================================

export async function listExploreVersions(
  projectId: string,
  params?: { limit?: number },
) {
  const { data } = await apiClient.get<VersionListResponse>(
    `${PREFIX}/${projectId}/versions`,
    { params },
  );
  return data;
}

// ============================================================================
// Dry-Run (DDL on cloned schema)
// ============================================================================

export async function dryRunDeployment(
  projectId: string,
  body?: DryRunRequest,
) {
  const { data } = await apiClient.post<DryRunResult>(
    `${PREFIX}/${projectId}/dry-run`,
    body ?? {},
  );
  return data;
}

export async function fullDryRun(
  projectId: string,
  body?: FullDryRunRequest,
) {
  const { data } = await apiClient.post<FullDryRunResult>(
    `${PREFIX}/${projectId}/full-dry-run`,
    body ?? {},
  );
  return data;
}

// ============================================================================
// Post-Verify (schema comparison after deploy)
// ============================================================================

export async function postVerifyDeployment(
  projectId: string,
  body: PostVerifyRequest,
) {
  const { data } = await apiClient.post<PostVerifyResult>(
    `${PREFIX}/${projectId}/post-verify`,
    body,
  );
  return data;
}

// ============================================================================
// Impact Analysis (downstream dependencies)
// ============================================================================

export async function analyzeImpact(
  projectId: string,
  body: ImpactAnalysisRequest,
) {
  const { data } = await apiClient.post<ImpactAnalysisResult>(
    `${PREFIX}/${projectId}/impact-analysis`,
    body,
  );
  return data;
}

// ============================================================================
// Ingestion Dry-Run (preview sample rows with actions)
// ============================================================================

export async function dryRunIngestion(
  projectId: string,
  body: IngestionDryRunRequest,
) {
  const { data } = await apiClient.post<IngestionDryRunResult>(
    `${PREFIX}/${projectId}/ingestion/dry-run`,
    body,
  );
  return data;
}

// ============================================================================
// Quality Gates (run configurable checks)
// ============================================================================

export async function runQualityGates(
  projectId: string,
  body: QualityGatesRunRequest,
) {
  const { data } = await apiClient.post<QualityGatesRunResult>(
    `${PREFIX}/${projectId}/quality-gates/run`,
    body,
  );
  return data;
}

// ============================================================================
// Ingestion Runs (history)
// ============================================================================

export async function listIngestionRuns(
  projectId: string,
  params?: { limit?: number; offset?: number; status?: string },
) {
  const { data } = await apiClient.get<IngestionRunsResponse>(
    `${PREFIX}/${projectId}/ingestion/runs`,
    { params },
  );
  return data;
}

// ============================================================================
// Conflict Check (event conflicts)
// ============================================================================

export async function checkConflicts(
  projectId: string,
  body?: ConflictCheckRequest,
) {
  const { data } = await apiClient.post<ConflictCheckResult>(
    `${PREFIX}/${projectId}/conflict-check`,
    body ?? {},
  );
  return data;
}

// ============================================================================
// Phase A — Event Validation
// ============================================================================

// Mode B — validate a specific FK pair
export async function validateFkTypes(
  projectId: string,
  body: ValidateFkTypesRequest,
) {
  const { data } = await apiClient.post<ValidateFkTypesResult>(
    `${PREFIX}/${projectId}/validate/fk-types`,
    body,
  );
  return data;
}

// Mode A — project-wide FK scan (empty body)
export async function validateAllFkTypes(
  projectId: string,
) {
  const { data } = await apiClient.post<ValidateFkTypesProjectResult>(
    `${PREFIX}/${projectId}/validate/fk-types`,
    {},
  );
  return data;
}

export async function cascadeRename(
  projectId: string,
  body: CascadeRenameRequest,
) {
  const { data } = await apiClient.post<CascadeRenameResult>(
    `${PREFIX}/${projectId}/cascade/rename`,
    body,
  );
  return data;
}

export async function cascadeDrop(
  projectId: string,
  body: CascadeDropRequest,
) {
  const { data } = await apiClient.post<CascadeDropResult>(
    `${PREFIX}/${projectId}/cascade/drop`,
    body,
  );
  return data;
}

export async function enhancedImpactAnalysis(
  projectId: string,
  body: EnhancedImpactAnalysisRequest,
) {
  const { data } = await apiClient.post<EnhancedImpactAnalysisResult>(
    `${PREFIX}/${projectId}/impact-analysis/enhanced`,
    body,
  );
  return data;
}

// ============================================================================
// Phase B — Deployment Pipeline (new endpoints)
// ============================================================================

export async function preDeployChecks(
  projectId: string,
  body?: PreDeployChecksRequest,
) {
  const { data } = await apiClient.post<PreDeployChecksResult>(
    `${PREFIX}/${projectId}/pre-deploy-checks`,
    body ?? {},
  );
  return data;
}

export async function sqlDiff(projectId: string, body: SqlDiffRequest) {
  const { data } = await apiClient.post<SqlDiffResult>(
    `${PREFIX}/${projectId}/sql-diff`,
    body,
  );
  return data;
}

// ============================================================================
// Phase C — Self-Serve Ingestion (new endpoints)
// ============================================================================

export async function ingestionSqlPreview(
  projectId: string,
  body: SqlPreviewRequest,
) {
  const { data } = await apiClient.post<SqlPreviewResult>(
    `${PREFIX}/${projectId}/ingestion/sql-preview`,
    body,
  );
  return data;
}

export async function listWatermarks(projectId: string) {
  const { data } = await apiClient.get<WatermarkListResult>(
    `${PREFIX}/${projectId}/watermarks`,
  );
  return data;
}

export async function getWatermark(projectId: string, sourceTableFqn: string) {
  const { data } = await apiClient.get<Watermark>(
    `${PREFIX}/${projectId}/watermarks/${encodeURIComponent(sourceTableFqn)}`,
  );
  return data;
}

// ============================================================================
// Phase D — Event Lifecycle
// ============================================================================

export async function getAuditTrail(
  projectId: string,
  params?: AuditTrailParams,
) {
  const { data } = await apiClient.get<AuditTrailResult>(
    `${PREFIX}/${projectId}/audit-trail`,
    { params },
  );
  return data;
}

export async function createEventTemplate(
  body: CreateEventTemplateRequest,
) {
  const { data } = await apiClient.post<CreateEventTemplateResult>(
    `${PREFIX}/event-templates`,
    body,
  );
  return data;
}

export async function listEventTemplates(params?: { category?: string }) {
  const { data } = await apiClient.get<EventTemplate[]>(
    `${PREFIX}/event-templates`,
    { params },
  );
  return data;
}

export async function applyEventTemplate(
  projectId: string,
  body: ApplyEventTemplateRequest,
) {
  const { data } = await apiClient.post<ApplyEventTemplateResult>(
    `${PREFIX}/${projectId}/event-templates/apply`,
    body,
  );
  return data;
}

// ============================================================================
// AI Phase 1 — Schema Intelligence
// ============================================================================

export async function aiClassifyColumns(
  projectId: string,
  body: ClassifyColumnsRequest,
) {
  const { data } = await apiClient.post<ClassifyColumnsResult>(
    `${PREFIX}/${projectId}/ai/classify-columns`,
    body,
  );
  return data;
}

export async function aiDiscoverRelationships(
  projectId: string,
  body: DiscoverRelationshipsRequest,
) {
  const { data } = await apiClient.post<DiscoverRelationshipsResult>(
    `${PREFIX}/${projectId}/ai/discover-relationships`,
    body,
  );
  return data;
}

export async function aiSchemaHealth(
  projectId: string,
  body: SchemaHealthRequest,
) {
  const { data } = await apiClient.post<SchemaHealthResult>(
    `${PREFIX}/${projectId}/ai/schema-health`,
    body,
  );
  return data;
}

// ============================================================================
// AI Phase 2 — Modeling Copilot
// ============================================================================

export async function aiSuggestColumns(
  projectId: string,
  body: SuggestColumnsRequest,
) {
  const { data } = await apiClient.post<SuggestColumnsResult>(
    `${PREFIX}/${projectId}/ai/suggest-columns`,
    body,
  );
  return data;
}

export async function aiCheckNaming(
  projectId: string,
  body: CheckNamingRequest,
) {
  const { data } = await apiClient.post<CheckNamingResult>(
    `${PREFIX}/${projectId}/ai/check-naming`,
    body,
  );
  return data;
}

export async function aiOptimizeTypes(
  projectId: string,
  body: OptimizeTypesRequest,
) {
  const { data } = await apiClient.post<OptimizeTypesResult>(
    `${PREFIX}/${projectId}/ai/optimize-types`,
    body,
  );
  return data;
}

export async function aiRecommendScd(
  projectId: string,
  body: RecommendScdRequest,
) {
  const { data } = await apiClient.post<RecommendScdResult>(
    `${PREFIX}/${projectId}/ai/recommend-scd`,
    body,
  );
  return data;
}

// ============================================================================
// AI Phase 3 — Cost Optimizer
// ============================================================================

export async function aiWarehouseSizing(
  projectId: string,
  body: WarehouseSizingRequest,
) {
  const { data } = await apiClient.post<WarehouseSizingResult>(
    `${PREFIX}/${projectId}/ai/warehouse-sizing`,
    body,
  );
  return data;
}

export async function aiClusteringKeys(
  projectId: string,
  body: ClusteringKeysRequest,
) {
  const { data } = await apiClient.post<ClusteringKeysResult>(
    `${PREFIX}/${projectId}/ai/clustering-keys`,
    body,
  );
  return data;
}

export async function aiMaterialization(
  projectId: string,
  body: MaterializationRequest,
) {
  const { data } = await apiClient.post<MaterializationResult>(
    `${PREFIX}/${projectId}/ai/materialization`,
    body,
  );
  return data;
}

export async function aiIngestionMode(
  projectId: string,
  body: IngestionModeOptimizerRequest,
) {
  const { data } = await apiClient.post<IngestionModeOptimizerResult>(
    `${PREFIX}/${projectId}/ai/ingestion-mode`,
    body,
  );
  return data;
}

// ============================================================================
// AI Phase 4 — Deployment Intelligence
// ============================================================================

export async function aiDeploymentRisk(
  projectId: string,
) {
  const { data } = await apiClient.post<DeploymentRiskResult>(
    `${PREFIX}/${projectId}/ai/deployment-risk`,
    {},
  );
  return data;
}

export async function aiDeploySchedule(
  projectId: string,
  body: DeployScheduleRequest,
) {
  const { data } = await apiClient.post<DeployScheduleResult>(
    `${PREFIX}/${projectId}/ai/deploy-schedule`,
    body,
  );
  return data;
}

// ============================================================================
// AI Phase 5 — Continuous Learning
// ============================================================================

export async function aiRecordFeedback(
  projectId: string,
  body: AiFeedbackRequest,
) {
  const { data } = await apiClient.post<AiFeedbackResponse>(
    `${PREFIX}/${projectId}/ai/feedback`,
    body,
  );
  return data;
}

export async function aiGetFeedbackStats(
  projectId: string,
  params?: { feature?: string },
) {
  const { data } = await apiClient.get<AiFeedbackStatsResponse>(
    `${PREFIX}/${projectId}/ai/feedback/stats`,
    { params },
  );
  return data;
}

export async function aiGetSavings(
  projectId: string,
  params?: { days?: number },
) {
  const { data } = await apiClient.get<AiSavingsResponse>(
    `${PREFIX}/${projectId}/ai/savings`,
    { params },
  );
  return data;
}
