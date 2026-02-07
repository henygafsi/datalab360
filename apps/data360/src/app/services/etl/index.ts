/**
 * ETL Pipeline API Service
 *
 * Comprehensive ETL pipeline management including:
 * - Component templates
 * - Pipeline CRUD operations
 * - Execution (sync, dry-run, inline)
 * - Scheduling
 * - Validation
 *
 * Base URL: /etl/...
 */

import axios from 'axios';
import { getSession } from 'next-auth/react';
import apiClient from '@/lib/api-client';
import type {
  ComponentTemplatesResponse,
  Pipeline,
  PipelineComponent,
  CreatePipelineRequest,
  CreatePipelineResponse,
  ListPipelinesResponse,
  ExecutePipelineResponse,
  InlineExecuteRequest,
  PipelineRunsResponse,
  Schedule,
  CreateScheduleRequest,
  CreateScheduleResponse,
  UpdateScheduleRequest,
  ListSchedulesResponse,
  ScheduleHistoryResponse,
  ValidatePipelineRequest,
  ValidatePipelineResponse,
  ValidateSuggestionsRequest,
  ValidateSuggestionsResponse,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// ============================================
// AUTH HELPER
// ============================================

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  const user = (session as any)?.user;
  const token = user?.access_token || (session as any)?.accessToken;
  if (!token) {
    throw new Error('Authentication required');
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (user?.account_name) headers['X-Account-Name'] = user.account_name;
  if (user?.username) headers['X-Username'] = user.username;
  return headers;
}

// ============================================
// COMPONENT TEMPLATES
// ============================================

/**
 * Get all available component templates for the ETL palette
 * GET /etl/components/templates
 */
export async function getComponentTemplates(): Promise<ComponentTemplatesResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${API_BASE_URL}/etl/components/templates`, { headers });
  return response.data;
}

// ============================================
// PIPELINE CRUD
// ============================================

/**
 * Create a new pipeline
 * POST /etl/pipelines
 */
export async function createPipeline(pipeline: CreatePipelineRequest): Promise<CreatePipelineResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/etl/pipelines`, pipeline, { headers });
  return response.data;
}

/**
 * List all pipelines
 * GET /etl/pipelines
 */
export async function listPipelines(status?: string): Promise<ListPipelinesResponse> {
  const headers = await getAuthHeaders();
  const params = status ? { status } : {};
  const response = await axios.get(`${API_BASE_URL}/etl/pipelines`, { headers, params });
  return response.data;
}

/**
 * Get a specific pipeline by ID
 * GET /etl/pipelines/{pipeline_id}
 */
export async function getPipeline(pipelineId: string): Promise<Pipeline> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${API_BASE_URL}/etl/pipelines/${pipelineId}`, { headers });
  return response.data;
}

/**
 * Update an existing pipeline
 * PUT /etl/pipelines/{pipeline_id}
 */
export async function updatePipeline(
  pipelineId: string,
  pipeline: Partial<CreatePipelineRequest>
): Promise<Pipeline> {
  const headers = await getAuthHeaders();
  const response = await axios.put(`${API_BASE_URL}/etl/pipelines/${pipelineId}`, pipeline, { headers });
  return response.data;
}

/**
 * Delete a pipeline
 * DELETE /etl/pipelines/{pipeline_id}
 */
export async function deletePipeline(pipelineId: string): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.delete(`${API_BASE_URL}/etl/pipelines/${pipelineId}`, { headers });
  return response.data;
}

// ============================================
// EXECUTION
// ============================================

/**
 * Execute a pipeline (synchronous)
 * POST /etl/pipelines/{pipeline_id}/execute
 * Uses apiClient so auth token and account headers (X-Account-Name, X-Username) are always sent.
 */
export async function executePipeline(
  pipelineId: string,
  dryRun: boolean = false
): Promise<ExecutePipelineResponse> {
  const params = dryRun ? { dry_run: true } : {};
  const { data } = await apiClient.post<ExecutePipelineResponse>(
    `/etl/pipelines/${pipelineId}/execute`,
    {},
    { params }
  );
  return data ?? ({} as ExecutePipelineResponse);
}

/**
 * Execute pipeline inline (without saving)
 * POST /etl/execute/inline
 */
export async function executeInline(request: InlineExecuteRequest): Promise<ExecutePipelineResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/etl/execute-inline`, request, { headers });
  return response.data;
}

/**
 * Get execution history for a pipeline
 * GET /etl/pipelines/{pipeline_id}/runs
 */
export async function getPipelineRuns(
  pipelineId: string,
  limit: number = 20
): Promise<PipelineRunsResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${API_BASE_URL}/etl/pipelines/${pipelineId}/runs`, {
    headers,
    params: { limit },
  });
  return response.data;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a pipeline without saving
 * POST /etl/pipelines/validate
 */
export async function validatePipeline(
  request: ValidatePipelineRequest
): Promise<ValidatePipelineResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/etl/pipelines/validate`, request, { headers });
  return response.data;
}

/**
 * Get AI suggestions for validation errors, warnings and optimizations
 * POST /etl/pipelines/validate/suggestions
 * Uses Cortex LLM with reference to Workflow and Explore & Design actions.
 */
export async function getValidateSuggestions(
  request: ValidateSuggestionsRequest
): Promise<ValidateSuggestionsResponse> {
  const { data } = await apiClient.post<ValidateSuggestionsResponse>(
    '/etl/pipelines/validate/suggestions',
    request
  );
  return data ?? { response: '', model: '' };
}

