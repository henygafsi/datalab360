/**
 * Catalog grounding for the BI Dashboard "describe a dashboard" AI wizard.
 *
 * Mirrors data-source-connection/connector-catalog-grounding.ts and
 * workflow/components/etl-catalog-grounding.ts. The AI assistant has a tight
 * execution budget, so the catalog cannot be sent in full. This module
 * exposes:
 *
 *  - REPORTING_CATALOG / CHART_BY_ID / TEMPLATE_BY_ID — typed access to
 *    reporting-catalog.json
 *  - buildReportingPromptSection() — terse one-line-per-chart index for the
 *    AI prompt
 *  - pickChartType()              — deterministic measure/dimension → chart
 *    heuristic; the offline fallback when nlToChart is unreachable
 *  - validateChartConfig()        — checks a proposed chart against the
 *    catalog's `requires` bounds before a widget is committed
 *
 * reporting-catalog.json is the single source of truth for what counts as a
 * "real" chart type and which dashboard templates exist.
 */
import catalogRaw from './reporting-catalog.json';

export type ChartCategory =
  | 'comparison'
  | 'trend'
  | 'distribution'
  | 'composition'
  | 'relationship'
  | 'kpi';

export interface ChartRequires {
  /** [min, max] number of value (measure) columns. */
  measures: [number, number];
  /** [min, max] number of category / axis (dimension) columns. */
  dimensions: [number, number];
}

export interface ChartTypeDef {
  id: string;
  label: string;
  description: string;
  category: ChartCategory;
  best_for: string;
  requires: ChartRequires;
  compatible_aggregations: string[];
}

export interface TemplateWidgetDef {
  chart_type?: string;
  widget_type: 'chart' | 'table';
  title: string;
  description?: string;
  measures?: string[];
  dimension?: string | null;
  aggregator?: string;
  row_limit?: number;
  position: { x: number; y: number; w: number; h: number };
}

export interface DashboardTemplateDef {
  id: string;
  label: string;
  description: string;
  category: string;
  color: string;
  icon: string;
  data_source?: { database: string; schema: string; table: string };
  widgets: TemplateWidgetDef[];
}

export interface ReportingSampleWidget {
  chart_type: string;
  title: string;
  measures: string[];
  dimension: string | null;
  aggregator: string;
}

export interface ReportingSample {
  title: string;
  description: string;
  widgets: ReportingSampleWidget[];
}

interface CatalogShape {
  version: string;
  purpose: string;
  categories: Record<string, string>;
  chart_types: ChartTypeDef[];
  dashboard_templates: DashboardTemplateDef[];
  samples: ReportingSample[];
}

export const REPORTING_CATALOG = catalogRaw as unknown as CatalogShape;

export const CHART_TYPES: ChartTypeDef[] = REPORTING_CATALOG.chart_types;
export const CHART_TYPE_IDS: string[] = CHART_TYPES.map((c) => c.id);
export const CHART_BY_ID = new Map<string, ChartTypeDef>(
  CHART_TYPES.map((c) => [c.id, c]),
);

export const DASHBOARD_TEMPLATES: DashboardTemplateDef[] =
  REPORTING_CATALOG.dashboard_templates;
export const TEMPLATE_BY_ID = new Map<string, DashboardTemplateDef>(
  DASHBOARD_TEMPLATES.map((t) => [t.id, t]),
);

export const CHART_CATEGORIES: Record<string, string> = REPORTING_CATALOG.categories;
export const REPORTING_SAMPLES: ReportingSample[] = REPORTING_CATALOG.samples;

/**
 * Build the catalog section injected into the AI prompt — one terse line
 * per chart type so the whole index fits a small token budget:
 *   id (category): best_for | measures m..M, dimensions d..D
 */
export function buildReportingPromptSection(): string {
  const charts = CHART_TYPES.map((c) => {
    const m = `${c.requires.measures[0]}..${c.requires.measures[1]}`;
    const d = `${c.requires.dimensions[0]}..${c.requires.dimensions[1]}`;
    return `- ${c.id} (${c.category}): ${c.best_for} | measures ${m}, dimensions ${d}`;
  }).join('\n');
  return [
    'Valid chart types (use the `id` verbatim — never invent a type):',
    charts,
  ].join('\n');
}

// ───────────────────────────────────────────────────────────────────────
// Deterministic chart picker — the offline fallback for the AI wizard.
// Given the measure and dimension columns a user picked from a table,
// choose the most appropriate real chart type. Runs without the LLM.
// ───────────────────────────────────────────────────────────────────────

const TIME_HINT_RE =
  /(date|time|day|week|month|quarter|year|_dt$|_ts$|created|updated|period)/i;

/** True when a column name looks like a time / ordered axis. */
export function looksLikeTimeColumn(name: string): boolean {
  return TIME_HINT_RE.test(name || '');
}

export interface ChartPick {
  /** A chart id guaranteed to be in CHART_TYPE_IDS. */
  chartId: string;
  /** Short, human-readable reason for the choice (for the UI). */
  reason: string;
}

/**
 * Deterministic measure/dimension → chart-type heuristic.
 *
 *   1 measure  + 1 time dimension     → line   (trend)
 *   1 measure  + 1 category dimension → bar    (comparison)
 *   1 measure  + 0 dimensions         → gauge  (single KPI value)
 *   2 measures + 0..1 dimensions      → scatter(relationship)
 *   3 measures + 0..1 dimensions      → bubble (relationship + size)
 *   4+ measures + 1 dimension         → radar  (multi-measure compare)
 *   parts-of-whole hint               → pie    (composition)
 *
 * Always returns a chart id that exists in the catalog.
 */
