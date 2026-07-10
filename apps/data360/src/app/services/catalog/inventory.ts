// catalog/inventory.ts — schema-level table inventory + non-project data preview
// for the catalog node cockpit (right rail of the catalog canvas).
//
// Table list  → GET  /common/tables/{db}/{schema} (same service the
//               explore-design page uses — reused via services/mapping), then a
//               best-effort merge of ROW_COUNT/BYTES from
//               GET /observability/probes/schema (INFORMATION_SCHEMA.TABLES).
//               Counts are decoration: if the probe fails the names still render.
// Data preview → POST /explore-design/table/preview (non-project route in
//               lifecycle_router; body {database, schema_name, table, limit}) —
//               the project-scoped `tablePreview` requires a projectId the
//               catalog canvas does not have.

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { getTables } from '../mapping';

// ---------------------------------------------------------------------------
// Schema table inventory
// ---------------------------------------------------------------------------

export interface CatalogSchemaTable {
  name: string;
  /** null = probe did not report this table (counts are best-effort). */
  rowCount: number | null;
  bytes: number | null;
  tableType: string | null;
}

export interface CatalogSchemaTablesResult {
  /** false = the inventory endpoint itself is absent on this environment (404/501). */
  available: boolean;
  tables: CatalogSchemaTable[];
}

interface SchemaProbeEntry {
  table_name?: string;
  row_count?: number;
  bytes?: number;
  table_type?: string;
}

export async function listCatalogSchemaTables(
  database: string,
  schema: string,
): Promise<CatalogSchemaTablesResult> {
  let names: string[];
  try {
    names = await getTables(database, schema);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 501) {
      // backend-gap: endpoint absent on this environment → honest degrade
      return { available: false, tables: [] };
    }
    throw err;
  }

  // Best-effort ROW_COUNT/BYTES from the observability schema probe — a single
  // INFORMATION_SCHEMA scan. Never blocks the name list.
  const probe = new Map<string, SchemaProbeEntry>();
  try {
    const { data } = await apiClient.get<{ tables?: SchemaProbeEntry[] }>(
      API.observability.probesSchema(database, schema),
    );
    for (const t of data?.tables ?? []) {
      if (t?.table_name) probe.set(t.table_name.toUpperCase(), t);
    }
  } catch {
    // counts stay null — names alone are still a real inventory
  }

  return {
    available: true,
    tables: names.map((name) => {
      const p = probe.get(name.toUpperCase());
      return {
        name,
        rowCount: typeof p?.row_count === 'number' ? p.row_count : null,
        bytes: typeof p?.bytes === 'number' ? p.bytes : null,
        tableType: p?.table_type ?? null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Non-project table data preview
// ---------------------------------------------------------------------------

export interface CatalogTablePreview {
  database: string;
  schema: string;
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  limit: number;
}

/**
 * Preview real rows of any table the connected role can read — no project
 * required. POST /explore-design/table/preview (TableRefRequest:
 * {database, schema_name, table, limit}).
 */
export async function previewCatalogTable(
  database: string,
  schema: string,
  table: string,
  limit = 100,
): Promise<CatalogTablePreview> {
  const { data } = await apiClient.post<CatalogTablePreview>(
    '/explore-design/table/preview',
    { database, schema_name: schema, table, limit },
  );
  return data;
}
