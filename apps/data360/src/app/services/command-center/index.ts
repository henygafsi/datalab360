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

/** Executive summary — top KPIs from all modules */
export async function getSummary(): Promise<SummaryResponse> {
  const { data } = await apiClient.get<SummaryResponse>(`${PREFIX}/summary`);
  return data;
}

/** Per-module health status */
export async function getModuleHealth(): Promise<ModuleHealthResponse> {
  const { data } = await apiClient.get<ModuleHealthResponse>(`${PREFIX}/module-health`);
  return data;
}

/** Unified activity feed across all modules */
export async function getActivityFeed(limit = 50): Promise<ActivityFeedResponse> {
  const { data } = await apiClient.get<ActivityFeedResponse>(`${PREFIX}/activity-feed`, {
    params: { limit },
  });
  return data;
}

/** Snowflake infrastructure snapshot */
export async function getInfrastructure(): Promise<InfrastructureResponse> {
  const { data } = await apiClient.get<InfrastructureResponse>(`${PREFIX}/infrastructure`);
  return data;
}

/** Pipeline & ingestion health */
export async function getPipelines(): Promise<PipelinesResponse> {
  const { data } = await apiClient.get<PipelinesResponse>(`${PREFIX}/pipelines`);
  return data;
}

/** Comprehensive cost intelligence */
export async function getCostBreakdown(days = 30): Promise<CostBreakdownResponse> {
  const { data } = await apiClient.get<CostBreakdownResponse>(`${PREFIX}/cost-breakdown`, {
    params: { days },
  });
  return data;
}
