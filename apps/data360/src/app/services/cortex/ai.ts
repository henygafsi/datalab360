import apiClient from '@/lib/api-client';

const PREFIX = '/cortex';

// ---------------------------------------------------------------------------
// Types — verified on dev (§2 of FRONTEND_INTEGRATION.md)
// ---------------------------------------------------------------------------

export interface CortexModelsResponse {
  data: {
    completion: string[];
    embedding: string[];
    recommendations: {
      code: string;
      code_cheap: string;
      reasoning: string;
      narrative: string;
      cheap: string;
      multilingual: string;
      embedding: string;
    };
    default_completion: string;
    count: { completion: number; embedding: number };
  };
}

export interface CodeGenRequest {
  language: 'python' | 'sql' | 'yaml' | 'json' | 'typescript' | 'bash';
  spec: string;
  model?: string;
  context?: string;
  allow_destructive?: boolean;
  request_critique?: boolean;
}

export interface CodeGenResponse {
  data: {
    response: string;
    raw: string;
    language: string;
    model: string;
    api: 'AI_COMPLETE' | 'CORTEX.COMPLETE';
    cached: boolean;
    syntax_valid: boolean;
    syntax_error: string | null;
    blocked_tokens: string[];
    blocked: boolean;
    critique: string | null;
    credits_estimate_micro: number;
  };
}

export interface SynthesizeRequest {
  n_rows: number;
  columns?: Array<{ name: string; type: string; nullable?: boolean; description?: string; sample?: string }>;
  database?: string;
  schema?: string;
  table?: string;
  model?: string;
  context?: string;
  seed?: number;
}

export interface SynthesizeResponse {
  data: {
    rows: Record<string, unknown>[];
    requested: number;
    returned: number;
    columns: Array<{ name: string; type: string; nullable?: boolean }>;
    model: string;
    source?: string;
    cached: boolean;
  };
}

export interface IconSuggestRequest {
  title: string;
  semantic_role?: 'kpi' | 'trend' | 'ratio' | 'count' | 'distribution';
  measure_type?: 'currency' | 'percentage' | 'count' | 'duration';
  industry?: string;
  description?: string;
  model?: string;
}

export interface IconSuggestResponse {
  data: {
    icon: string;
    alternatives: string[];
    reason: string;
    model: string;
    cached: boolean;
  };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getCortexModels(): Promise<CortexModelsResponse> {
  const { data } = await apiClient.get<CortexModelsResponse>(`${PREFIX}/models`);
  return data;
}

export async function generateCode(body: CodeGenRequest): Promise<CodeGenResponse> {
  const { data } = await apiClient.post<CodeGenResponse>(`${PREFIX}/code-generate`, body);
  return data;
}

export async function synthesizeRows(body: SynthesizeRequest): Promise<SynthesizeResponse> {
  const { data } = await apiClient.post<SynthesizeResponse>(`${PREFIX}/synthesize-rows`, body);
  return data;
}

export async function suggestIcon(body: IconSuggestRequest): Promise<IconSuggestResponse> {
  const { data } = await apiClient.post<IconSuggestResponse>(`${PREFIX}/icon-suggest`, body);
  return data;
}

// ---------------------------------------------------------------------------
// SPCS lifecycle (§4)
// ---------------------------------------------------------------------------

export async function suspendService(name: string, params?: { database?: string; schema?: string }): Promise<any> {
  const { data } = await apiClient.post(`${PREFIX}/snowpark/services/${encodeURIComponent(name)}/suspend`, null, { params });
  return data;
}

export async function resumeService(name: string, params?: { database?: string; schema?: string }): Promise<any> {
  const { data } = await apiClient.post(`${PREFIX}/snowpark/services/${encodeURIComponent(name)}/resume`, null, { params });
  return data;
}

export async function dropService(name: string, params?: { database?: string; schema?: string }): Promise<any> {
  const { data } = await apiClient.delete(`${PREFIX}/snowpark/services/${encodeURIComponent(name)}`, { params: { confirm: true, ...params } });
  return data;
}

export async function autoStopService(name: string, seconds: number, mode: 'suspend' | 'drop'): Promise<any> {
  const { data } = await apiClient.post(`${PREFIX}/snowpark/services/${encodeURIComponent(name)}/auto-stop`, null, { params: { seconds, mode } });
  return data;
}

export async function dropComputePool(name: string, params?: { database?: string; schema?: string }): Promise<any> {
  const { data } = await apiClient.delete(`${PREFIX}/snowpark/compute-pools/${encodeURIComponent(name)}`, { params: { confirm: true, ...params } });
  return data;
}
