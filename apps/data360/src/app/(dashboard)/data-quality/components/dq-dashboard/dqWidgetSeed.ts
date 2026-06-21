/**
 * dqWidgetSeed — the default DQ canvas layout (Phase 1).
 *
 * Seeds draggable widgets that mirror exactly what the classic page already
 * shows:
 *   - the 4 KPI header tiles (health / tables / freshness violations / dmf pass),
 *     each reading a field off the shared `qualitySummary` response,
 *   - the 9 operational tabs as table widgets, each pulling from its existing
 *     `API.dataQuality.*` endpoint via `useDqWidgetData`.
 *
 * Layout uses the same 24-col / rowHeight=50 grid as the BI dashboard.
 *
 * Versioning: the persisted layout atom keys off DQ_LAYOUT_VERSION. Bump it
 * whenever this seed changes shape so a stored (older) layout doesn't shadow
 * newly-added widgets.
 */

import type { DqWidgetDescriptor } from './useDqWidgetData';

export const DQ_LAYOUT_VERSION = 1;

export const DQ_SEED_WIDGETS: DqWidgetDescriptor[] = [
  // ── KPI tiles (all share one qualitySummary fetch) ──
  {
    id: 'kpi-health',
    kind: 'kpi',
    source: 'qualitySummary',
    field: 'health_score',
    unit: '%',
    title: 'Health Score',
    position_x: 0,
    position_y: 0,
    width: 6,
    height: 2,
  },
  {
    id: 'kpi-tables',
    kind: 'kpi',
    source: 'qualitySummary',
    field: 'total_tables',
    title: 'Tables',
    position_x: 6,
    position_y: 0,
    width: 6,
    height: 2,
  },
  {
    id: 'kpi-violations',
    kind: 'kpi',
    source: 'qualitySummary',
    field: 'freshness_violations',
    title: 'Freshness Violations',
    position_x: 12,
    position_y: 0,
    width: 6,
    height: 2,
  },
  {
    id: 'kpi-dmf-pass',
    kind: 'kpi',
    source: 'qualitySummary',
    field: 'dmf_pass_rate',
    unit: '%',
    title: 'DMF Pass Rate',
    position_x: 18,
    position_y: 0,
    width: 6,
    height: 2,
  },

  // ── Operational tabs as draggable table widgets ──
  {
    id: 'tab-completeness',
    kind: 'table',
    source: 'completenessMetrics',
    title: 'Completeness',
    position_x: 0,
    position_y: 2,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-uniqueness',
    kind: 'table',
    source: 'uniquenessMetrics',
    title: 'Uniqueness',
    position_x: 12,
    position_y: 2,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-freshness',
    kind: 'table',
    source: 'freshnessMetrics',
    title: 'Freshness',
    position_x: 0,
    position_y: 9,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-ingestion',
    kind: 'table',
    source: 'ingestionMetrics',
    title: 'Ingestion',
    position_x: 12,
    position_y: 9,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-schema',
    kind: 'table',
    source: 'schemaQuality',
    title: 'Schema',
    position_x: 0,
    position_y: 16,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-classification',
    kind: 'table',
    source: 'classificationCoverage',
    title: 'Classification',
    position_x: 12,
    position_y: 16,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-cost',
    kind: 'table',
    source: 'costMetrics',
    title: 'Storage',
    position_x: 0,
    position_y: 23,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-security',
    kind: 'table',
    source: 'securityPosture',
    title: 'Security',
    position_x: 12,
    position_y: 23,
    width: 12,
    height: 7,
  },
  {
    id: 'tab-dmf',
    kind: 'table',
    source: 'dmfResults',
    title: 'DMF Results',
    position_x: 0,
    position_y: 30,
    width: 24,
    height: 7,
  },
];
