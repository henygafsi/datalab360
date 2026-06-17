'use client';

import { useState, useEffect, useCallback, memo, type ReactNode } from 'react';
import { Badge, Loader } from 'rizzui';
import {
  Database, Table2, Columns3, ChevronRight,
  ArrowLeft, FolderOpen, FileCode, Eye,
  Layers, Box, ShieldAlert, AlertTriangle,
  Clock, Search, Lock, X, GitBranch,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { InsightActionButton } from '@/app/shared/insights';
import { dash, fmtNum } from '@/app/shared/ui/format';

// ---------------------------------------------------------------------------
// Data Catalog Object Explorer — backed by GET /api/snowflake/explorer/*.
// Local interfaces only (no edits to types.ts/hooks.ts). Every field below is
// returned by the backend services (databases.py / schemas.py / objects.py /
// summary.py / facets.py) — never read a field the backend does not return.
// ---------------------------------------------------------------------------
const PAGE_SIZE = 200; // backend caps page_size at 200; old lake calls returned everything.

type BrowseLevel = 'databases' | 'schemas' | 'objects';
type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type FreshnessStatus = 'fresh' | 'stale' | 'unknown';
// Subset matches rizzui Badge `color` (all six are used elsewhere in the app).
type BadgeColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'danger';

interface Pagination {
  page?: number;
  page_size?: number;
  total?: number;
}

interface ListEnvelope<T> {
  items?: T[];
  pagination?: Pagination;
}

interface DbInfo {
  database_id?: string;
  database_name: string;
  owner_role?: string | null;
  comment?: string | null;
  created_at?: string | null;
  last_altered_at?: string | null;
  schema_count?: number;
  object_count?: number;
  table_count?: number;
  view_count?: number;
  dynamic_table_count?: number;
  stage_count?: number;
  task_count?: number;
  sensitive_object_count?: number;
  objects_with_policies?: number;
  storage_bytes?: number | null;
  last_queried_at?: string | null;
  health_status?: HealthStatus;
  risk_level?: RiskLevel;
}

interface SchemaInfo {
  schema_id?: string;
  database_name?: string;
  schema_name: string;
  owner_role?: string | null;
  comment?: string | null;
  created_at?: string | null;
  last_altered_at?: string | null;
  object_count?: number;
  table_count?: number;
  view_count?: number;
  materialized_view_count?: number;
  dynamic_table_count?: number;
  stage_count?: number;
  stream_count?: number;
  task_count?: number;
  pipe_count?: number;
  policy_count?: number;
  tag_count?: number;
  sensitive_object_count?: number;
  objects_with_policies?: number;
  last_activity_at?: string | null;
  health_status?: HealthStatus;
  risk_level?: RiskLevel;
}

interface ObjectInfo {
  object_id?: string;
  database_name?: string;
  schema_name?: string;
  object_name: string;
  fully_qualified_name?: string;
  object_type?: string;
  object_family?: string | null;
  owner_role?: string | null;
  comment?: string | null;
  created_at?: string | null;
  last_altered_at?: string | null;
  last_ddl_by?: string | null;
  row_count?: number | null;
  storage_bytes?: number | null;
  retention_time_days?: number | null;
  is_transient?: boolean;
  is_temporary?: boolean;
  is_secure?: boolean;
  last_queried_at?: string | null;
  query_count_7d?: number;
  query_count_30d?: number;
  user_count_30d?: number;
  role_count_30d?: number;
  has_tags?: boolean;
  has_policies?: boolean;
  has_masking_policy?: boolean;
  has_row_access_policy?: boolean;
  has_lineage?: boolean;
  is_sensitive?: boolean;
  freshness_status?: FreshnessStatus;
  health_status?: HealthStatus;
  risk_level?: RiskLevel;
  lineage_count_in?: number;
  lineage_count_out?: number;
  recos_count?: number;
}

interface SummaryResponse {
  account_id?: string;
  last_sync_at?: string | null;
  databases?: number;
  schemas?: number;
  objects?: number;
  tables?: number;
  views?: number;
  materialized_views?: number;
  dynamic_tables?: number;
  external_tables?: number;
  iceberg_tables?: number;
  semantic_views?: number;
  stages?: number;
  file_formats?: number;
  streams?: number;
  tasks?: number;
  pipes?: number;
  functions?: number;
  procedures?: number;
  sensitive_objects?: number;
  objects_with_policies?: number;
  objects_without_owner_comment?: number;
  unused_objects_90d?: number;
  failed_pipeline_objects?: number;
  critical_risks?: number;
  risk_breakdown?: Record<string, number>;
}

interface FacetValue {
  value: string;
  count: number;
}

interface FacetsResponse {
  databases?: FacetValue[];
  schemas?: FacetValue[];
  object_types?: FacetValue[];
  object_families?: FacetValue[];
  owner_roles?: FacetValue[];
  health_statuses?: FacetValue[];
  risk_levels?: FacetValue[];
  freshness_statuses?: FacetValue[];
}

interface ObjectFilters {
  object_type?: string;
  health_status?: string;
  risk_level?: string;
  freshness_status?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Formatting + status → color/icon helpers.
// ---------------------------------------------------------------------------
function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function healthColor(h?: string): BadgeColor {
  switch (h) {
    case 'healthy': return 'success';
    case 'warning': return 'warning';
    case 'critical': return 'danger';
    default: return 'secondary';
  }
}

function riskColor(r?: string): BadgeColor {
  switch (r) {
    case 'critical':
    case 'high': return 'danger';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'secondary';
  }
}

function freshnessColor(f?: string): BadgeColor {
  switch (f) {
    case 'fresh': return 'success';
    case 'stale': return 'warning';
    default: return 'secondary';
  }
}

// Object-type colors/icons keyed off the canonical underscore enum (OBJECT_TYPES)
// returned on `object_type` — NOT the legacy SHOW-TABLES `kind` with spaces.
function typeColor(type?: string): BadgeColor {
  switch (type) {
    case 'VIEW':
    case 'MATERIALIZED_VIEW':
    case 'SEMANTIC_VIEW': return 'info';
    case 'EXTERNAL_TABLE':
    case 'ICEBERG_TABLE': return 'warning';
    default: return 'secondary';
  }
}

function objectIcon(type?: string): ReactNode {
  switch (type) {
    case 'VIEW':
    case 'MATERIALIZED_VIEW':
    case 'SEMANTIC_VIEW':
      return <Eye className="w-3.5 h-3.5 text-cyan-500 shrink-0" />;
    case 'EXTERNAL_TABLE':
    case 'ICEBERG_TABLE':
      return <Layers className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
    case 'DYNAMIC_TABLE':
      return <Box className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
    case 'STREAM':
    case 'TASK':
    case 'PIPE':
      return <FileCode className="w-3.5 h-3.5 text-fuchsia-500 shrink-0" />;
    case 'STAGE':
    case 'FILE_FORMAT':
      return <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case 'FUNCTION':
    case 'PROCEDURE':
      return <FileCode className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case 'SEQUENCE':
      return <Columns3 className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
    default:
      return <Table2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers.
// ---------------------------------------------------------------------------
function KpiCard({ icon, label, value, accent }: {
  icon: ReactNode;
  label: string;
  // Accepts a missing value — renders "—" for null/undefined/NaN (R3); a
  // genuine 0 still renders as 0. `string` also lets callers pass a pre-formatted
  // label, which passes through unchanged.
  value: number | string | null | undefined;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${accent}`}>
        {icon}
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-white leading-none">
        {typeof value === 'number' ? fmtNum(value) : dash(value)}
      </div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-1">{label}</div>
    </div>
  );
}

function FacetGroup({ label, items, activeValue, onToggle }: {
  label: string;
  items?: FacetValue[];
  activeValue?: string;
  onToggle: (value: string) => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold tracking-wide text-gray-400 dark:text-gray-500 uppercase">
        {label}
      </span>
      {items.map((it) => {
        const active = activeValue === it.value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onToggle(it.value)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              active
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-700'
            }`}
            aria-pressed={active}
          >
            <span className="truncate max-w-[140px]">{it.value}</span>
            <span className="opacity-60">{it.count.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}

function SnowflakeExplorerTab() {
  const router = useRouter();
  const [level, setLevel] = useState<BrowseLevel>('databases');
  const [databases, setDatabases] = useState<DbInfo[]>([]);
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global summary (account-level) — own state so it never blocks the grids.
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  // Facets + object-level filters (objects view only).
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [objectFilters, setObjectFilters] = useState<ObjectFilters>({});
  const [searchDraft, setSearchDraft] = useState('');

  // Pagination totals (lists cap at PAGE_SIZE — keep the counts honest).
  const [dbTotal, setDbTotal] = useState(0);
  const [schemaTotal, setSchemaTotal] = useState(0);
  const [objectTotal, setObjectTotal] = useState(0);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiClient.get<SummaryResponse>(API.snowflakeExplorer.summary());
      setSummary(res.data || null);
    } catch {
      setSummary(null);
    }
  }, []);

  const fetchDatabases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ListEnvelope<DbInfo>>(API.snowflakeExplorer.databases(), {
        params: { page_size: PAGE_SIZE },
      });
      const items = res.data?.items || [];
      setDatabases(items);
      setDbTotal(res.data?.pagination?.total ?? items.length);
      setLevel('databases');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load databases');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchemas = useCallback(async (db: string) => {
    setLoading(true);
    setError(null);
    setSelectedDb(db);
    try {
      const res = await apiClient.get<ListEnvelope<SchemaInfo>>(API.snowflakeExplorer.schemas(), {
        params: { database: db, page_size: PAGE_SIZE },
      });
      const items = res.data?.items || [];
      setSchemas(items);
      setSchemaTotal(res.data?.pagination?.total ?? items.length);
      setLevel('schemas');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load schemas');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchObjects = useCallback(async (db: string, schema: string, flt: ObjectFilters) => {
    setLoading(true);
    setError(null);
    setSelectedDb(db);
    setSelectedSchema(schema);
    try {
      const params: Record<string, string | number> = {
        database: db,
        schema,
        page_size: PAGE_SIZE,
      };
      if (flt.object_type) params.object_type = flt.object_type;
      if (flt.health_status) params.health_status = flt.health_status;
      if (flt.risk_level) params.risk_level = flt.risk_level;
      if (flt.freshness_status) params.freshness_status = flt.freshness_status;
      if (flt.search) params.search = flt.search;
      const res = await apiClient.get<ListEnvelope<ObjectInfo>>(API.snowflakeExplorer.objects(), { params });
      const items = res.data?.items || [];
      setObjects(items);
      setObjectTotal(res.data?.pagination?.total ?? items.length);
      setLevel('objects');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load objects');
    } finally {
      setLoading(false);
    }
  }, []);

  // Facets are scoped to db+schema ONLY (never the active chip selection) so the
  // chip set stays stable while filtering objects.
  const fetchFacets = useCallback(async (db: string, schema: string) => {
    try {
      const res = await apiClient.get<FacetsResponse>(API.snowflakeExplorer.facets(), {
        params: { database: db, schema },
      });
      setFacets(res.data || null);
    } catch {
      setFacets(null);
    }
  }, []);

  // Enter the objects view for a schema: reset filters, then load objects + facets.
  const openObjects = useCallback((db: string, schema: string) => {
    setObjectFilters({});
    setSearchDraft('');
    fetchObjects(db, schema, {});
    fetchFacets(db, schema);
  }, [fetchObjects, fetchFacets]);

  useEffect(() => {
    fetchDatabases();
    fetchSummary();
  }, [fetchDatabases, fetchSummary]);

  // Plain functions (not memoized) so they always read fresh selection/filter state.
  const toggleFilter = (key: keyof ObjectFilters, value: string) => {
    if (!selectedDb || !selectedSchema) return;
    const next: ObjectFilters = {
      ...objectFilters,
      [key]: objectFilters[key] === value ? undefined : value,
    };
    setObjectFilters(next);
    fetchObjects(selectedDb, selectedSchema, next);
  };

  const applySearch = () => {
    if (!selectedDb || !selectedSchema) return;
    const next: ObjectFilters = { ...objectFilters, search: searchDraft.trim() || undefined };
    setObjectFilters(next);
    fetchObjects(selectedDb, selectedSchema, next);
  };

  const clearFilters = () => {
    if (!selectedDb || !selectedSchema) return;
    setObjectFilters({});
    setSearchDraft('');
    fetchObjects(selectedDb, selectedSchema, {});
  };

  const hasActiveFilters = !!(
    objectFilters.object_type ||
    objectFilters.health_status ||
    objectFilters.risk_level ||
    objectFilters.freshness_status ||
    objectFilters.search
  );

  const handleBack = () => {
    if (level === 'objects') {
      setLevel('schemas');
      setSelectedSchema(null);
      setObjectFilters({});
      setSearchDraft('');
      setFacets(null);
    } else if (level === 'schemas') {
      setLevel('databases');
      setSelectedDb(null);
    }
  };

  const breadcrumb = (
    <div className="flex items-center gap-2 text-sm mb-4">
      <button
        onClick={() => {
          setLevel('databases');
          setSelectedDb(null);
          setSelectedSchema(null);
          setObjectFilters({});
          setSearchDraft('');
          setFacets(null);
        }}
        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
      >
        Catalog
      </button>
      {selectedDb && (
        <>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <button
            onClick={() => {
              setLevel('schemas');
              setSelectedSchema(null);
              setObjectFilters({});
              setSearchDraft('');
              setFacets(null);
              fetchSchemas(selectedDb);
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            {selectedDb}
          </button>
        </>
      )}
      {selectedSchema && (
        <>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <span className="text-gray-900 dark:text-white font-medium">{selectedSchema}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Data Catalog Explorer</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Browse databases, schemas, and objects across your data warehouse account.
          </p>
        </div>
        {level !== 'databases' && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        )}
      </div>

      {/* ── Global summary KPI strip (account-level) ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <KpiCard
            icon={<Box className="w-4 h-4" />}
            label="Objects"
            value={summary.objects ?? 0}
            accent="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          />
          <KpiCard
            icon={<Database className="w-4 h-4" />}
            label="Databases"
            value={summary.databases ?? 0}
            accent="bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
          />
          <KpiCard
            icon={<FolderOpen className="w-4 h-4" />}
            label="Schemas"
            value={summary.schemas ?? 0}
            accent="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
          />
          <KpiCard
            icon={<Table2 className="w-4 h-4" />}
            label="Tables"
            value={summary.tables ?? 0}
            accent="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          />
          <KpiCard
            icon={<Eye className="w-4 h-4" />}
            label="Views"
            value={summary.views ?? 0}
            accent="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400"
          />
          <KpiCard
            icon={<ShieldAlert className="w-4 h-4" />}
            label="Sensitive"
            value={summary.sensitive_objects ?? 0}
            accent="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
          />
          <KpiCard
            icon={<Clock className="w-4 h-4" />}
            label="Unused 90d"
            value={summary.unused_objects_90d ?? 0}
            accent="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          />
          <KpiCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Critical risks"
            value={summary.critical_risks ?? 0}
            accent="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
          />
          <KpiCard
            icon={<FileCode className="w-4 h-4" />}
            label="No owner/comment"
            value={summary.objects_without_owner_comment ?? '—'}
            accent="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          />
          <KpiCard
            icon={<GitBranch className="w-4 h-4" />}
            label="Failed pipelines"
            value={summary.failed_pipeline_objects ?? '—'}
            accent="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
          />
        </div>
      )}

      {/* Honest CTAs from the account-level summary — surfaced only on real findings. */}
      {summary &&
        ((summary.critical_risks ?? 0) > 0 ||
          (summary.sensitive_objects ?? 0) > 0 ||
          ((summary.unused_objects_90d ?? 0) > 0 &&
            level === 'objects' &&
            objectFilters.freshness_status !== 'stale')) && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-900/10">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Recommended actions
            </span>
            {(summary.critical_risks ?? 0) > 0 && (
              <InsightActionButton
                label="Review critical risks"
                icon={AlertTriangle}
                variant="subtle"
                size="sm"
                onAction={async () => {
                  router.push('/governance');
                }}
              />
            )}
            {(summary.sensitive_objects ?? 0) > 0 && (
              <InsightActionButton
                label="Apply masking policies"
                icon={Lock}
                variant="subtle"
                size="sm"
                onAction={async () => {
                  router.push('/governance/policies');
                }}
              />
            )}
            {(summary.unused_objects_90d ?? 0) > 0 &&
              level === 'objects' &&
              objectFilters.freshness_status !== 'stale' && (
                <InsightActionButton
                  label="Filter to stale"
                  icon={Clock}
                  variant="subtle"
                  size="sm"
                  onAction={async () => {
                    toggleFilter('freshness_status', 'stale');
                  }}
                />
              )}
          </div>
        )}

      {breadcrumb}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" />
        </div>
      ) : level === 'databases' ? (
        /* ── Databases Grid ── */
        <div className="space-y-3">
          {databases.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {dbTotal > databases.length
                ? `Showing first ${databases.length} of ${dbTotal.toLocaleString()} databases`
                : `${databases.length} database${databases.length === 1 ? '' : 's'}`}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {databases.length === 0 ? (
            <p className="col-span-full text-center py-12 text-gray-400">No databases found</p>
          ) : (
            databases.map((db) => (
              <button
                key={db.database_id || db.database_name}
                onClick={() => fetchSchemas(db.database_name)}
                className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-left hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{db.database_name}</h4>
                    {db.owner_role && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Owner: {db.owner_role}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <Badge size="sm" variant="flat" color={healthColor(db.health_status)}>
                    {db.health_status || 'unknown'}
                  </Badge>
                  <Badge size="sm" variant="flat" color={riskColor(db.risk_level)}>
                    risk: {db.risk_level || 'low'}
                  </Badge>
                  {(db.sensitive_object_count ?? 0) > 0 && (
                    <Badge size="sm" variant="flat" color="danger">
                      <span className="inline-flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        {db.sensitive_object_count}
                      </span>
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{formatNumber(db.schema_count)} schemas</span>
                  <span>{formatNumber(db.object_count)} objects</span>
                  <span>{formatBytes(db.storage_bytes)}</span>
                </div>
                {db.comment && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-2">{db.comment}</p>
                )}
              </button>
            ))
          )}
          </div>
        </div>
      ) : level === 'schemas' ? (
        /* ── Schemas Grid ── */
        <div className="space-y-3">
          {schemas.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {schemaTotal > schemas.length
                ? `Showing first ${schemas.length} of ${schemaTotal.toLocaleString()} schemas`
                : `${schemas.length} schema${schemas.length === 1 ? '' : 's'}`}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {schemas.length === 0 ? (
            <p className="col-span-full text-center py-12 text-gray-400">No schemas found in {selectedDb}</p>
          ) : (
            schemas.map((sch) => (
              <button
                key={sch.schema_id || sch.schema_name}
                onClick={() => selectedDb && openObjects(selectedDb, sch.schema_name)}
                className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-left hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700 transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <FolderOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{sch.schema_name}</h4>
                    {sch.owner_role && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Owner: {sch.owner_role}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-violet-500 transition-colors" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <Badge size="sm" variant="flat" color={healthColor(sch.health_status)}>
                    {sch.health_status || 'unknown'}
                  </Badge>
                  <Badge size="sm" variant="flat" color={riskColor(sch.risk_level)}>
                    risk: {sch.risk_level || 'low'}
                  </Badge>
                  {(sch.sensitive_object_count ?? 0) > 0 && (
                    <Badge size="sm" variant="flat" color="danger">
                      <span className="inline-flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        {sch.sensitive_object_count}
                      </span>
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{formatNumber(sch.object_count)} objects</span>
                  <span>{formatNumber(sch.table_count)} tables</span>
                  <span>{formatNumber(sch.view_count)} views</span>
                </div>
              </button>
            ))
          )}
          </div>
        </div>
      ) : (
        /* ── Objects Table ── */
        <div className="space-y-3">
          {/* Facets filter bar (scoped to the current schema) */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
                  placeholder="Search objects…"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-8 pr-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <X className="w-3 h-3" />
                  Clear filters
                </button>
              )}
            </div>
            <FacetGroup
              label="Type"
              items={facets?.object_types}
              activeValue={objectFilters.object_type}
              onToggle={(v) => toggleFilter('object_type', v)}
            />
            <FacetGroup
              label="Health"
              items={facets?.health_statuses}
              activeValue={objectFilters.health_status}
              onToggle={(v) => toggleFilter('health_status', v)}
            />
            <FacetGroup
              label="Risk"
              items={facets?.risk_levels}
              activeValue={objectFilters.risk_level}
              onToggle={(v) => toggleFilter('risk_level', v)}
            />
            <FacetGroup
              label="Freshness"
              items={facets?.freshness_statuses}
              activeValue={objectFilters.freshness_status}
              onToggle={(v) => toggleFilter('freshness_status', v)}
            />
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Objects</h3>
                <Badge size="sm" variant="flat" color="secondary">
                  {objectTotal > objects.length
                    ? `${objects.length} of ${objectTotal.toLocaleString()}`
                    : objects.length}
                </Badge>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Health</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Risk</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Freshness</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Rows</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Size</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Queries 30d</th>
                    <th className="px-4 py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">Lineage</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 dark:text-gray-400">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {objects.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                        {hasActiveFilters
                          ? 'No objects match the current filters'
                          : `No objects found in ${selectedDb}.${selectedSchema}`}
                      </td>
                    </tr>
                  ) : (
                    objects.map((obj) => (
                      <tr key={obj.object_id || obj.object_name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {objectIcon(obj.object_type)}
                            <span className="text-gray-900 dark:text-white font-medium truncate">{obj.object_name}</span>
                            {obj.is_sensitive && (
                              <Lock className="w-3 h-3 text-rose-500 shrink-0" aria-label="Sensitive" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge size="sm" variant="flat" color={typeColor(obj.object_type)}>
                            {obj.object_type || 'TABLE'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge size="sm" variant="flat" color={healthColor(obj.health_status)}>
                            {obj.health_status || 'unknown'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge size="sm" variant="flat" color={riskColor(obj.risk_level)}>
                            {obj.risk_level || 'low'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge size="sm" variant="flat" color={freshnessColor(obj.freshness_status)}>
                            {obj.freshness_status || 'unknown'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {formatNumber(obj.row_count)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {formatBytes(obj.storage_bytes)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {formatNumber(obj.query_count_30d)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {(obj.lineage_count_in ?? 0) + (obj.lineage_count_out ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <GitBranch className="w-3 h-3" />
                              {obj.lineage_count_in ?? 0}/{obj.lineage_count_out ?? 0}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                          {obj.owner_role || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(SnowflakeExplorerTab);
