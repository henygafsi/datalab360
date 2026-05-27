/**
 * BI Dashboard Module API client — /bi-dashboard/*
 * Replaces the old business_reporting module.
 * Handles: dashboard CRUD, pages, widgets, filters, chart data, retail KPIs, snapshots.
 */
import apiClient from '@/lib/api-client';
import type {
  CreateDashboardRequest,
  CreateDashboardResponse,
  FullDashboard,
  UpdateDashboardRequest,
  CreatePageRequest,
  DashboardPage,
  UpdatePageRequest,
  CreateWidgetRequest,
  CreateWidgetResponse,
  DashboardWidget,
  UpdateWidgetRequest,
  ListWidgetsParams,
  CreateFilterRequest,
  DashboardFilter,
  ListFiltersParams,
  BIDashboardChartConfig,
  ChartDataResponse,
  RetailKpisParams,
  SnapshotResponse,
  ListTemplatesResponse,
  AutoCreateDashboardRequest,
  AutoCreateDashboardResponse,
  DrillThroughRequest,
  DrillThroughResponse,
  RenderWidgetRequest,
  RenderDashboardResponse,
} from './types';

const PREFIX = '/bi-dashboard';

// ============================================================================
// Dashboard CRUD
// ============================================================================

export async function createDashboard(body: CreateDashboardRequest) {
  const { data } = await apiClient.post<CreateDashboardResponse>(PREFIX, body);
  return data;
}

export async function getDashboard(projectId: string) {
  const { data } = await apiClient.get<FullDashboard>(`${PREFIX}/${projectId}`);
  return data;
}

export async function updateDashboard(
  projectId: string,
  body: UpdateDashboardRequest
) {
  const { data } = await apiClient.put<FullDashboard>(
    `${PREFIX}/${projectId}`,
    body
  );
  return data;
}

export async function deleteDashboard(projectId: string) {
  const { data } = await apiClient.delete(`${PREFIX}/${projectId}`);
  return data;
}

// ============================================================================
// Pages
// ============================================================================

export async function createPage(projectId: string, body: CreatePageRequest) {
  const { data } = await apiClient.post<DashboardPage>(
    `${PREFIX}/${projectId}/pages`,
    body
  );
  return data;
}

export async function listPages(projectId: string) {
  const { data } = await apiClient.get<DashboardPage[]>(
    `${PREFIX}/${projectId}/pages`
  );
  return data;
}

export async function updatePage(
  projectId: string,
  pageId: string,
  body: UpdatePageRequest
) {
  const { data } = await apiClient.put<DashboardPage>(
    `${PREFIX}/${projectId}/pages/${pageId}`,
    body
  );
  return data;
}

export async function deletePage(projectId: string, pageId: string) {
  const { data } = await apiClient.delete(
    `${PREFIX}/${projectId}/pages/${pageId}`
  );
  return data;
}

// ============================================================================
// Widgets
// ============================================================================

export async function createWidget(projectId: string, body: CreateWidgetRequest) {
  const { data } = await apiClient.post<CreateWidgetResponse>(
    `${PREFIX}/${projectId}/widgets`,
    body
  );
  return data;
}

export async function listWidgets(projectId: string, params?: ListWidgetsParams) {
  const { data } = await apiClient.get<DashboardWidget[]>(
    `${PREFIX}/${projectId}/widgets`,
    { params }
  );
  return data;
}

export async function updateWidget(
  projectId: string,
  widgetId: string,
  body: UpdateWidgetRequest
) {
  const { data } = await apiClient.put<DashboardWidget>(
    `${PREFIX}/${projectId}/widgets/${widgetId}`,
    body
  );
  return data;
}

export async function deleteWidget(projectId: string, widgetId: string) {
  const { data } = await apiClient.delete(
    `${PREFIX}/${projectId}/widgets/${widgetId}`
  );
  return data;
}

// ============================================================================
// Filters
// ============================================================================

export async function createFilter(projectId: string, body: CreateFilterRequest) {
  const { data } = await apiClient.post<DashboardFilter>(
    `${PREFIX}/${projectId}/filters`,
    body
  );
  return data;
}

export async function listFilters(projectId: string, params?: ListFiltersParams) {
  const { data } = await apiClient.get<DashboardFilter[]>(
    `${PREFIX}/${projectId}/filters`,
    { params }
  );
  return data;
}

export async function deleteFilter(projectId: string, filterId: string) {
  const { data } = await apiClient.delete(
    `${PREFIX}/${projectId}/filters/${filterId}`
  );
  return data;
}

// ============================================================================
// Chart Data (replaces old POST /bi_reporting/charts/data)
// ============================================================================

// ============================================================================
// Batch render — one POST returns per-widget {status, data, error}.
// Replaces N individual /charts/data calls when rendering a full page.
// ============================================================================

export async function renderDashboard(
  projectId: string,
  widgets: RenderWidgetRequest[]
): Promise<RenderDashboardResponse> {
  const { data } = await apiClient.post<RenderDashboardResponse>(
    `${PREFIX}/${projectId}/render`,
    { widgets }
  );
  return data;
}

// ============================================================================
// NL-to-Chart (AI-powered chart generation)
// ============================================================================

export interface NlToChartRequest {
  question: string;
  database?: string;
  schema?: string;
}

export interface NlToChartResponse {
  chart_config: Record<string, unknown> | null;
  valid: boolean;
  validation_errors?: Array<{ type: string; msg: string }> | null;
  question: string;
  execution_time_ms: number;
}

export async function nlToChart(
  question: string,
  database?: string,
  schema?: string
) {
  const body: NlToChartRequest = { question };
  if (database) body.database = database;
  if (schema) body.schema = schema;
  const { data } = await apiClient.post<NlToChartResponse>(
    `${PREFIX}/nl-to-chart`,
    body
  );
  return data;
}

// ============================================================================
// Retail KPIs
// ============================================================================

export async function getRetailKpis(params?: RetailKpisParams) {
  const { data } = await apiClient.get(`${PREFIX}/retail-kpis`, { params });
  return data;
}

// ============================================================================
// Versioning
// ============================================================================

export async function saveSnapshot(projectId: string) {
  const { data } = await apiClient.post<SnapshotResponse>(
    `${PREFIX}/${projectId}/snapshot`
  );
  return data;
}

// ============================================================================
// Templates Gallery
// ============================================================================

export async function listTemplates() {
  const { data } = await apiClient.get<ListTemplatesResponse>(
    `${PREFIX}/templates`
  );
  return data;
}

// ============================================================================
// Auto-create Dashboard from Table
// ============================================================================

export async function autoCreateDashboard(body: AutoCreateDashboardRequest) {
  const { data } = await apiClient.post<AutoCreateDashboardResponse>(
    `${PREFIX}/auto-create`,
    body
  );
  return data;
}

// ============================================================================
// Drill-through
// ============================================================================

export async function drillThrough(
  dashboardId: string,
  body: DrillThroughRequest
) {
  const { data } = await apiClient.post<DrillThroughResponse>(
    `${PREFIX}/${dashboardId}/drill-through`,
    body
  );
  return data;
}

// ============================================================================
// Export Dashboard (JSON download)
// ============================================================================

export async function exportDashboard(projectId: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(
    `${PREFIX}/${projectId}/export`,
    { responseType: 'blob' }
  );
  return data;
}
