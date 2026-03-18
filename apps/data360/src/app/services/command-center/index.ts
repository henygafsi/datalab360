/**
 * Command Center API Services
 * Aggregated KPIs and monitoring across all Data360 modules
 */

import apiClient from '@/lib/api-client';
import type {
  SummaryResponse,
  ModuleHealthResponse,
  ActivityFeedResponse,
  InfrastructureResponse,
  PipelinesResponse,
  CostBreakdownResponse,
} from './types';

const PREFIX = '/command-center';

/** Build filter params — strips undefined values */
function buildParams(params: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      clean[k] = v;
    }
  }
  return clean;
}

/** Executive summary — top KPIs from all modules */
export async function getSummary(params?: { days?: number; start_date?: string; end_date?: string }): Promise<SummaryResponse> {
  const { data } = await apiClient.get<SummaryResponse>(`${PREFIX}/summary`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Per-module health status */
export async function getModuleHealth(params?: { days?: number }): Promise<ModuleHealthResponse> {
  const { data } = await apiClient.get<ModuleHealthResponse>(`${PREFIX}/module-health`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Unified activity feed across all modules */
export async function getActivityFeed(limit = 50, params?: { days?: number; module_name?: string; username?: string }): Promise<ActivityFeedResponse> {
  const { data } = await apiClient.get<ActivityFeedResponse>(`${PREFIX}/activity-feed`, {
    params: buildParams({ limit, ...params }),
  });
  return data;
}

/** Snowflake infrastructure snapshot */
export async function getInfrastructure(params?: { days?: number }): Promise<InfrastructureResponse> {
  const { data } = await apiClient.get<InfrastructureResponse>(`${PREFIX}/infrastructure`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Pipeline & ingestion health */
export async function getPipelines(params?: { days?: number }): Promise<PipelinesResponse> {
  const { data } = await apiClient.get<PipelinesResponse>(`${PREFIX}/pipelines`, {
    params: buildParams(params || {}),
  });
  return data;
}

/** Comprehensive cost intelligence */
export async function getCostBreakdown(days = 30, params?: { start_date?: string; end_date?: string }): Promise<CostBreakdownResponse> {
  const { data } = await apiClient.get<CostBreakdownResponse>(`${PREFIX}/cost-breakdown`, {
    params: buildParams({ days, ...params }),
  });
  return data;
}
