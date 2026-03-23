import apiClient from '@/lib/api-client';

const PREFIX = '/cortex/snowpark';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComputePool {
  name: string;
  state: string;
  min_nodes: number;
  max_nodes: number;
  instance_family: string;
  auto_resume: string;
  auto_suspend_secs: number;
  num_services: number;
  num_jobs: number;
  comment: string;
  created_on: string;
  [key: string]: unknown;
}

export interface ContainerService {
  name: string;
  database_name: string;
  schema_name: string;
  compute_pool: string;
  status: string;
  min_instances: number;
  max_instances: number;
  created_on: string;
  comment: string;
  [key: string]: unknown;
}

export interface StreamlitApp {
  name: string;
  database_name: string;
  schema_name: string;
  main_file: string;
  query_warehouse: string;
  url_id: string;
  created_on: string;
  comment: string;
  [key: string]: unknown;
}

export interface ImageRepo {
  name: string;
  database_name: string;
  schema_name: string;
  repository_url: string;
  owner: string;
  created_on: string;
  [key: string]: unknown;
}

export interface ServiceEndpoint {
  name: string;
  port: number;
  protocol: string;
  is_public: string;
  [key: string]: unknown;
}

export interface CreatePoolRequest {
  name: string;
  min_nodes: number;
  max_nodes: number;
  instance_family: string;
  auto_resume?: boolean;
  auto_suspend_secs?: number;
  comment?: string;
}

export interface CreateServiceRequest {
  name: string;
  database: string;
  schema: string;
  compute_pool: string;
  spec_yaml: string;
  min_instances?: number;
  max_instances?: number;
  comment?: string;
}

export interface CreateStreamlitRequest {
  name: string;
  database: string;
  schema?: string;
  main_file?: string;
  stage?: string;
  warehouse?: string;
  query_warehouse?: string;
  comment?: string;
}

// ── Compute Pools ──────────────────────────────────────────────────────────

export async function listComputePools(): Promise<{ pools: ComputePool[]; count: number }> {
  const { data } = await apiClient.get(`${PREFIX}/compute-pools`);
  return data;
}

export async function createComputePool(body: CreatePoolRequest) {
  const { data } = await apiClient.post(`${PREFIX}/compute-pools`, body);
  return data;
}

export async function suspendPool(name: string) {
  const { data } = await apiClient.post(`${PREFIX}/compute-pools/${encodeURIComponent(name)}/suspend`);
  return data;
}

export async function resumePool(name: string) {
  const { data } = await apiClient.post(`${PREFIX}/compute-pools/${encodeURIComponent(name)}/resume`);
  return data;
}

// ── Container Services ─────────────────────────────────────────────────────

export async function listServices(computePool?: string): Promise<{ services: ContainerService[]; count: number }> {
  const { data } = await apiClient.get(`${PREFIX}/services`, { params: { compute_pool: computePool } });
  return data;
}

export async function createService(body: CreateServiceRequest) {
  const { data } = await apiClient.post(`${PREFIX}/services`, body);
  return data;
}

export async function getServiceStatus(name: string, database?: string, schema?: string) {
  const { data } = await apiClient.get(`${PREFIX}/services/${encodeURIComponent(name)}/status`, {
    params: { database, schema },
  });
  return data;
}

export async function getServiceLogs(
  name: string,
  instanceId?: string,
  containerName?: string,
  numLines?: number,
): Promise<{ logs: string; service: string; instance_id: string; container: string }> {
  const { data } = await apiClient.get(`${PREFIX}/services/${encodeURIComponent(name)}/logs`, {
    params: { instance_id: instanceId, container_name: containerName, num_lines: numLines },
  });
  return data;
}

// ── Streamlit Apps ─────────────────────────────────────────────────────────

export async function listStreamlitApps(database?: string): Promise<{ apps: StreamlitApp[]; count: number }> {
  const { data } = await apiClient.get(`${PREFIX}/streamlit`, { params: { database } });
  return data;
}

export async function createStreamlitApp(body: CreateStreamlitRequest) {
  const { data } = await apiClient.post(`${PREFIX}/streamlit`, body);
  return data;
}

// ── Image Repositories ─────────────────────────────────────────────────────

export async function listImageRepos(database?: string): Promise<{ repositories: ImageRepo[]; count: number }> {
  const { data } = await apiClient.get(`${PREFIX}/image-repos`, { params: { database } });
  return data;
}

// ── Service Endpoints ──────────────────────────────────────────────────────

export async function listEndpoints(
  serviceName: string,
  database?: string,
  schema?: string,
): Promise<{ endpoints: ServiceEndpoint[]; count: number }> {
  const { data } = await apiClient.get(`${PREFIX}/endpoints/${encodeURIComponent(serviceName)}`, {
    params: { database, schema },
  });
  return data;
}
