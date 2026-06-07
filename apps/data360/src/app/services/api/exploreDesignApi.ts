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
  RelationDetection,
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

/**
 * NOTE: /{project_id}/templates endpoints DO NOT EXIST on backend.
 * Wrapped in try-catch with safe fallback.
 */
export async function listTemplates(projectId: string) {
  try {
    const { data } = await apiClient.get<TemplateListResponse>(
      `${PREFIX}/${projectId}/templates`,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[listTemplates] Endpoint not implemented on backend; returning empty list.', error);
    }
    return { templates: [] } as TemplateListResponse;
  }
}

export async function createTemplate(projectId: string, body: CreateTemplateRequest) {
  try {
    const { data } = await apiClient.post<{ template_id: string; template_name: string }>(
      `${PREFIX}/${projectId}/templates`,
      body,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[createTemplate] Endpoint not implemented on backend.', error);
    }
    throw error;
  }
}

// ============================================================================
// Metadata
// ============================================================================

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

/**
 * Detect relationships across the given tables.
 *
 * The legacy `/{project_id}/detect/relations` route never existed on the
 * backend. The live equivalent is the Cortex-backed
 * `/{project_id}/ai/discover-relationships` (same route the Explore & Design
 * page and DetectedModelsTab use). We repoint here and adapt the response into
 * the `DetectRelationsResponse` shape the AI-guided wizard consumes.
 *
 * NOTE: errors are intentionally NOT swallowed. The wizard's
 * `ai-guided-strategy` caller falls back to name-match heuristics only when
 * this call throws — returning an empty result here would silently produce
 * zero relations with no fallback.
 */
export async function detectRelations(
  projectId: string,
  body: DetectRelationsRequest,
): Promise<DetectRelationsResponse> {
  const { data } = await apiClient.post<DiscoverRelationshipsResult>(
    `${PREFIX}/${projectId}/ai/discover-relationships`,
    {
      tables: body.tables.map((t) => ({
        database: t.database,
        schema: t.schema,
        table_name: t.table,
      })),
    },
  );
  const relations: RelationDetection[] = (data.relationships ?? []).map((r, i) => ({
    detection_id: `${r.source_table}.${r.source_column}->${r.target_table}.${r.target_column}` || `rel-${i}`,
    left_table: r.source_table,
    left_column: r.source_column,
    right_table: r.target_table,
    right_column: r.target_column,
    relation_type: r.discovery_method || 'FOREIGN_KEY',
    confidence: r.confidence,
  }));
  return { project_id: projectId, relations };
}

// ============================================================================
// Schema Clone
// ============================================================================

// ============================================================================
// Ingestion
// ============================================================================

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

// ============================================================================
// Column Mappings
// ============================================================================

/**
 * NOTE: /{project_id}/mappings endpoints DO NOT EXIST on backend.
 * Mappings are submitted inside ingestion bodies (executeIngestion, dryRunIngestion).
 * Wrapped in try-catch with safe fallback.
 */
export async function createMapping(projectId: string, body: CreateMappingRequest) {
  try {
    const { data } = await apiClient.post<{ mapping_id: string }>(
      `${PREFIX}/${projectId}/mappings`,
      body,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[createMapping] Endpoint not on backend; mappings live in ingestion payloads.', error);
    }
    throw error;
  }
}

