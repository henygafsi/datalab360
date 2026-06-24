import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DuckdbDataset {
  stage: string;
  file: string;
  size_bytes: number;
  last_modified: string;
}

export interface DuckdbDatasetsResponse {
  datasets: DuckdbDataset[];
  count: number;
}

export interface DuckdbQueryResult {
  data?: Record<string, unknown>[];
  columns?: string[];
  row_count?: number;
  source?: string;
  source_table?: string;
  engine?: string;
  execution_time_ms?: number;
  error?: string;
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function listDuckdbDatasets(database?: string): Promise<DuckdbDatasetsResponse> {
  const { data } = await apiClient.get(API.cortex.duckdbDatasets(), { params: { database } });
  return data;
}

export async function queryStage(stagePath: string, fileFormat?: string): Promise<DuckdbQueryResult> {
  const { data } = await apiClient.post(API.cortex.stageQuery(), {
    stage_path: stagePath,
    file_format: fileFormat || 'PARQUET',
  });
  return data;
}

export async function duckdbQuery(table: string, query?: string, limit?: number): Promise<DuckdbQueryResult> {
  const { data } = await apiClient.post(API.cortex.duckdbQuery(), { table, query, limit });
  return data;
}
