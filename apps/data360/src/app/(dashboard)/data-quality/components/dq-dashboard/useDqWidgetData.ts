'use client';

/**
 * useDqWidgetData — Fork A DQ data adapter (Phase 1).
 *
 * Bridges the existing `API.dataQuality.*` metric endpoints to the BI grid's
 * render contract (`widgetResults: Record<widget_id, { data: Row[] }>`), WITHOUT
 * importing the BI execute hook or BI config modals (those are warehouse-table
 * pickers — wrong for DQ metric endpoints).
 *
 * Given the seeded DQ widget descriptors, this hook:
 *   1. de-dupes the distinct `source` endpoints (the 4 KPI tiles all share
 *      `qualitySummary`, so it is fetched once),
 *   2. calls each via the shared `apiClient` (no raw axios/fetch),
 *   3. unwraps the response the same way the classic page does
 *      (`data?.rows || data?.results || data?.metrics || data?.data || data`),
 *   4. shapes per-widget rows:
 *        - kpi  → `[{ [title]: <selected field value> }]`, honest `null` (never 0),
 *        - table→ the raw metric rows (DataTable renders all columns),
 *   and returns `{ widgetResults, widgetErrors, loading, reload }`.
 *
 * No `database` param is injected — the classic page omits it and lets the
 * backend default it; we mirror that observed behaviour rather than guess a
 * default we cannot verify from the FE.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toMessage } from '@/lib/error-messages';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export type DqWidgetKind = 'kpi' | 'table';

/** Sources this adapter knows how to fetch (subset of API.dataQuality.*). */
export type DqSource =
  | 'qualitySummary'
  | 'completenessMetrics'
  | 'uniquenessMetrics'
  | 'freshnessMetrics'
  | 'ingestionMetrics'
  | 'schemaQuality'
  | 'classificationCoverage'
  | 'costMetrics'
  | 'securityPosture'
  | 'dmfResults';

export interface DqWidgetDescriptor {
  /** Stable widget id (used as the react-grid-layout key + result key). */
  id: string;
  kind: DqWidgetKind;
  /** Which API.dataQuality.* endpoint feeds this widget. */
  source: DqSource;
  /** Display title. */
  title: string;
  /**
   * For kpi widgets: the field to read off the (object) summary response.
   * Ignored for table widgets.
   */
  field?: string;
  /** Optional suffix rendered after a kpi value (e.g. '%'). */
  unit?: string;
  /** Layout (24-col grid, rowHeight=50) — mirrors DashboardWidget.position_*. */
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

interface WidgetDataResult {
  data: Record<string, unknown>[];
  query?: string;
}

interface UseDqWidgetDataReturn {
  widgetResults: Record<string, WidgetDataResult>;
  widgetErrors: Record<string, string>;
  loading: boolean;
  reload: (force?: boolean) => void;
}

/** Map a DqSource to its API.dataQuality.* path factory. */
const DQ_SOURCE_PATH: Record<DqSource, () => string> = {
  qualitySummary: API.dataQuality.qualitySummary,
  completenessMetrics: API.dataQuality.completenessMetrics,
  uniquenessMetrics: API.dataQuality.uniquenessMetrics,
  freshnessMetrics: API.dataQuality.freshnessMetrics,
  ingestionMetrics: API.dataQuality.ingestionMetrics,
  schemaQuality: API.dataQuality.schemaQuality,
  classificationCoverage: API.dataQuality.classificationCoverage,
  costMetrics: API.dataQuality.costMetrics,
  securityPosture: API.dataQuality.securityPosture,
  dmfResults: API.dataQuality.dmfResults,
};

/** Paginated sources accept offset/limit; bound the pull, DataTable pages client-side. */
const PAGINATED_SOURCES = new Set<DqSource>([
  'completenessMetrics',
  'uniquenessMetrics',
  'freshnessMetrics',
  'schemaQuality',
  'costMetrics',
  'securityPosture',
]);

const TABLE_FETCH_LIMIT = 100;

/** The page's comprehensive unwrap — keeps DQ-canvas data parity with the classic tabs. */
function unwrapRows(data: any): Record<string, unknown>[] {
  const rows = data?.rows || data?.results || data?.metrics || data?.data || data || [];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Unwrap an object-shaped summary payload (qualitySummary returns one object). */
function unwrapObject(data: any): Record<string, unknown> | null {
  const obj = data?.data ?? data;
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
}

export function useDqWidgetData(descriptors: DqWidgetDescriptor[]): UseDqWidgetDataReturn {
  const [widgetResults, setWidgetResults] = useState<Record<string, WidgetDataResult>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Distinct sources to fetch (KPI tiles collapse onto one qualitySummary call).
  const sources = useMemo(() => {
    const set = new Set<DqSource>();
    descriptors.forEach((d) => set.add(d.source));
    return Array.from(set);
  }, [descriptors]);

  // Keep a stable ref to descriptors so the fetch callback isn't a new identity
  // every render but still reads the latest shape.
  const descriptorsRef = useRef(descriptors);
  descriptorsRef.current = descriptors;

  const fetchAll = useCallback(
    async (force = false) => {
      setLoading(true);
      const headers: Record<string, string> = force ? { 'Cache-Control': 'no-cache' } : {};

      // 1) Fetch every distinct source once.
      const sourceData: Partial<Record<DqSource, any>> = {};
      const sourceErr: Partial<Record<DqSource, string>> = {};

      await Promise.all(
        sources.map(async (source) => {
          const path = DQ_SOURCE_PATH[source]();
          const params: Record<string, number> = PAGINATED_SOURCES.has(source)
            ? { offset: 0, limit: TABLE_FETCH_LIMIT }
            : {};
          try {
            const res = await apiClient.get(path, {
              headers,
              params: Object.keys(params).length ? params : undefined,
            });
            sourceData[source] = res.data;
          } catch (err: any) {
            const msg = toMessage(err, 'Request failed');
            sourceErr[source] = msg;
          }
        })
      );

      // 2) Shape rows per descriptor.
      const nextResults: Record<string, WidgetDataResult> = {};
      const nextErrors: Record<string, string> = {};

      for (const d of descriptorsRef.current) {
        if (sourceErr[d.source]) {
          nextErrors[d.id] = sourceErr[d.source] as string;
          continue;
        }
        const raw = sourceData[d.source];

        if (d.kind === 'kpi') {
          const summary = unwrapObject(raw);
          // No-fake-0: missing summary or missing field → null (renders "—"),
          // never `?? 0`.
          const value =
            summary && d.field && summary[d.field] != null ? summary[d.field] : null;
          const display =
            value != null && d.unit ? `${value}${d.unit}` : value;
          nextResults[d.id] = { data: [{ [d.title]: display }] };
        } else {
          // table
          nextResults[d.id] = { data: unwrapRows(raw) };
        }
      }

      setWidgetResults(nextResults);
      setWidgetErrors(nextErrors);
      setLoading(false);
    },
    [sources]
  );

  useEffect(() => {
    fetchAll(false);
  }, [fetchAll]);

  return { widgetResults, widgetErrors, loading, reload: fetchAll };
}
