/**
 * explore-design/ingestionTrace.ts — Snowpipe / COPY ingestion trace (surfacing).
 *
 * ONE bulk, account-global call to GET /data-quality/ingestion-metrics (COPY_HISTORY,
 * captures Snowpipe + manual COPY) → a Map keyed by `DB.SCHEMA.TABLE` (uppercase) so
 * the source-table list and the right-bar can look up per-table ingestion + cost
 * without any per-row fetch (no N+1).
 *
 * The endpoint already exists in api-contracts (API.dataQuality.ingestionMetrics) —
 * this service consumes its `rows` shape (account-global, no `database` param), which
 * is distinct from the legacy data-quality `getIngestionMetrics(database)` reader.
 *
 * Graceful by design: any failure → empty Map (fail-soft). PIPE_NAME / INGEST_METHOD
 * are NEW/optional backend fields — treated as possibly-absent.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

/** Raw COPY_HISTORY row as returned by /data-quality/ingestion-metrics. */
export interface IngestionRow {
  TABLE_NAME?: string | null;
  FILE_NAME?: string | null;
  STATUS?: string | null;
  ROW_COUNT?: number | null;
  ROW_PARSED?: number | null;
  ERROR_COUNT?: number | null;
  LAST_LOAD_TIME?: string | null;
  DATABASE_NAME?: string | null;
  SCHEMA_NAME?: string | null;
  /** NEW/optional — present once the backend surfaces pipe metadata. */
  PIPE_NAME?: string | null;
  /** NEW/optional — 'SNOWPIPE' | 'COPY'. */
  INGEST_METHOD?: string | null;
  IS_PARTIAL?: boolean | null;
}

/** Aggregated per-table ingestion trace (one entry per DB.SCHEMA.TABLE). */
export interface IngestionTraceEntry {
  /** Most-recent LAST_LOAD_TIME across this table's loads (ISO string), or null. */
  lastLoad: string | null;
  /** Sum of ROW_COUNT across the window, or null if no load reported a count. */
  rows7d: number | null;
  /** Number of load events seen for this table. */
  loads: number;
  /** Sum of ERROR_COUNT, or null if no load reported an error count. */
  errors: number | null;
  /** 'SNOWPIPE' if any row is pipe-driven, 'COPY' if any load at all, else null. */
  method: 'SNOWPIPE' | 'COPY' | null;
  /** True if any load was partial. */
  partial: boolean;
}

export type IngestionTraceMap = Map<string, IngestionTraceEntry>;

/** Build the uppercase `DB.SCHEMA.TABLE` key used by the trace map. */
export function ingestionKey(db?: string | null, schema?: string | null, table?: string | null): string {
  return [db, schema, table].map((p) => (p ?? '').toUpperCase()).join('.');
}

/** True if a row indicates Snowpipe (pipe name present, or method tagged SNOWPIPE). */
function isSnowpipeRow(row: IngestionRow): boolean {
  if ((row.PIPE_NAME ?? '').trim().length > 0) return true;
  return (row.INGEST_METHOD ?? '').toUpperCase() === 'SNOWPIPE';
}

/**
 * getIngestionTrace — ONE bulk call, aggregated client-side by table.
 * Returns an empty Map on any error (fail-soft — never blocks the caller).
 */
export async function getIngestionTrace(days = 7): Promise<IngestionTraceMap> {
  const map: IngestionTraceMap = new Map();
  try {
    const { data } = await apiClient.get(API.dataQuality.ingestionMetrics(), {
      params: { days },
    });
    const rows: IngestionRow[] = data?.rows ?? data?.data ?? [];
    if (!Array.isArray(rows)) return map;

    for (const row of rows) {
      const key = ingestionKey(row.DATABASE_NAME, row.SCHEMA_NAME, row.TABLE_NAME);
      // Skip rows that can't be keyed to a table (no table name).
      if (!row.TABLE_NAME) continue;

      const prev = map.get(key);
      const entry: IngestionTraceEntry = prev ?? {
        lastLoad: null,
        rows7d: null,
        loads: 0,
        errors: null,
        method: null,
        partial: false,
      };

      // Most-recent load time.
      if (row.LAST_LOAD_TIME) {
        if (!entry.lastLoad || new Date(row.LAST_LOAD_TIME) > new Date(entry.lastLoad)) {
          entry.lastLoad = row.LAST_LOAD_TIME;
        }
      }

      // Sum row count (only when present — keep null until a real number arrives).
      if (typeof row.ROW_COUNT === 'number') {
        entry.rows7d = (entry.rows7d ?? 0) + row.ROW_COUNT;
      }

      // Sum errors (only when present).
      if (typeof row.ERROR_COUNT === 'number') {
        entry.errors = (entry.errors ?? 0) + row.ERROR_COUNT;
      }

      entry.loads += 1;

      // Method precedence: SNOWPIPE wins if any row is pipe-driven; else COPY for any load.
      if (isSnowpipeRow(row)) {
        entry.method = 'SNOWPIPE';
      } else if (entry.method !== 'SNOWPIPE') {
        entry.method = 'COPY';
      }

      if (row.IS_PARTIAL) entry.partial = true;

      map.set(key, entry);
    }
  } catch {
    // fail-soft: empty map, never throws into the render path.
    return new Map();
  }
  return map;
}
