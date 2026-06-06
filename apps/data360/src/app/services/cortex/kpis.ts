/**
 * Cortex / Intelligent Analytics KPIs
 * GET /cortex/kpis - no static data
 */
import apiClient from '@/lib/api-client';

// Real Cortex credit/token usage over a window (ACCOUNT_USAGE; router.py:1245,
// usage_metrics.get_cortex_credit_usage). Additive + fully degradable: any key
// may be null when the grant/usage view is unavailable, and the whole block is
// absent if the usage scan failed.
export interface CortexUsage {
  period_days?: number;
  total_credits?: number | null;
  total_tokens?: number | null;
  total_calls?: number | null;
  calls_today?: number | null;
  ai_services_credits?: number | null;
  source?: string | null;
}

export interface CortexKpis {
  models_active: number | null;
  queries_today: number | null;
  avg_response_sec: number | null;
  accuracy_rate: number | null;
  cortex_usage?: CortexUsage | null;
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
    cortex_usage: data.cortex_usage ?? null,
  };
}
