/**
 * Cortex / Intelligent Analytics KPIs
 * GET /cortex/kpis - no static data
 */
import apiClient from '@/lib/api-client';

export interface CortexKpis {
  models_active: number | null;
  queries_today: number | null;
  avg_response_sec: number | null;
  accuracy_rate: number | null;
}

export async function getCortexKpis(): Promise<CortexKpis> {
  const response = await apiClient.get<{ data?: CortexKpis } | CortexKpis>('/cortex/kpis');
  const raw = response.data;
  const data: CortexKpis =
    raw && typeof raw === 'object' && 'data' in raw
      ? ((raw as { data?: CortexKpis }).data ?? ({} as CortexKpis))
      : (raw as CortexKpis);
  return {
    models_active: data.models_active ?? null,
    queries_today: data.queries_today ?? null,
    avg_response_sec: data.avg_response_sec ?? null,
    accuracy_rate: data.accuracy_rate ?? null,
  };
}
