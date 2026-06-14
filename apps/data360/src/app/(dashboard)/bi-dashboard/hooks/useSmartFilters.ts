'use client';

/**
 * useSmartFilters — auto-detect filterable columns from the page's real tables.
 *
 * Replaces the two dead filter bars (the manual `FilterBar` whose dashboard-level
 * filters never reached `buildRequest`, and `TimeIntelligenceBar` whose
 * `buildTimeFilters` hard-returned []). This hook reads the ACTUAL columns of the
 * tables charted on the current page (via `/common/get_table_columns`), classifies
 * them as date / categorical / metric, and surfaces date + dimension columns as
 * filter candidates. The selected values are injected into each widget's per-widget
 * `filters` array — the path that is proven to round-trip into SQL (row_count drops).
 *
 * Never throws: a table whose introspection fails is skipped; if introspection
 * yields nothing, we fall back to the dimensions named in the widgets' chart_config
 * (x / groupBy), so a page always degrades to *something* usable, never an error.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { fetchChartData } from '@/app/services/charts/fetchChartData';
import type { DashboardWidget } from '@/app/services/api/types';

/** A filter the user has actually applied, ready to inject into a render payload. */
export interface AppliedFilter {
  column: string;
  /** Whitelisted backend op: '=', 'IN', '>=', '<=', 'LIKE'. */
  operator: string;
  value: string | number | Array<string | number>;
  /** Fully-qualified tables ("DB.SCHEMA.TABLE") this filter applies to. */
  tables: string[];
}

export type FilterKind = 'date' | 'category';

export interface FilterCandidate {
  column: string;
  kind: FilterKind;
  dataType: string;
  /** FQTNs that contain this column. */
  tables: string[];
  /** True when the column is actually used as an axis/groupBy on the page. */
  charted: boolean;
}

interface TableRef {
  fqtn: string;
  database: string;
  schema: string;
  table: string;
}

interface RawColumn {
  name: string;
  data_type?: string;
  isPk?: string;
  isUnique?: string;
}

const DATE_TYPE = /\b(DATE|TIMESTAMP|DATETIME)\b/i;
const STRING_TYPE = /\b(VARCHAR|CHAR|TEXT|STRING)\b/i;
const FLOATY_TYPE = /\b(FLOAT|DOUBLE|REAL|DECIMAL|NUMERIC)\b/i;
// Numeric columns whose NAME marks them as a dimension worth filtering on.
const DIMENSIONAL_NAME =
  /(^|_)(ID|CODE|KEY|TYPE|STATUS|REGION|CATEGORY|SEGMENT|CHANNEL|GENDER|CITY|COUNTRY|STATE|BRAND|STORE|CLIENT|SUBSIDIARY|PRODUCT|ITEM|MONTH|YEAR|QUARTER|NAME)($|_)/i;
const MAX_CANDIDATES = 6;

function fqtnOf(w: DashboardWidget): TableRef | null {
  const c = w.chart_config;
  if (!c?.database || !c?.schema || !c?.table) return null;
  return {
    fqtn: `${c.database}.${c.schema}.${c.table}`,
    database: c.database,
    schema: c.schema,
    table: c.table,
  };
}

/**
 * Detect filter candidates for the given widgets. Returns the curated candidate
 * list plus a lazy distinct-value fetcher for categorical chips.
 */
