'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Badge, Loader, Tooltip } from 'rizzui';
import {
  Database, Cloud, Building2, TrendingUp, Shield, Zap, GitBranch,
  RefreshCw, Timer, ExternalLink, Upload, Activity, Clock, HardDrive,
  Layers, Search, Filter, ChevronDown, ChevronRight, BarChart3, AlertTriangle,
} from 'lucide-react';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ============================================
// TYPES
// ============================================

interface CatalogTable {
  schema: string;
  table_name: string;
  table_type: string;
  row_count: number;
  size_bytes: number;
  created: string | null;
  last_altered: string | null;
  comment: string;
  domain: string;
  source_system: string;
  ingestion_type: string;
  freshness_hours: number | null;
  layer: string;
  // additive enrichment (source: ACCOUNT_USAGE.COPY_HISTORY) — optional for backward compat
  last_load_time?: string | null;
  rows_loaded_30d?: number | null;
  load_errors_30d?: number | null;
}

interface DomainSummary {
  domain: string;
  table_count: number;
  total_rows: number;
  total_bytes: number;
  schemas: string[];
  source_systems: string[];
}

interface CatalogResponse {
  database: string;
  tables: CatalogTable[];
  total_tables: number;
  domains: DomainSummary[];
  total_schemas: number;
  // additive enrichment — optional for backward compat
  ingestion_breakdown?: Record<string, number>;
  tables_loaded_30d?: number;
  source?: Record<string, string>;
}

// ============================================
// CONSTANTS
// ============================================