// ============================================
// SCHEDULING
// ============================================

/**
 * Create a schedule for a pipeline
 * POST /etl/schedules
 */
export async function createSchedule(request: CreateScheduleRequest): Promise<CreateScheduleResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/etl/schedules`, request, { headers });
  return response.data;
}

/**
 * List all schedules
 * GET /etl/schedules
 */
export async function listSchedules(): Promise<ListSchedulesResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${API_BASE_URL}/etl/schedules`, { headers });
  return response.data;
}

/**
 * Get a specific schedule
 * GET /etl/schedules/{schedule_id}
 */
export async function getSchedule(scheduleId: string): Promise<Schedule> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${API_BASE_URL}/etl/schedules/${scheduleId}`, { headers });
  return response.data;
}

/**
 * Update a schedule
 * PUT /etl/schedules/{schedule_id}
 */
export async function updateSchedule(
  scheduleId: string,
  request: UpdateScheduleRequest
): Promise<Schedule> {
  const headers = await getAuthHeaders();
  const response = await axios.put(`${API_BASE_URL}/etl/schedules/${scheduleId}`, request, { headers });
  return response.data;
}

/**
 * Delete a schedule
 * DELETE /etl/schedules/{schedule_id}
 */
export async function deleteSchedule(scheduleId: string): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.delete(`${API_BASE_URL}/etl/schedules/${scheduleId}`, { headers });
  return response.data;
}

/**
 * Suspend a schedule
 * POST /etl/schedules/{schedule_id}/suspend
 */
export async function suspendSchedule(scheduleId: string): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/etl/schedules/${scheduleId}/suspend`, {}, { headers });
  return response.data;
}

/**
 * Resume a schedule
 * POST /etl/schedules/{schedule_id}/resume
 */
export async function resumeSchedule(scheduleId: string): Promise<{ message: string }> {
  const headers = await getAuthHeaders();
  const response = await axios.post(`${API_BASE_URL}/etl/schedules/${scheduleId}/resume`, {}, { headers });
  return response.data;
}

/**
 * Get schedule execution history
 * GET /etl/schedules/{schedule_id}/history
 */
export async function getScheduleHistory(
  scheduleId: string,
  limit: number = 20
): Promise<ScheduleHistoryResponse> {
  const headers = await getAuthHeaders();
  const response = await axios.get(`${API_BASE_URL}/etl/schedules/${scheduleId}/history`, {
    headers,
    params: { limit },
  });
  return response.data;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    running: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
    completed: 'text-green-500 bg-green-50 dark:bg-green-900/20',
    failed: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    active: 'text-green-500 bg-green-50 dark:bg-green-900/20',
    inactive: 'text-slate-500 bg-slate-50 dark:bg-slate-900/20',
    archived: 'text-slate-400 bg-slate-100 dark:bg-slate-800/50',
  };
  return colors[status] || 'text-slate-500 bg-slate-50';
}

/**
 * Get status icon name for UI
 */
export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    running: 'loader-2',
    completed: 'check-circle',
    failed: 'x-circle',
    active: 'check-circle',
    inactive: 'pause-circle',
    archived: 'archive',
  };
  return icons[status] || 'circle';
}

/**
 * Parse cron expression to human-readable format
 */
export function cronToHuman(cron: string): string {
  // Common patterns
  const patterns: Record<string, string> = {
    '0 * * * *': 'Every hour',
    '0 0 * * *': 'Daily at midnight',
    '0 9 * * *': 'Daily at 9:00 AM',
    '0 0 * * 1': 'Weekly on Monday',
    '0 9 * * 1': 'Weekly on Monday at 9:00 AM',
    '0 0 1 * *': 'Monthly on the 1st',
    '0 9 1 * *': 'Monthly on the 1st at 9:00 AM',
    '0 */2 * * *': 'Every 2 hours',
    '0 9 * * 1-5': 'Weekdays at 9:00 AM',
  };
  return patterns[cron] || cron;
}

/**
 * Common cron presets
 */
export const CRON_PRESETS = [
  { value: '0 * * * *', label: 'Hourly' },
  { value: '0 */2 * * *', label: 'Every 2 hours' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 9 * * *', label: 'Daily at 9:00 AM' },
  { value: '0 0 * * *', label: 'Daily at midnight' },
  { value: '0 9 * * 1-5', label: 'Weekdays at 9:00 AM' },
  { value: '0 9 * * 1', label: 'Weekly on Monday at 9:00 AM' },
  { value: '0 9 1 * *', label: 'Monthly on the 1st at 9:00 AM' },
];

/**
 * Common timezones
 */
export const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
];

// Export all as default object for convenience
export default {
  // Templates
  getComponentTemplates,
  // Pipeline CRUD
  createPipeline,
  listPipelines,
  getPipeline,
  updatePipeline,
  deletePipeline,
  // Execution
  executePipeline,
  executeInline,
  getPipelineRuns,
  // Validation
  validatePipeline,
  // Scheduling
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  suspendSchedule,
  resumeSchedule,
  getScheduleHistory,
  // Utilities
  formatDuration,
  getStatusColor,
  getStatusIcon,
  cronToHuman,
  CRON_PRESETS,
  TIMEZONES,
};

// Re-export types
export * from './types';