export function pickChartType(
  measures: string[],
  dimensions: string[],
): ChartPick {
  const m = measures.filter(Boolean);
  const d = dimensions.filter(Boolean);
  const mCount = m.length;
  const dCount = d.length;

  // No measures at all — fall back to a bar of row counts.
  if (mCount === 0) {
    return { chartId: 'bar', reason: 'No measure picked — defaulting to a bar of counts.' };
  }

  // Single measure, no dimension → headline KPI gauge.
  if (mCount === 1 && dCount === 0) {
    return { chartId: 'gauge', reason: 'One measure, no breakdown — a single KPI value.' };
  }

  // Two measures → correlation.
  if (mCount === 2 && dCount <= 1) {
    return { chartId: 'scatter', reason: 'Two measures — a scatter shows their relationship.' };
  }

  // Three measures → correlation with size encoding.
  if (mCount === 3 && dCount <= 1) {
    return { chartId: 'bubble', reason: 'Three measures — a bubble chart encodes the third as size.' };
  }

  // Many measures over one category → radar profile.
  if (mCount >= 4 && dCount === 1) {
    return { chartId: 'radar', reason: 'Several measures per category — a radar profile compares them.' };
  }

  // Composition hint: a single measure that names a share / percentage,
  // or a dimension that names a category split with few expected values.
  const partsOfWhole = m.some((c) => /share|percent|ratio|mix|pct/i.test(c));

  // One measure with a dimension.
  if (mCount === 1 && dCount >= 1) {
    if (looksLikeTimeColumn(d[0])) {
      return { chartId: 'line', reason: 'One measure over a time dimension — a trend line.' };
    }
    if (partsOfWhole) {
      return { chartId: 'pie', reason: 'A share/ratio measure across categories — a pie shows composition.' };
    }
    return { chartId: 'bar', reason: 'One measure across categories — a bar compares them.' };
  }

  // 2+ measures with a dimension → stacked bar (composition) or combo.
  if (mCount >= 2 && dCount >= 1) {
    if (looksLikeTimeColumn(d[0])) {
      return { chartId: 'stacked_area', reason: 'Multiple measures over time — a stacked area shows composition.' };
    }
    return { chartId: 'stacked_bar', reason: 'Multiple measures across categories — a stacked bar shows composition.' };
  }

  return { chartId: 'bar', reason: 'Defaulting to a bar chart.' };
}

// ───────────────────────────────────────────────────────────────────────
// Validation — the "no invalid chart config ever reaches the backend" gate.
// ───────────────────────────────────────────────────────────────────────

export interface ProposedChartConfig {
  /** Measure (value) columns the chart will plot. */
  measures?: string[];
  /** Dimension (category / axis) columns the chart will group by. */
  dimensions?: string[];
  /** Optional aggregator applied to the measures. */
  aggregator?: string;
}

export interface ChartConfigValidation {
  ok: boolean;
  /** Human-readable problems, empty when ok. */
  errors: string[];
  /** Non-blocking advisories (e.g. aggregator not in compatible list). */
  warnings: string[];
}

/**
 * Validate a proposed chart against the catalog. Checks the chart id is
 * real and the measure/dimension counts fall inside the chart's `requires`
 * bounds. ok === true means the config is safe to turn into a widget.
 */
export function validateChartConfig(
  chartId: string,
  config: ProposedChartConfig,
): ChartConfigValidation {
  const def = CHART_BY_ID.get(chartId);
  if (!def) {
    return {
      ok: false,
      errors: [`Unknown chart type "${chartId}"`],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const measureCount = (config.measures ?? []).filter(Boolean).length;
  const dimensionCount = (config.dimensions ?? []).filter(Boolean).length;

  const [mMin, mMax] = def.requires.measures;
  const [dMin, dMax] = def.requires.dimensions;

  if (measureCount < mMin) {
    errors.push(
      `${def.label} needs at least ${mMin} measure${mMin === 1 ? '' : 's'} (got ${measureCount}).`,
    );
  }
  if (measureCount > mMax) {
    errors.push(
      `${def.label} accepts at most ${mMax} measure${mMax === 1 ? '' : 's'} (got ${measureCount}).`,
    );
  }
  if (dimensionCount < dMin) {
    errors.push(
      `${def.label} needs at least ${dMin} dimension${dMin === 1 ? '' : 's'} (got ${dimensionCount}).`,
    );
  }
  if (dimensionCount > dMax) {
    errors.push(
      `${def.label} accepts at most ${dMax} dimension${dMax === 1 ? '' : 's'} (got ${dimensionCount}).`,
    );
  }

  if (
    config.aggregator &&
    def.compatible_aggregations.length > 0 &&
    !def.compatible_aggregations.includes(config.aggregator.toUpperCase())
  ) {
    warnings.push(
      `Aggregator "${config.aggregator}" is unusual for a ${def.label} — expected one of ${def.compatible_aggregations.join(', ')}.`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Coerce an arbitrary chart-type string (possibly from the AI) into a real
 * catalog id. Returns `fallback` (default 'bar') when the string is unknown.
 */
export function normalizeChartId(raw: unknown, fallback = 'bar'): string {
  if (typeof raw !== 'string') return fallback;
  const id = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return CHART_BY_ID.has(id) ? id : fallback;
}
