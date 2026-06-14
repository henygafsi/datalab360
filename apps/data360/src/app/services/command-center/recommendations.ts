/**
 * Command Center — Recommendations API client.
 *
 * Backs the structured recommendations surface (severity + CTA) consumed by
 * ProjectContextPanel's "Recommendations" tab and any cross-module advisor view.
 *
 * Backend routes (no `/api` prefix — axios baseURL adds none, matching the rest
 * of command-center/index.ts):
 *   GET /command-center/recommendations              — all dimensions
 *   GET /command-center/recommendations/{dimension}  — single dimension
 *
 * Payload contract:
 *   { days, total_open, total_critical,
 *     kpis: RecommendationKpi[],
 *     by_dimension: { [dim]: Recommendation[] },
 *     counts: { [dim]: { open, critical } },
 *     recommendations: Recommendation[] }
 */
import apiClient from '@/lib/api-client';

const PREFIX = '/command-center';

/** Severity ranks emitted by the backend, ordered most→least urgent. */
export type RecommendationSeverity = 'critical' | 'high' | 'warning' | 'info';

/** CTA verbs the FE knows how to dispatch. */
export type RecommendationCtaAction = 'navigate' | 'install' | 'refresh';

/** Call-to-action attached to a recommendation row. */
export interface RecommendationCta {
  label: string;
  action: RecommendationCtaAction;
  /** For `navigate` → a route path; for `install` → an API path to POST. */
  target: string;
}

/** A single actionable recommendation. */
export interface Recommendation {
  id: string;
  dimension: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
  value: number | string | null;
  cta: RecommendationCta;
}

/** Headline KPI surfaced alongside the recommendation list. */
export interface RecommendationKpi {
  key: string;
  label: string;
  value: number | string | null;
  critical: boolean;
  dimension: string;
}

/** Per-dimension open/critical tallies. */
export interface RecommendationDimensionCounts {
  open: number;
  critical: number;
}

/** Full payload returned by the recommendations endpoints. */
export interface CommandCenterRecommendations {
  days: number;
  total_open: number;
  total_critical: number;
  kpis: RecommendationKpi[];
  by_dimension: Record<string, Recommendation[]>;
  counts: Record<string, RecommendationDimensionCounts>;
  recommendations: Recommendation[];
}

/** Cross-module recommendations across every dimension. */
export async function getCommandCenterRecommendations(
  days?: number,
): Promise<CommandCenterRecommendations> {
  const { data } = await apiClient.get<CommandCenterRecommendations>(
    `${PREFIX}/recommendations`,
    { params: days != null ? { days } : undefined },
  );
  return data;
}

/** Recommendations scoped to a single dimension (e.g. "security", "cost"). */
export async function getCommandCenterRecommendationsForDimension(
  dimension: string,
  days?: number,
): Promise<CommandCenterRecommendations> {
  const { data } = await apiClient.get<CommandCenterRecommendations>(
    `${PREFIX}/recommendations/${encodeURIComponent(dimension)}`,
    { params: days != null ? { days } : undefined },
  );
  return data;
}
