/**
 * Explore & Design Module API client — /api/v1/explore-design/*
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
} from './types';

const PREFIX = '/api/v1/explore-design';

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

export async function executeDDLActions(projectId: string) {
  const { data } = await apiClient.post<ExecuteDDLResponse>(
    `${PREFIX}/${projectId}/ddl-actions/execute`,
  );
  return data;
}

export async function rollbackDDLAction(projectId: string, eventId: string) {
  const { data } = await apiClient.post<RollbackDDLResponse>(
    `${PREFIX}/${projectId}/ddl-actions/${eventId}/rollback`,
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
