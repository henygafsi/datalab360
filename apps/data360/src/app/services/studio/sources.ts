/**
 * sources.ts — Studio Sources step reads (probed live 2026-09-06).
 *
 * Existing connections come from the real /connect surface the Connect Data
 * page already uses (stages + registered connector families); the "connect
 * something new" catalog is GET /connect/catalog (24 type-keyed blueprint
 * entries). Nothing here mutates anything.
 */

import apiClient from '@/lib/api-client';
import { dedupGet } from '@/app/services/request-dedup';

/* ── Existing connections (stages) ─────────────────────────────────── */

export interface StageConnection {
  name: string;
  database_name: string;
  schema_name: string;
  type?: string;
  connector_type?: string;
  is_external?: boolean;
  fully_qualified_name?: string;
  comment?: string | null;
  age_hours?: number | null;
  freshness_status?: string; // 'fresh' | 'stale' | …
}

export async function getMyConnections(): Promise<StageConnection[]> {
  return dedupGet('studio:connections', 60_000, async () => {
    const { data } = await apiClient.get<{ data?: StageConnection[] }>(
      '/connect/stages',
    );
    return Array.isArray(data?.data) ? data.data : [];
  });
}

/* ── Registered connector families (live capabilities) ────────────── */

export interface ConnectorFamily {
  id: string;
  name: string;
  capabilities?: string[];
  has_stages?: boolean;
  direction?: string; // 'inbound' | 'outbound' | 'both'
  category?: string;
}

export async function getConnectorFamilies(): Promise<ConnectorFamily[]> {
  return dedupGet('studio:connector-families', 300_000, async () => {
    const { data } = await apiClient.get<{ connectors?: ConnectorFamily[] }>(
      '/connect/connectors',
    );
    return Array.isArray(data?.connectors) ? data.connectors : [];
  });
}

/* ── Source tables (per database, for the Understanding picks) ─────── */

export interface SourceTable {
  schema: string;
  table_name: string;
  table_type?: string;
  row_count?: number | null;
  size_bytes?: number | null;
  domain?: string | null;
  source_system?: string | null;
  ingestion_type?: string | null;
  freshness_hours?: number | null;
  layer?: string | null;
}

export interface SourceCatalog {
  database: string;
  tables: SourceTable[];
}

export async function getSourceCatalog(): Promise<SourceCatalog> {
  return dedupGet('studio:source-catalog', 120_000, async () => {
    const { data } = await apiClient.get<SourceCatalog>('/connect/source-catalog');
    return {
      database: data?.database ?? '',
      tables: Array.isArray(data?.tables) ? data.tables : [],
    };
  });
}