const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'CRM': { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  'ERP': { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  'Finance': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  'Marketing': { bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800' },
  'Human Resources': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  'ITSM': { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
  'Database': { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
  'Data Lake': { bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  'Data Warehouse': { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800' },
  'External API': { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  'Industry': { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
  'Other': { bg: 'bg-slate-50 dark:bg-slate-800/50', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700' },
};

const INGESTION_ICONS: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  'SNOWPIPE': { icon: Zap, color: 'text-blue-500', label: 'Snowpipe' },
  'CDC_STREAM': { icon: GitBranch, color: 'text-cyan-500', label: 'CDC Stream' },
  'DYNAMIC_TABLE': { icon: RefreshCw, color: 'text-teal-500', label: 'Dynamic Table' },
  'SCHEDULED_TASK': { icon: Timer, color: 'text-purple-500', label: 'Scheduled Task' },
  'EXTERNAL_TABLE': { icon: ExternalLink, color: 'text-amber-500', label: 'External Table' },
  'MANUAL': { icon: Upload, color: 'text-slate-400', label: 'Manual' },
};

const LAYER_COLORS: Record<string, string> = {
  'Landing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Raw': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Staging': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'DWH': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Mart': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Other': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

// ============================================
// HELPERS
// ============================================

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getFreshnessColor(hours: number | null): string {
  if (hours === null) return 'text-slate-400';
  if (hours < 1) return 'text-green-500';
  if (hours < 24) return 'text-blue-500';
  if (hours < 72) return 'text-amber-500';
  return 'text-red-500';
}

function getFreshnessLabel(hours: number | null): string {
  if (hours === null) return 'Unknown';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// ============================================
// DOMAIN CARD COMPONENT
// ============================================

const DomainCard: React.FC<{
  domain: DomainSummary;
  isExpanded: boolean;
  onToggle: () => void;
  tables: CatalogTable[];
  searchQuery: string;
}> = ({ domain, isExpanded, onToggle, tables, searchQuery }) => {
  const colors = DOMAIN_COLORS[domain.domain] || DOMAIN_COLORS['Other'];

  const filteredTables = useMemo(() => {
    if (!searchQuery) return tables;
    const q = searchQuery.toLowerCase();
    return tables.filter(t =>
      t.table_name.toLowerCase().includes(q) ||
      t.schema.toLowerCase().includes(q) ||
      t.source_system.toLowerCase().includes(q)
    );
  }, [tables, searchQuery]);

  // Ingestion type breakdown
  const ingestionBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredTables.forEach(t => {
      counts[t.ingestion_type] = (counts[t.ingestion_type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredTables]);

  if (filteredTables.length === 0) return null;

  return (
    <div className={`rounded-xl border ${colors.border} overflow-hidden transition-all duration-200`}>
      {/* Domain Header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 ${colors.bg} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
          <div className="text-left">
            <h3 className={`text-base font-semibold ${colors.text}`}>{domain.domain}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {domain.schemas.join(', ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Source systems */}
          <div className="hidden md:flex items-center gap-1.5">
            {domain.source_systems.map(sys => (
              <Badge key={sys} size="sm" className="bg-white/80 dark:bg-slate-800/80 text-xs font-normal">
                {sys}
              </Badge>
            ))}
          </div>
          {/* KPIs */}
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <Tooltip content="Tables">
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" />
                {filteredTables.length}
              </span>
            </Tooltip>
            <Tooltip content="Total Rows">
              <span className="flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" />
                {formatNumber(domain.total_rows)}
              </span>
            </Tooltip>
            <Tooltip content="Storage">
              <span className="flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" />
                {formatBytes(domain.total_bytes)}
              </span>
            </Tooltip>
          </div>
          {/* Ingestion type badges */}
          <div className="hidden lg:flex items-center gap-1">
            {ingestionBreakdown.slice(0, 3).map(([type, count]) => {
              const info = INGESTION_ICONS[type] || INGESTION_ICONS['MANUAL'];
              const Icon = info.icon;
              return (
                <Tooltip key={type} content={`${info.label}: ${count}`}>
                  <span className={`flex items-center gap-0.5 text-xs ${info.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{count}</span>
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </button>

      {/* Table List (Expanded) */}
      {isExpanded && (
        <div className="bg-white dark:bg-slate-900/50">
          {/* Header Row */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
            <div className="col-span-3">Table</div>
            <div className="col-span-2">Schema</div>
            <div className="col-span-1">Layer</div>
            <div className="col-span-1">Source</div>
            <div className="col-span-1">Ingestion</div>
            <div className="col-span-1 text-right">Rows</div>
            <div className="col-span-1 text-right">Size</div>
            <div className="col-span-2 text-right">Freshness</div>
          </div>
          {/* Table Rows */}
          {filteredTables.map((table) => {
            const ingestionInfo = INGESTION_ICONS[table.ingestion_type] || INGESTION_ICONS['MANUAL'];
            const IngIcon = ingestionInfo.icon;
            return (
              <div
                key={`${table.schema}.${table.table_name}`}
                className="grid grid-cols-12 gap-2 px-5 py-2.5 text-sm border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="col-span-3 flex min-w-0 items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                  <span className="truncate" title={table.table_name}>{table.table_name}</span>
                  {(table.load_errors_30d ?? 0) > 0 && (
                    <Tooltip content={`${table.load_errors_30d} load error${table.load_errors_30d === 1 ? '' : 's'} in the last 30 days`}>
                      <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {formatNumber(table.load_errors_30d ?? 0)}
                      </span>
                    </Tooltip>
                  )}
                </div>
                <div className="col-span-2 text-slate-500 dark:text-slate-400 truncate text-xs flex items-center">
                  {table.schema}
                </div>
                <div className="col-span-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${LAYER_COLORS[table.layer] || LAYER_COLORS['Other']}`}>
                    {table.layer}
                  </span>
                </div>
                <div className="col-span-1 text-xs text-slate-500 dark:text-slate-400 truncate" title={table.source_system}>
                  {table.source_system}
                </div>
                <div className="col-span-1">
                  <Tooltip content={ingestionInfo.label}>
                    <span className={`flex items-center gap-1 text-xs ${ingestionInfo.color}`}>
                      <IngIcon className="h-3.5 w-3.5" />
                    </span>
                  </Tooltip>
                </div>
                <div className="col-span-1 text-right text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  {formatNumber(table.row_count)}
                </div>
                <div className="col-span-1 text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatBytes(table.size_bytes)}
                </div>
                <div className="col-span-2 text-right">
                  <span
                    className={`flex items-center justify-end gap-1 text-xs ${getFreshnessColor(table.freshness_hours)}`}
                    title={table.last_load_time
                      ? `Last load: ${new Date(table.last_load_time).toLocaleString()}${table.rows_loaded_30d != null ? ` · ${formatNumber(table.rows_loaded_30d)} rows loaded (30d)` : ''}`
                      : undefined}
                  >
                    <Clock className="h-3 w-3" />
                    {getFreshnessLabel(table.freshness_hours)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function SourceCatalog() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [filterIngestion, setFilterIngestion] = useState<string>('');

  // Load databases on mount
  useEffect(() => {
    const loadDatabases = async () => {
      try {
        const res = await apiClient.get(API.common.databases());
        const rawDbs = res.data?.databases || res.data || [];
        const safeDbs = Array.isArray(rawDbs) ? rawDbs : [];
        const dbs = safeDbs.map((d: any) =>
          typeof d === 'string' ? d : d.name || d.DATABASE_NAME || ''
        ).filter(Boolean);
        setDatabases(dbs);
        if (dbs.length > 0) {
          const defaultDb = dbs.find((d: string) => d.toUpperCase().includes('DATA360')) || dbs[0];
          setSelectedDb(defaultDb);
        }
      } catch (err) {
        setDatabases([]);
        setError(getApiErrorMessage(err));
      }
    };
    loadDatabases();
  }, []);

  // Load catalog for the selected database (also used by the inline Retry button).
  const loadCatalog = useCallback(async () => {
    if (!selectedDb) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(API.connect.sourceCatalog(), { params: { database: selectedDb } });
      setCatalog(res.data);
      // Auto-expand first 3 domains
      const first3 = (res.data?.domains || []).slice(0, 3).map((d: DomainSummary) => d.domain);
      setExpandedDomains(new Set(first3));
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDb]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Filter tables by domain and ingestion type
  const filteredTablesByDomain = useMemo(() => {
    if (!catalog) return {};
    const grouped: Record<string, CatalogTable[]> = {};
    for (const t of catalog.tables) {
      if (filterDomain && t.domain !== filterDomain) continue;
      if (filterIngestion && t.ingestion_type !== filterIngestion) continue;
      if (!grouped[t.domain]) grouped[t.domain] = [];
      grouped[t.domain].push(t);
    }
    return grouped;
  }, [catalog, filterDomain, filterIngestion]);

  // All unique ingestion types
  const allIngestionTypes = useMemo(() => {
    if (!catalog) return [];
    const types = new Set(catalog.tables.map(t => t.ingestion_type));
    return Array.from(types).sort();
  }, [catalog]);

  const toggleDomain = (domain: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  // Summary KPIs
  const totalRows = catalog?.tables.reduce((sum, t) => sum + (t.row_count || 0), 0) || 0;
  const totalBytes = catalog?.tables.reduce((sum, t) => sum + (t.size_bytes || 0), 0) || 0;
  const freshCount = catalog?.tables.filter(t => t.freshness_hours !== null && t.freshness_hours < 24).length || 0;
  const staleCount = catalog?.tables.filter(t => t.freshness_hours !== null && t.freshness_hours >= 72).length || 0;

  return (
    <div className="space-y-6">
      {/* Header with DB selector & search */}
      <div className="bg-white dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Enterprise Source Catalog</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Connected data sources organized by domain, system, and data layer
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Database selector */}
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {databases.map(db => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        {catalog && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="">All Domains</option>
              {catalog.domains.map(d => (
                <option key={d.domain} value={d.domain}>{d.domain} ({d.table_count})</option>
              ))}
            </select>
            <select
              value={filterIngestion}
              onChange={(e) => setFilterIngestion(e.target.value)}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="">All Ingestion Types</option>
              {allIngestionTypes.map(type => {
                const info = INGESTION_ICONS[type] || INGESTION_ICONS['MANUAL'];
                return <option key={type} value={type}>{info.label}</option>;
              })}
            </select>
            {(filterDomain || filterIngestion) && (
              <button
                onClick={() => { setFilterDomain(''); setFilterIngestion(''); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI Summary Bar */}
      {catalog && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Total Tables', value: String(catalog.total_tables), icon: Database, color: 'text-blue-500' },
            { label: 'Domains', value: String(catalog.domains.length), icon: Layers, color: 'text-purple-500' },
            { label: 'Total Rows', value: formatNumber(totalRows), icon: BarChart3, color: 'text-emerald-500' },
            { label: 'Loaded (30d)', value: catalog.tables_loaded_30d != null ? String(catalog.tables_loaded_30d) : '—', icon: TrendingUp, color: 'text-cyan-500' },
            { label: 'Fresh (<24h)', value: String(freshCount), icon: Activity, color: 'text-green-500' },
            { label: 'Stale (>72h)', value: String(staleCount), icon: Clock, color: staleCount > 0 ? 'text-red-500' : 'text-slate-400' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white dark:bg-slate-900/50 rounded-lg p-3.5 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              <div>
                <div className="text-lg font-bold text-slate-800 dark:text-white">{kpi.value}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <Loader size="xl" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          <button
            onClick={loadCatalog}
            className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Domain Cards */}
      {catalog && !loading && (
        <div className="space-y-4">
          {catalog.domains
            .filter(d => !filterDomain || d.domain === filterDomain)
            .map((domain) => (
              <DomainCard
                key={domain.domain}
                domain={domain}
                isExpanded={expandedDomains.has(domain.domain)}
                onToggle={() => toggleDomain(domain.domain)}
                tables={filteredTablesByDomain[domain.domain] || []}
                searchQuery={searchQuery}
              />
            ))}
        </div>
      )}

      {/* Empty state */}
      {catalog && !loading && catalog.total_tables === 0 && (
        <div className="text-center py-16">
          <Database className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">No tables found in {selectedDb}</p>
        </div>
      )}

      {/* Storage overview footer */}
      {catalog && !loading && totalBytes > 0 && (
        <div className="bg-white dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              Total Storage: <strong className="text-slate-700 dark:text-slate-200">{formatBytes(totalBytes)}</strong>
            </span>
            <span>{catalog.total_schemas} schemas across {catalog.domains.length} domains</span>
          </div>
        </div>
      )}
    </div>
  );
}
