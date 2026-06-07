/**
 * catalog/rightbar.ts — Service layer pour le SmartRightBar (catalog module).
 *
 * Fonctions appelées par les Section* components du SmartRightBar.
 * Chaque fonction est gracieuse : une 404 (backend-gap, endpoint pas encore
 * déployé) retourne null / [] sans faire crasher le panel.
 *
 * Pattern : safeGet<T> wraps l'appel apiClient et swallow les 404.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ---------------------------------------------------------------------------
// Interfaces — typage des réponses backend SmartRightBar
// ---------------------------------------------------------------------------

export interface Tag {
  tag_name: string;
  tag_value: string;
  column_name?: string | null;
}

/** Section 1 — CONTEXT */
export interface TableContext {
  name: string;
  type: string;
  row_count: number | null;
  size_gb: number | null;
  cluster_key: string | null;
  owner: string | null;
  created_at: string | null;
  last_altered: string | null;
  database: string;
  schema: string;
  tags: Tag[];
}

/** Section 3 — GOUVERNANCE */
export interface PiiColumn {
  column_name: string;
  tag_name: string;
  tag_value: string;
  masking_policy: string | null;
  masking_status: 'OK' | 'PARTIAL' | 'NONE';
}

export interface RlsPolicy {
  policy_name: string;
  axis: string;
  segments: string[];
}

export interface TableGovernance {
  gov_rate: number;
  pii_columns: PiiColumn[];
  rls_policies: RlsPolicy[];
  sensitive_columns: Array<{ column_name: string; tag_name: string; rls_policy?: string }>;
}

/** Section 4 — LIGNÉE */
export interface LineageNode {
  name: string;
  type: string;
  domain?: string;
  relationship?: string;
}

export interface TableLineage {
  upstream: LineageNode[];
  downstream: LineageNode[];
  impact_count: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
}

/** Section 5 — INGESTION */
export interface TableIngestion {
  mode: string | null;
  last_run: string | null;
  next_run: string | null;
  avg_cost_credits: number | null;
  avg_rows: number | null;
  pipeline_step: number | null;
  pipeline_name: string | null;
  status: string | null;
}

/** Section 6 — OWNERSHIP */
export interface Consumer {
  user_name: string;
  query_type: string;
  access_count: number;
  last_access: string | null;
}

export interface TableOwnership {
  owner_email: string | null;
  owner_team: string | null;
  snowflake_role: string | null;
  data_class: 'SOURCE' | 'INTERMEDIATE' | 'PRODUCT' | 'DERIVED' | 'SHARED' | null;
  pipeline_step: number | null;
  pipeline_name: string | null;
  consumers: Consumer[];
}

/** Section 8 — HISTORIQUE */
export interface HistoryEvent {
  ts: string;
  kind: string;
  actor: string;
  status: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helper — safeGet : swallow 404 (backend-gap) gracieusement
// ---------------------------------------------------------------------------

async function safeGet<T>(url: string): Promise<T | null> {
  try {
    const { data } = await apiClient.get<T>(url);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 501) {
      // backend-gap: endpoint pas encore déployé → dégradation silencieuse
      return null;
    }
    console.warn('[catalog/rightbar] safeGet failed:', url, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fonctions exportées — une par section SmartRightBar
// ---------------------------------------------------------------------------

/**
 * Section 1 — CONTEXT
 * GET /catalog/tables/{db}/{schema}/{table}/context
 * backend-gap: retourne null si 404
 */
export async function getTableContext(
  db: string,
  schema: string,
  table: string,
): Promise<TableContext | null> {
  return safeGet<TableContext>(API.catalog.tableContext(db, schema, table));
}

/**
 * Section 3 — GOUVERNANCE
 * GET /catalog/tables/{db}/{schema}/{table}/governance
 * backend-gap: retourne null si 404
 */
export async function getTableGovernance(
  db: string,
  schema: string,
  table: string,
): Promise<TableGovernance | null> {
  return safeGet<TableGovernance>(API.catalog.tableGovernance(db, schema, table));
}

/**
 * Section 4 — LIGNÉE
 * GET /catalog/tables/{db}/{schema}/{table}/lineage
 * backend-gap: retourne null si 404
 */
export async function getTableLineage(
  db: string,
  schema: string,
  table: string,
): Promise<TableLineage | null> {
  return safeGet<TableLineage>(API.catalog.tableLineage(db, schema, table));
}

/**
 * Section 5 — INGESTION
 * GET /catalog/tables/{db}/{schema}/{table}/ingestion
 * backend-gap: retourne null si 404
 */
export async function getTableIngestion(
  db: string,
  schema: string,
  table: string,
): Promise<TableIngestion | null> {
  return safeGet<TableIngestion>(API.catalog.tableIngestion(db, schema, table));
}

/**
 * Section 6 — OWNERSHIP
 * GET /catalog/tables/{db}/{schema}/{table}/ownership
 * backend-gap: retourne null si 404
 */
export async function getTableOwnership(
  db: string,
  schema: string,
  table: string,
): Promise<TableOwnership | null> {
  return safeGet<TableOwnership>(API.catalog.tableOwnership(db, schema, table));
}

/**
 * Section 8 — HISTORIQUE (5 derniers events)
 * Utilise GET /catalog/events?object_fqn=<db.schema.table>&limit=5
 * (endpoint live — pas de backend-gap)
 * Retourne [] en cas d'erreur pour ne pas bloquer le panel.
 */
export async function getTableHistory(
  db: string,
  schema: string,
  table: string,
  limit = 5,
): Promise<HistoryEvent[]> {
  try {
    const objectFqn = `${db}.${schema}.${table}`;
    const { data } = await apiClient.get<{ events?: HistoryEvent[]; items?: HistoryEvent[] }>(
      API.catalog.events(),
      { params: { object_fqn: objectFqn, limit } },
    );
    // backend may return { events: [...] } or { items: [...] }
    return data?.events ?? data?.items ?? [];
  } catch {
    return [];
  }
}