export function useSmartFilters(widgets: DashboardWidget[]) {
  const [candidates, setCandidates] = useState<FilterCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const distinctCache = useRef<Map<string, string[]>>(new Map());

  // Stable identity for the tables + dimensions on this page.
  const tables = useMemo<TableRef[]>(() => {
    const seen = new Map<string, TableRef>();
    for (const w of widgets) {
      const ref = fqtnOf(w);
      if (ref && !seen.has(ref.fqtn)) seen.set(ref.fqtn, ref);
    }
    return [...seen.values()];
  }, [widgets]);

  const tableKey = useMemo(() => tables.map((t) => t.fqtn).sort().join('|'), [tables]);

  // Columns that are metrics (a measure somewhere) vs. dimensions (x / groupBy).
  const { measureCols, dimensionCols } = useMemo(() => {
    const m = new Set<string>();
    const d = new Set<string>();
    for (const w of widgets) {
      const c = w.chart_config;
      if (!c) continue;
      for (const meas of c.measures || []) if (meas?.column) m.add(meas.column.toUpperCase());
      if (c.x) d.add(c.x.toUpperCase());
      for (const g of c.groupBy || []) d.add(g.toUpperCase());
    }
    return { measureCols: m, dimensionCols: d };
  }, [widgets]);

  useEffect(() => {
    let cancelled = false;
    if (tables.length === 0) {
      setCandidates([]);
      return;
    }
    setLoading(true);

    (async () => {
      // Introspect each table; a failure skips that table (never errors out).
      const perTable = await Promise.allSettled(
        tables.map(async (t) => {
          const url = API.common.tableColumns(t.database, t.schema, t.table);
          const { data } = await apiClient.get<{ columns?: RawColumn[] }>(url);
          return { ref: t, columns: data?.columns ?? [] };
        }),
      );

      // Aggregate column → candidate, unioning tables that contain it.
      const byCol = new Map<string, FilterCandidate>();
      for (const r of perTable) {
        if (r.status !== 'fulfilled') continue;
        const { ref, columns } = r.value;
        for (const col of columns) {
          const name = col.name;
          if (!name) continue;
          const upper = name.toUpperCase();
          const type = (col.data_type || '').toUpperCase();
          const charted = dimensionCols.has(upper);

          let kind: FilterKind | null = null;
          if (DATE_TYPE.test(type)) {
            kind = 'date';
          } else if (STRING_TYPE.test(type)) {
            kind = 'category';
          } else if (charted || DIMENSIONAL_NAME.test(name)) {
            // Numeric dimension (e.g. STORE_ID used as an axis) — keep it, but
            // skip if it's a pure continuous metric (a measure and floaty type).
            if (!(measureCols.has(upper) && FLOATY_TYPE.test(type) && !charted)) {
              kind = 'category';
            }
          }
          if (!kind) continue;

          const existing = byCol.get(upper);
          if (existing) {
            if (!existing.tables.includes(ref.fqtn)) existing.tables.push(ref.fqtn);
            existing.charted = existing.charted || charted;
          } else {
            byCol.set(upper, { column: name, kind, dataType: type, tables: [ref.fqtn], charted });
          }
        }
      }

      let list = [...byCol.values()];

      // Fallback: if introspection produced nothing, use the charted dimensions.
      if (list.length === 0 && dimensionCols.size > 0) {
        const fqtns = tables.map((t) => t.fqtn);
        for (const w of widgets) {
          const c = w.chart_config;
          if (!c) continue;
          const ref = fqtnOf(w);
          if (!ref) continue;
          const dims = [c.x, ...(c.groupBy || [])].filter(Boolean) as string[];
          for (const dim of dims) {
            const upper = dim.toUpperCase();
            const isDate = /DATE|TIME|MONTH|YEAR|QUARTER|DAY/i.test(dim);
            const existing = byCol.get(upper);
            if (existing) {
              if (!existing.tables.includes(ref.fqtn)) existing.tables.push(ref.fqtn);
            } else {
              byCol.set(upper, {
                column: dim,
                kind: isDate ? 'date' : 'category',
                dataType: '',
                tables: [ref.fqtn],
                charted: true,
              });
            }
          }
        }
        list = [...byCol.values()];
        void fqtns;
      }

      // Rank: dates first, then charted dimensions, then the rest. Cap to keep
      // the bar from sprawling.
      list.sort((a, b) => {
        const score = (c: FilterCandidate) => (c.kind === 'date' ? 2 : 0) + (c.charted ? 1 : 0);
        return score(b) - score(a) || a.column.localeCompare(b.column);
      });

      if (!cancelled) {
        setCandidates(list.slice(0, MAX_CANDIDATES));
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setCandidates([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, measureCols, dimensionCols]);

  /**
   * Lazily fetch distinct values for a categorical column. Returns [] on any
   * failure so the chip degrades to a free-text input instead of erroring.
   */
  const fetchDistinct = useCallback(async (candidate: FilterCandidate): Promise<string[]> => {
    const cacheKey = candidate.column.toUpperCase();
    const cached = distinctCache.current.get(cacheKey);
    if (cached) return cached;

    const ref = tables.find((t) => candidate.tables.includes(t.fqtn));
    if (!ref) return [];
    try {
      const res = await fetchChartData({
        database: ref.database,
        schema: ref.schema,
        table: ref.table,
        x: candidate.column,
        measures: [],
        groupBy: [candidate.column],
        limit: 200,
      });
      const rows = res?.data ?? [];
      const key =
        Object.keys(rows[0] || {}).find((k) => k.toLowerCase() === candidate.column.toLowerCase()) ||
        candidate.column;
      const values = [
        ...new Set(
          rows
            .map((r) => r[key])
            .filter((v) => v != null && v !== '')
            .map((v) => String(v)),
        ),
      ].sort();
      distinctCache.current.set(cacheKey, values);
      return values;
    } catch {
      return [];
    }
  }, [tables]);

  return { candidates, loading, fetchDistinct };
}
