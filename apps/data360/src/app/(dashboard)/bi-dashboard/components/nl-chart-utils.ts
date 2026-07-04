/**
 * Shared NL→chart helpers for the BI builder.
 *
 * Extracted from DashboardEditor so both the inline NL bar and the docked
 * AI Build section (AiBuildSection, hosted in BiSmartRightBar) can turn the
 * loose chart_config returned by POST /bi-dashboard/nl-to-chart into a real,
 * persistable widget config without duplicating the defensive parsing.
 */
import type { BIDashboardChartConfig, DashboardWidget } from '@/app/services/api/types';

/**
 * Defensively turn the loose chart_config returned by POST /bi-dashboard/nl-to-chart
 * into a BIDashboardChartConfig, falling back to the dashboard's default db/schema.
 */
export function nlConfigToChartConfig(
  raw: Record<string, unknown>,
  defaults: { database?: string | null; schema?: string | null },
): BIDashboardChartConfig {
  const measuresRaw = raw.measures ?? raw.suggestedMeasures ?? raw.y;
  const measures = Array.isArray(measuresRaw)
    ? measuresRaw
        .map((m) =>
          typeof m === 'string'
            ? { column: m, aggregator: 'SUM' }
            : m && typeof m === 'object' && 'column' in m
              ? {
                  column: String((m as { column: unknown }).column),
                  aggregator: String((m as { aggregator?: unknown }).aggregator || 'SUM'),
                }
              : null,
        )
        .filter((m): m is { column: string; aggregator: string } => !!m && !!m.column)
    : typeof measuresRaw === 'string'
      ? [{ column: measuresRaw, aggregator: 'SUM' }]
      : [];

  const dimRaw = raw.x ?? raw.dimension ?? raw.suggestedDimension ?? raw.groupBy;
  const x =
    typeof dimRaw === 'string'
      ? dimRaw
      : Array.isArray(dimRaw) && typeof dimRaw[0] === 'string'
        ? (dimRaw[0] as string)
        : null;

  const groupByRaw = raw.groupBy;
  const groupBy = Array.isArray(groupByRaw)
    ? groupByRaw.filter((g): g is string => typeof g === 'string')
    : x
      ? [x]
      : [];

  return {
    database: String(raw.database || defaults.database || ''),
    schema: String(raw.schema || defaults.schema || ''),
    table: String(raw.table || ''),
    x,
    measures,
    filters: [],
    groupBy,
    limit: typeof raw.limit === 'number' ? raw.limit : null,
  };
}

/** Stack a freshly added widget below the existing ones. */
export function nextWidgetPosition(widgets: DashboardWidget[]): { x: number; y: number } {
  if (widgets.length === 0) return { x: 0, y: 0 };
  return { x: 0, y: Math.max(...widgets.map((w) => w.position_y + w.height)) };
}

/**
 * Split a free-text dashboard prompt into the individual chart asks it
 * implies. Capped at 6 so the per-ask AI calls stay honest about cost.
 */
export function splitPromptIntoAsks(prompt: string): string[] {
  const parts = prompt
    .split(/(?:,| and | plus |;|\bthen\b|\balso\b|\n)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 6);
  return (parts.length > 0 ? parts : [prompt]).slice(0, 6);
}