export async function listMappings(projectId: string) {
  try {
    const { data } = await apiClient.get<MappingListResponse>(
      `${PREFIX}/${projectId}/mappings`,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[listMappings] Endpoint not on backend; returning empty list.', error);
    }
    return { project_id: projectId, mappings: [] } as MappingListResponse;
  }
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

/**
 * NOTE: /{project_id}/ddl-actions/batch DOES NOT EXIST on backend.
 * Backend only exposes the singular POST /{project_id}/ddl-actions.
 * Wrapped: falls back to per-action POST so callers stay functional.
 */
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
  try {
    const { data } = await apiClient.post(
      `${PREFIX}/${projectId}/ddl-actions/batch`,
      body,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[batchAddDDLActions] /ddl-actions/batch not on backend; falling back to per-action POST.', error);
    }
    const results = await Promise.all(
      body.actions.map((a) =>
        apiClient
          .post(`${PREFIX}/${projectId}/ddl-actions`, a)
          .then((r) => r.data)
          .catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
      ),
    );
    return { actions: results };
  }
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

export async function removeDDLAction(projectId: string, eventId: string) {
  const { data } = await apiClient.delete<{ status: string; event_id: string }>(
    `${PREFIX}/${projectId}/ddl-actions/${eventId}`,
  );
  return data;
}

// ============================================================================
// Model Versions
// ============================================================================

/**
 * NOTE: /{project_id}/models DOES NOT EXIST on backend.
 * Versions are exposed via /{project_id}/versions -- prefer listExploreVersions.
 * Wrapped in try-catch with safe fallback.
 */
export async function listModels(projectId: string, params?: ListModelsParams) {
  try {
    const { data } = await apiClient.get<ModelVersionListResponse>(
      `${PREFIX}/${projectId}/models`,
      { params },
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[listModels] /models not on backend; consider listExploreVersions.', error);
    }
    return { project_id: projectId, versions: [], count: 0 } as ModelVersionListResponse;
  }
}

// ============================================================================
// Deploy
// ============================================================================

/**
 * Quick deploy endpoint: POST /{project_id}/deploy
 * NOTE: This route is listed in the API spec but was NOT found in the current
 * backend router.py. The closest is POST /{project_id}/deployments (deprecated).
 * Wrapped in try-catch; on failure falls back to the /deployments endpoint.
 */
export async function quickDeploy(projectId: string, versionId: string) {
  try {
    const { data } = await apiClient.post<QuickDeployResponse>(
      `${PREFIX}/${projectId}/deploy`,
      undefined,
      { params: { version_id: versionId } },
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[quickDeploy] /deploy not found; falling back to /deployments.', error);
    }
    // Fallback to the deprecated /deployments endpoint
    const { data } = await apiClient.post<QuickDeployResponse>(
      `${PREFIX}/${projectId}/deployments`,
      { version_id: versionId },
    );
    return data;
  }
}

export async function requestDeployment(
  projectId: string,
  body: CreateExploreDeploymentRequest,
) {
  const { data } = await apiClient.post<ExploreDeployment>(
    `/projects/${projectId}/deployments`,
    { ...body, module: 'explore_design' },
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

// ============================================================================
// Scheduling
// ============================================================================

/**
 * NOTE: /{project_id}/task/suspend, /task/resume and /schedules DO NOT EXIST
 * on the explore-design backend. Wrapped in try-catch with safe fallback.
 */
export async function suspendTask(projectId: string) {
  try {
    const { data } = await apiClient.post<{ status: string }>(
      `${PREFIX}/${projectId}/task/suspend`,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[suspendTask] Endpoint not implemented on backend.', error);
    }
    return { status: 'not_implemented' };
  }
}

export async function resumeTask(projectId: string) {
  try {
    const { data } = await apiClient.post<{ status: string }>(
      `${PREFIX}/${projectId}/task/resume`,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[resumeTask] Endpoint not implemented on backend.', error);
    }
    return { status: 'not_implemented' };
  }
}

export async function listSchedules(
  projectId: string,
  params?: { status?: string },
) {
  try {
    const { data } = await apiClient.get<ScheduleListResponse>(
      `${PREFIX}/${projectId}/schedules`,
      { params },
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[listSchedules] Endpoint not on backend; returning empty list.', error);
    }
    return { schedules: [], count: 0 } as ScheduleListResponse;
  }
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

/**
 * NOTE: /{project_id}/audit-trail DOES NOT EXIST on backend.
 * Audit data is exposed via /{project_id}/events -- use getExploreEvents.
 * Wrapped in try-catch with safe fallback.
 */
export async function getAuditTrail(
  projectId: string,
  params?: AuditTrailParams,
) {
  try {
    const { data } = await apiClient.get<AuditTrailResult>(
      `${PREFIX}/${projectId}/audit-trail`,
      { params },
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[getAuditTrail] /audit-trail not on backend; use getExploreEvents.', error);
    }
    return { project_id: projectId, entries: [], total: 0, limit: 0 } as AuditTrailResult;
  }
}

/**
 * NOTE: /event-templates DOES NOT EXIST on backend (do not confuse with /event-tables).
 * Wrapped in try-catch with safe fallback.
 */
export async function listEventTemplates(params?: { category?: string }) {
  try {
    const { data } = await apiClient.get<EventTemplate[]>(
      `${PREFIX}/event-templates`,
      { params },
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[listEventTemplates] /event-templates not on backend; returning empty list.', error);
    }
    return [] as EventTemplate[];
  }
}

/**
 * NOTE: /{project_id}/event-templates/apply DOES NOT EXIST on backend.
 * Wrapped in try-catch.
 */
export async function applyEventTemplate(
  projectId: string,
  body: ApplyEventTemplateRequest,
) {
  try {
    const { data } = await apiClient.post<ApplyEventTemplateResult>(
      `${PREFIX}/${projectId}/event-templates/apply`,
      body,
    );
    return data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[applyEventTemplate] Endpoint not implemented on backend.', error);
    }
    throw error;
  }
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
