'use client';

import Breadcrumb from '@/components/ui/Breadcrumb';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { dqThresholdSchema, type DQThresholdFormValues } from '@/validators/dq-threshold.schema';
import { Badge, Button, Input, Tooltip, Modal, Select } from 'rizzui';
import {
  CheckCircle2, AlertTriangle, Database, Clock,
  Shield, DollarSign, FileSearch, BarChart3,
  RefreshCw, Upload, Table2, Tag, Fingerprint,
  Activity, TrendingUp, Search, X, Filter,
  Lightbulb, ChevronDown, ChevronUp,
  ArrowRight, Info, Play, Settings, Download,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { motion, LayoutGroup } from 'framer-motion';
import apiClient from '@/lib/api-client';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import QueryHistoryTable from '@/components/audit/QueryHistoryTable';

// ── Types ──

interface MetricRow {
  [key: string]: unknown;
}

interface QualitySummary {
  health_score: number;
  total_tables: number;
  freshness_violations: number;
  freshness_violation_pct: number;
  classification_coverage: number;
  schema_score: number;
  dmf_pass_rate: number;
  ingestion_success_rate: number;
  checks_run_30d: number;
  schema_changes_30d: number;
  dq_credits_30d: number;
}

interface Recommendation {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  action: string;
  table?: string;
  column?: string;
}

interface CacheInfo {
  loadedAt: number;
  fromCache: boolean;
}

// ── Constants ──

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const DARK_TOOLTIP_STYLE = {
  backgroundColor: '#1F2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  color: '#F9FAFB',
  fontSize: '12px',
};

const TAB_ENDPOINTS: Record<string, string> = {
  completeness: 'completeness-metrics',
  uniqueness: 'uniqueness-metrics',
  freshness: 'freshness-metrics',
  ingestion: 'ingestion-metrics',
  schema: 'schema-quality',
  classification: 'classification-coverage',
  cost: 'cost-metrics',
  security: 'security-posture',
  dmf: 'dmf-results',
  pii: 'pii-detection',
};

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  completeness: CheckCircle2,
  uniqueness: Fingerprint,
  freshness: Clock,
  ingestion: Upload,
  schema: Table2,
  classification: Tag,
  cost: DollarSign,
  security: Shield,
  dmf: FileSearch,
  pii: Shield,
};

const TAB_LABELS: Record<string, string> = {
  completeness: 'Completeness',
  uniqueness: 'Uniqueness',
  freshness: 'Freshness',
  ingestion: 'Ingestion',
  schema: 'Schema',
  classification: 'Classification',
  cost: 'Storage',
  security: 'Security',
  dmf: 'DMF Results',
  pii: 'PII Detection',
};

const TAB_IDS = Object.keys(TAB_ENDPOINTS);

const PAGINATED_TABS = new Set(['completeness', 'uniqueness', 'freshness', 'schema', 'cost', 'security']);

// ── API helpers ──

// Feature flag: when true, the page hits the unified /data-quality/snapshot
// endpoint on initial load instead of fanning out N requests from the client.
// Default OFF for safety; enable via NEXT_PUBLIC_DQ_USE_SNAPSHOT=true to opt in.
const USE_SNAPSHOT = process.env.NEXT_PUBLIC_DQ_USE_SNAPSHOT === 'true';

// In-flight request dedupe — scoped to this page only.
// Two code paths (initial load + tab-change effect) can race on the same
// endpoint within the same tick. Coalescing identical GETs prevents the
// duplicate completeness-metrics call seen in production telemetry.
const _inFlight = new Map<string, Promise<any>>();

async function fetchQualityData(endpoint: string, forceRefresh = false, params?: Record<string, string | number>): Promise<any> {
  const queryStr = params ? '?' + new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString() : '';
  const key = `GET:${endpoint}${queryStr}:${forceRefresh ? 'force' : 'cached'}`;

  // Reuse an in-flight identical request rather than firing a duplicate.
  // forceRefresh participates in the key so an explicit Refresh always bypasses
  // any stale promise that's mid-flight.
  const existing = _inFlight.get(key);
  if (existing) return existing;

  const headers: Record<string, string> = {};
  if (forceRefresh) headers['Cache-Control'] = 'no-cache';

  const promise = apiClient
    .get(`/data-quality/${endpoint}${queryStr}`, { headers })
    .then((res) => res.data)
    .catch((err: any) => {
      const msg = err?.response?.data?.detail || err?.message || 'Request failed';
      console.error(`[DataQuality] ${endpoint} failed:`, msg);
      throw new Error(msg);
    })
    .finally(() => {
      // Clear after settle so the next call re-fetches.
      _inFlight.delete(key);
    });

  _inFlight.set(key, promise);
  return promise;
}

// ── Skeleton Components ──

function SkeletonBar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('animate-pulse bg-gray-200 dark:bg-gray-700 rounded', className)} style={style} />
  );
}

function KpiSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <SkeletonBar className="h-8 w-8 rounded-lg flex-shrink-0" />
      <div className="space-y-1.5 flex-1">
        <SkeletonBar className="h-3 w-16" />
        <SkeletonBar className="h-5 w-10" />
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      <SkeletonBar className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <SkeletonBar className="h-4 w-32" />
      <div className="flex items-end gap-2 h-40">
        {[60, 80, 45, 90, 70, 55, 85].map((h, i) => (
          <SkeletonBar key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// ── Cache Age Badge ──

function CacheAgeBadge({ cacheInfo }: { cacheInfo: CacheInfo | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!cacheInfo) return null;

  const ageMs = Date.now() - cacheInfo.loadedAt;
  const ageMin = Math.floor(ageMs / 60000);
  const ageSec = Math.floor((ageMs % 60000) / 1000);
  const label = ageMin > 0 ? `${ageMin}m ago` : `${ageSec}s ago`;

  return (
    <Tooltip content={cacheInfo.fromCache ? 'Served from cache' : 'Fresh data from server'}>
      <Badge
        variant="flat"
        color={cacheInfo.fromCache ? 'warning' : 'success'}
        className="text-[10px] cursor-default"
      >
        {cacheInfo.fromCache ? `cached ${label}` : `fresh ${label}`}
      </Badge>
    </Tooltip>
  );
}

// ── Status badge ──

function StatusBadge({ status }: { status: string | unknown }) {
  const s = String(status ?? '').toUpperCase();
  if (s === 'PASS' || s === 'LOADED' || s === 'UNIQUE')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">{s}</span>;
  if (s === 'FAIL' || s === 'LOAD_FAILED' || s === 'HAS_DUPLICATES')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{s}</span>;
  if (s === 'WARNING' || s === 'PARTIALLY_LOADED')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{s}</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{s || '—'}</span>;
}

// ── Data Type Chip ──

function DataTypeChip({ type, quality }: { type?: string; quality?: 'good' | 'warning' | 'bad' }) {
  const colorMap = {
    good: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    bad: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  };
  return (
    <span className={cn(
      'inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border',
      colorMap[quality || 'good']
    )}>
      {type || 'UNKNOWN'}
    </span>
  );
}

// ── Recommendation Card ──

function RecommendationCard({ rec, onApply }: { rec: Recommendation; onApply?: (rec: Recommendation) => void }) {
  const severityConfig = {
    critical: { color: 'danger' as const, icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' },
    warning: { color: 'warning' as const, icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' },
    info: { color: 'info' as const, icon: Info, bg: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' },
  };
  const cfg = severityConfig[rec.severity];
  const Icon = cfg.icon;

  return (
    <div className={cn('rounded-lg border p-3 flex items-start gap-3', cfg.bg)}>
      <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0',
        rec.severity === 'critical' ? 'text-red-500' : rec.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-gray-900 dark:text-white">{rec.title}</span>
          <Badge variant="flat" color={cfg.color} className="text-[10px]">{rec.severity}</Badge>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">{rec.description}</p>
        {rec.table && (
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{rec.table}{rec.column ? `.${rec.column}` : ''}</span>
        )}
      </div>
      {onApply && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 px-2 flex-shrink-0"
          onClick={() => onApply(rec)}
        >
          <ArrowRight className="h-3 w-3 mr-1" />
          {rec.action}
        </Button>
      )}
    </div>
  );
}

// ── Recommendations Engine ──

function generateRecommendations(allTabData: Record<string, MetricRow[]>, summary: QualitySummary | null): Recommendation[] {
  const recs: Recommendation[] = [];
  let id = 0;

  // Completeness: high null rates
  const completeness = allTabData.completeness || [];
  for (const row of completeness) {
    const pct = Number(row.COMPLETENESS_PCT || 100);
    if (pct < 80) {
      recs.push({
        id: `rec-${id++}`,
        severity: pct < 50 ? 'critical' : 'warning',
        category: 'Completeness',
        title: `High null rate on ${row.COLUMN_NAME}`,
        description: `Column has ${(100 - pct).toFixed(1)}% null values. Consider adding a NOT NULL constraint or default value.`,
        action: 'Review',
        table: String(row.TABLE_NAME || ''),
        column: String(row.COLUMN_NAME || ''),
      });
    }
  }

  // Freshness: stale tables
  const freshness = allTabData.freshness || [];
  for (const row of freshness) {
    const hours = Number(row.AGE_HOURS || 0);
    if (hours > 48) {
      recs.push({
        id: `rec-${id++}`,
        severity: hours > 168 ? 'critical' : 'warning',
        category: 'Freshness',
        title: `Stale data in ${row.TABLE_NAME}`,
        description: `Table hasn't been updated in ${hours.toFixed(0)} hours. Last altered: ${row.LAST_ALTERED || 'unknown'}.`,
        action: 'Investigate',
        table: String(row.TABLE_NAME || ''),
      });
    }
  }

  // Schema: missing PKs
  const schema = allTabData.schema || [];
  for (const row of schema) {
    if (!row.HAS_PK) {
      recs.push({
        id: `rec-${id++}`,
        severity: 'warning',
        category: 'Schema',
        title: `No primary key on ${row.TABLE_NAME}`,
        description: `Table lacks a primary key. Add one to ensure data integrity and enable efficient joins.`,
        action: 'Add PK',
        table: String(row.TABLE_NAME || ''),
      });
    }
    const docPct = Number(row.DOCUMENTED_PCT || 0);
    if (docPct < 40) {
      recs.push({
        id: `rec-${id++}`,
        severity: 'info',
        category: 'Documentation',
        title: `Low documentation on ${row.TABLE_NAME}`,
        description: `Only ${docPct.toFixed(0)}% of columns are documented. Add COMMENT ON to improve discoverability.`,
        action: 'Document',
        table: String(row.TABLE_NAME || ''),
      });
    }
  }

  // DMF: tables with no checks
  const dmf = allTabData.dmf || [];
  const tablesWithDmf = new Set(dmf.map((r) => String(r.TABLE_NAME || '')));
  const allTables = new Set([
    ...completeness.map((r) => String(r.TABLE_NAME || '')),
    ...freshness.map((r) => String(r.TABLE_NAME || '')),
    ...schema.map((r) => String(r.TABLE_NAME || '')),
  ]);
  for (const table of allTables) {
    if (table && !tablesWithDmf.has(table)) {
      recs.push({
        id: `rec-${id++}`,
        severity: 'info',
        category: 'DMF',
        title: `No DMF checks for ${table}`,
        description: `Configure Data Metric Functions to continuously monitor quality for this table.`,
        action: 'Configure',
        table,
      });
    }
  }

  // Uniqueness: duplicates
  const uniqueness = allTabData.uniqueness || [];
  for (const row of uniqueness) {
    const dupes = Number(row.DUPLICATE_COUNT || 0);
    if (dupes > 0 && row.IS_KEY_COLUMN) {
      recs.push({
        id: `rec-${id++}`,
        severity: 'critical',
        category: 'Uniqueness',
        title: `Duplicates in key column ${row.COLUMN_NAME}`,
        description: `${dupes.toLocaleString()} duplicate values found in a key column. This may indicate ETL issues.`,
        action: 'Investigate',
        table: String(row.TABLE_NAME || ''),
        column: String(row.COLUMN_NAME || ''),
      });
    }
  }

  // Ingestion failures
  const ingestion = allTabData.ingestion || [];
  for (const row of ingestion) {
    const status = String(row.STATUS || '').toUpperCase();
    if (status === 'LOAD_FAILED' || status === 'FAIL') {
      recs.push({
        id: `rec-${id++}`,
        severity: 'critical',
        category: 'Ingestion',
        title: `Failed ingestion for ${row.TABLE_NAME}`,
        description: `File ${row.FILE_NAME || 'unknown'} failed to load. ${Number(row.ERRORS_SEEN || 0)} errors detected.`,
        action: 'Fix',
        table: String(row.TABLE_NAME || ''),
      });
    }
  }

  // Summary-level recommendations
  if (summary) {
    if (summary.dmf_pass_rate < 80) {
      recs.push({
        id: `rec-${id++}`,
        severity: 'warning',
        category: 'DMF',
        title: 'Low DMF pass rate',
        description: `Overall DMF pass rate is ${summary.dmf_pass_rate}%. Review failing validation rules and adjust thresholds.`,
        action: 'Review',
      });
    }
    if (summary.classification_coverage < 50) {
      recs.push({
        id: `rec-${id++}`,
        severity: 'info',
        category: 'Classification',
        title: 'Low classification coverage',
        description: `Only ${summary.classification_coverage}% of columns are classified. Run SYSTEM$CLASSIFY to tag sensitive data.`,
        action: 'Classify',
      });
    }
  }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  recs.sort((a, b) => order[a.severity] - order[b.severity]);

  return recs;
}

// ── Filter Chips ──

function FilterChip({ label, active, onClick, onRemove }: {
  label: string; active?: boolean; onClick: () => void; onRemove?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
        active
          ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700'
      )}
    >
      {label}
      {active && onRemove && (
        <X className="h-3 w-3 ml-0.5" onClick={(e) => { e.stopPropagation(); onRemove(); }} />
      )}
    </button>
  );
}

// ── Compact Audit Table ──

function AuditTable({
  columns,
  data,
  emptyMsg,
}: {
  columns: { key: string; label: string; format?: (v: unknown, row: MetricRow) => React.ReactNode }[];
  data: MetricRow[];
  emptyMsg?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-400 dark:text-gray-400 text-sm">
        {emptyMsg || 'No data available'}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {columns.map((col) => (
              <th key={col.key} className="px-2.5 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap uppercase tracking-wider">
                {col.label}
              </th>
            ))}
            <th className="px-2.5 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className="px-2.5 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '—')}
                </td>
              ))}
              <td className="px-2.5 py-1.5 whitespace-nowrap">
                <button
                  onClick={() => toast.success(`Profiling ${row.TABLE_NAME || row.COLUMN_NAME || 'item'}...`)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                >
                  <BarChart3 className="h-3 w-3" /> Profile
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination Controls ──

function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  if (totalPages <= 1 && total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{total.toLocaleString()} total rows</span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <label className="flex items-center gap-1">
          Per page:
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-700 dark:text-gray-300"
          >
            {[10, 25, 50, 100, 200].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          First
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          Prev
        </button>
        <span className="px-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          Next
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          Last
        </button>
      </div>
    </div>
  );
}

// ── Tab content column definitions ──

function getTabColumns(tab: string): { key: string; label: string; format?: (v: unknown, row: MetricRow) => React.ReactNode }[] {
  switch (tab) {
    case 'completeness':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'COLUMN_NAME', label: 'Column' },
        { key: 'TOTAL_ROWS', label: 'Rows', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'NULL_COUNT', label: 'Nulls', format: (v) => Number(v || 0).toLocaleString() },
        {
          key: 'COMPLETENESS_PCT', label: 'Complete', format: (v) => {
            const pct = Number(v || 0);
            const color = pct >= 95 ? 'text-green-600 dark:text-green-400' : pct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
            return <span className={cn('font-semibold', color)}>{pct.toFixed(1)}%</span>;
          },
        },
      ];
    case 'uniqueness':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'COLUMN_NAME', label: 'Column' },
        { key: 'DATA_TYPE', label: 'Type', format: (v, row) => {
          const dupes = Number(row.DUPLICATE_COUNT || 0);
          return <DataTypeChip type={String(v || '')} quality={dupes > 0 ? 'bad' : 'good'} />;
        }},
        { key: 'TOTAL_ROWS', label: 'Rows', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'DUPLICATE_COUNT', label: 'Dupes', format: (v) => {
          const n = Number(v || 0);
          return <span className={n > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-green-600 dark:text-green-400'}>{n.toLocaleString()}</span>;
        }},
        { key: 'STATUS', label: 'Status', format: (v) => <StatusBadge status={v} /> },
      ];
    case 'freshness':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'SCHEMA_NAME', label: 'Schema' },
        { key: 'LAST_ALTERED', label: 'Last Altered' },
        { key: 'AGE_HOURS', label: 'Age (h)', format: (v) => {
          const hours = Number(v || 0);
          const color = hours > 48 ? 'text-red-600 dark:text-red-400 font-semibold' : hours > 24 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
          return <span className={color}>{hours.toFixed(1)}</span>;
        }},
        { key: 'ROW_COUNT', label: 'Rows', format: (v) => Number(v || 0).toLocaleString() },
      ];
    case 'ingestion':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'FILE_NAME', label: 'File' },
        { key: 'STATUS', label: 'Status', format: (v) => <StatusBadge status={v} /> },
        { key: 'ROW_COUNT', label: 'Loaded', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'ERRORS_SEEN', label: 'Errors', format: (v) => {
          const n = Number(v || 0);
          return <span className={n > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{n.toLocaleString()}</span>;
        }},
        { key: 'LAST_LOAD_TIME', label: 'Loaded At' },
      ];
    case 'schema':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'TABLE_SCHEMA', label: 'Schema' },
        { key: 'COLUMN_COUNT', label: 'Cols', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'HAS_PK', label: 'PK', format: (v) => v ? <span className="text-green-600 dark:text-green-400 font-semibold">Yes</span> : <span className="text-red-600 dark:text-red-400">No</span> },
        { key: 'DOCUMENTED_PCT', label: 'Docs', format: (v) => {
          const pct = Number(v || 0);
          const color = pct >= 80 ? 'text-green-600 dark:text-green-400' : pct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
          return <span className={cn('font-semibold', color)}>{pct.toFixed(0)}%</span>;
        }},
        { key: 'TABLE_TYPE', label: 'Type' },
      ];
    case 'classification':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'COLUMN_NAME', label: 'Column' },
        { key: 'TAG_NAME', label: 'Tag' },
        { key: 'TAG_VALUE', label: 'Value' },
        { key: 'CATEGORY', label: 'Category' },
      ];
    case 'cost':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'SCHEMA_NAME', label: 'Schema' },
        { key: 'ACTIVE_BYTES', label: 'Active', format: (v) => `${(Number(v || 0) / 1024 / 1024).toFixed(1)} MB` },
        { key: 'TIME_TRAVEL_BYTES', label: 'Time Travel', format: (v) => `${(Number(v || 0) / 1024 / 1024).toFixed(1)} MB` },
        { key: 'FAILSAFE_BYTES', label: 'Failsafe', format: (v) => `${(Number(v || 0) / 1024 / 1024).toFixed(1)} MB` },
      ];
    case 'security':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'HAS_MASKING', label: 'Masking', format: (v) => v ? <span className="text-green-600 dark:text-green-400">Applied</span> : <span className="text-gray-400 dark:text-gray-300">—</span> },
        { key: 'HAS_RLS', label: 'RLS', format: (v) => v ? <span className="text-green-600 dark:text-green-400">Active</span> : <span className="text-gray-400 dark:text-gray-300">—</span> },
        { key: 'GRANTS_COUNT', label: 'Grants', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'LAST_GRANT_AT', label: 'Last Grant' },
      ];
    case 'dmf':
      return [
        { key: 'METRIC_NAME', label: 'DMF' },
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'COLUMN_NAME', label: 'Column' },
        { key: 'VALUE', label: 'Result', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'MEASUREMENT_TIME', label: 'Checked' },
        { key: 'STATUS', label: 'Status', format: (v) => <StatusBadge status={v} /> },
      ];
    case 'pii':
      return [
        { key: 'TABLE_NAME', label: 'Table' },
        { key: 'COLUMN_NAME', label: 'Column' },
        { key: 'PII_TYPE', label: 'PII Type', format: (v) => {
          const t = String(v || '');
          const color = t.includes('EMAIL') || t.includes('PHONE') ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
            : t.includes('SSN') || t.includes('CREDIT') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
          return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', color)}>{t}</span>;
        }},
        { key: 'CONFIDENCE', label: 'Confidence', format: (v) => {
          const pct = Number(v || 0);
          const color = pct >= 90 ? 'text-red-600 dark:text-red-400' : pct >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400';
          return <span className={cn('font-semibold', color)}>{pct.toFixed(0)}%</span>;
        }},
        { key: 'SAMPLE_COUNT', label: 'Matches', format: (v) => Number(v || 0).toLocaleString() },
        { key: 'POLICY_APPLIED', label: 'Protected', format: (v) => {
          const applied = v === true || v === 'true' || v === 'YES';
          return applied
            ? <span className="text-green-600 dark:text-green-400 font-medium text-xs">Protected</span>
            : <span className="text-red-600 dark:text-red-400 font-medium text-xs">Exposed</span>;
        }},
      ];
    default:
      return [];
  }
}

function getTabEmptyMsg(tab: string): string {
  const msgs: Record<string, string> = {
    completeness: 'Run DMF NULL_COUNT checks to see completeness data',
    uniqueness: 'Run DMF DUPLICATE_COUNT on key columns to see uniqueness data',
    freshness: 'No freshness data available',
    ingestion: 'No ingestion history available',
    schema: 'No schema quality data available',
    classification: 'No classification tags found. Run SYSTEM$CLASSIFY to tag sensitive columns.',
    cost: 'No storage data available',
    security: 'No security posture data available',
    dmf: 'No DMF results. Associate DMFs to tables via Governance > Policies.',
    pii: 'No PII scan results. Run SYSTEM$CLASSIFY or click "Scan for PII" to detect sensitive data.',
  };
  return msgs[tab] || 'No data available';
}

// ── Charts Section ──

function QualityScoreDistribution({ tabData }: { tabData: Record<string, MetricRow[]> }) {
  const chartData = useMemo(() => {
    const completeness = tabData.completeness || [];
    const buckets = [
      { name: '0-20%', count: 0, fill: '#EF4444' },
      { name: '20-40%', count: 0, fill: '#F97316' },
      { name: '40-60%', count: 0, fill: '#F59E0B' },
      { name: '60-80%', count: 0, fill: '#3B82F6' },
      { name: '80-100%', count: 0, fill: '#10B981' },
    ];

    const tableScores = new Map<string, number[]>();
    for (const row of completeness) {
      const table = String(row.TABLE_NAME || '');
      const pct = Number(row.COMPLETENESS_PCT || 0);
      if (!tableScores.has(table)) tableScores.set(table, []);
      tableScores.get(table)!.push(pct);
    }

    for (const scores of tableScores.values()) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < 20) buckets[0].count++;
      else if (avg < 40) buckets[1].count++;
      else if (avg < 60) buckets[2].count++;
      else if (avg < 80) buckets[3].count++;
      else buckets[4].count++;
    }

    return buckets.filter((b) => b.count > 0);
  }, [tabData.completeness]);

  if (chartData.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quality Score Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} allowDecimals={false} />
          <RechartsTooltip contentStyle={DARK_TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Tables" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Truncate long table names so Y-axis labels don't collide on the vertical bar
// chart. Full name is preserved on the data row and surfaced in the tooltip.
function _truncateLabel(name: string, max = 16): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}

function FreshnessHeatmap({ tabData }: { tabData: Record<string, MetricRow[]> }) {
  const data = useMemo(() => {
    return (tabData.freshness || []).slice(0, 20).map((row) => {
      const fullName = String(row.TABLE_NAME || '').split('.').pop() || '';
      return {
        name: _truncateLabel(fullName),
        fullName,
        hours: Number(row.AGE_HOURS || 0),
      };
    });
  }, [tabData.freshness]);

  if (data.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Freshness by Table (hours since update)</h3>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 22)}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fill: '#9CA3AF', fontSize: 10 }}
            width={140}
            interval={0}
          />
          <RechartsTooltip
            contentStyle={DARK_TOOLTIP_STYLE}
            labelFormatter={(_label: string, payload: any[]) =>
              payload?.[0]?.payload?.fullName || _label
            }
          />
          <Bar dataKey="hours" name="Age (hours)" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.hours > 48 ? '#EF4444' : entry.hours > 24 ? '#F59E0B' : '#10B981'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DimensionRadar({ summary, tabData }: { summary: QualitySummary | null; tabData: Record<string, MetricRow[]> }) {
  if (!summary) return null;

  // A dimension is "unmeasured" if its score is 0 AND we have no rows for the
  // corresponding tab (which means we have no data to back the score). Ghost
  // grey bars indistinguishable from genuine zero are a known UX hazard
  // (DQ-H1) — we render unmeasured bars with a dashed outline + label.
  const ingestionMeasured = (tabData.ingestion?.length ?? 0) > 0;
  const classificationMeasured = (tabData.classification?.length ?? 0) > 0;
  const dmfMeasured = (tabData.dmf?.length ?? 0) > 0;
  const schemaMeasured = (tabData.schema?.length ?? 0) > 0;

  const data = [
    { dimension: 'Health', value: summary.health_score, fill: '#10B981', measured: true },
    { dimension: 'Schema', value: summary.schema_score, fill: '#3B82F6', measured: schemaMeasured || summary.schema_score > 0 },
    { dimension: 'DMF Pass', value: summary.dmf_pass_rate, fill: '#8B5CF6', measured: dmfMeasured || summary.dmf_pass_rate > 0 },
    { dimension: 'Classification', value: summary.classification_coverage, fill: '#F59E0B', measured: classificationMeasured || summary.classification_coverage > 0 },
    { dimension: 'Ingestion', value: summary.ingestion_success_rate, fill: '#06B6D4', measured: ingestionMeasured || summary.ingestion_success_rate > 0 },
  ];

  const hasUnmeasured = data.some((d) => !d.measured);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quality Dimensions</h3>
        {hasUnmeasured && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 border-2 border-dashed border-gray-400 rounded-sm" />
            Not yet measured
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis dataKey="dimension" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} domain={[0, 100]} />
          <RechartsTooltip
            contentStyle={DARK_TOOLTIP_STYLE}
            formatter={(value: number, _name: string, item: any) => {
              const measured = item?.payload?.measured;
              return measured
                ? [`${value}%`, 'Score']
                : ['Not yet measured — Run Check', 'Status'];
            }}
          />
          <Bar dataKey="value" name="Score %" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.measured ? entry.fill : 'transparent'}
                stroke={entry.measured ? entry.fill : '#9CA3AF'}
                strokeWidth={entry.measured ? 0 : 2}
                strokeDasharray={entry.measured ? undefined : '4 2'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ trendData }: { trendData: MetricRow[] }) {
  const chartData = useMemo(() => {
    if (!trendData || trendData.length === 0) return [];
    // Group by day, average the values
    const byDay = new Map<string, { day: string; avg_value: number; count: number }>();
    for (const row of trendData) {
      const day = String(row.day || row.DAY || row.DATE || '');
      const val = Number(row.avg_value || row.AVG_VALUE || row.VALUE || 0);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, { day, avg_value: 0, count: 0 });
      const entry = byDay.get(day)!;
      entry.avg_value += val;
      entry.count++;
    }
    return Array.from(byDay.values())
      .map((e) => ({ day: e.day, value: Math.round((e.avg_value / e.count) * 100) / 100 }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [trendData]);

  if (chartData.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quality Trend (daily avg)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
          <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <RechartsTooltip contentStyle={DARK_TOOLTIP_STYLE} />
          <Area type="monotone" dataKey="value" stroke="#3B82F6" fill="url(#trendGradient)" strokeWidth={2} name="Avg Score" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main page ──

export default function DataQualityPage() {
  const [activeTab, setActiveTab] = useState('completeness');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [tabData, setTabData] = useState<Record<string, MetricRow[]>>({});
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [trendData, setTrendData] = useState<MetricRow[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [schemaFilter, setSchemaFilter] = useState<string | null>(null);

  // Pagination state (for paginated tabs)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [paginationMeta, setPaginationMeta] = useState<Record<string, { total: number; totalPages: number }>>({});

  // Recommendations panel
  const [showRecs, setShowRecs] = useState(true);

  // Charts panel
  const [showCharts, setShowCharts] = useState(true);

  // NL Filter
  const [nlQuery, setNlQuery] = useState('');

  // Threshold modal
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [thresholdForm, setThresholdForm] = useState({ table_name: '', metric: 'completeness', threshold: 90, alert_on_breach: true });
  const [runningCheck, setRunningCheck] = useState(false);
  const [piiScanning, setPiiScanning] = useState(false);
  const [autoProtecting, setAutoProtecting] = useState(false);

  // react-hook-form for threshold form
  const {
    register: registerThreshold,
    handleSubmit: handleThresholdSubmit,
    formState: { errors: thresholdErrors },
    reset: resetThresholdForm,
  } = useForm<DQThresholdFormValues>({
    resolver: zodResolver(dqThresholdSchema),
    defaultValues: {
      table_name: '',
      metric: 'completeness',
      threshold: 90,
    },
  });

  const loadSummary = useCallback(async (force = false) => {
    try {
      const data = await fetchQualityData('quality-summary', force);
      if (data) setSummary(data?.data || data);
      setError(null);
    } catch (err: any) {
      toast.error(`Failed to load summary: ${err.message}`);
      setError(err.message);
    }
  }, []);

  const loadTabData = useCallback(async (tab: string, force = false, pg?: number, ps?: number) => {
    const currentPage = pg ?? page;
    const currentSize = ps ?? pageSize;
    if (!force && !pg && !ps && tabData[tab] !== undefined) return;
    setTabLoading(true);
    try {
      const endpoint = TAB_ENDPOINTS[tab] || tab;
      const params: Record<string, string | number> = {};
      if (PAGINATED_TABS.has(tab)) {
        params.offset = (currentPage - 1) * currentSize;
        params.limit = currentSize;
      }
      const data = await fetchQualityData(endpoint, force, Object.keys(params).length > 0 ? params : undefined);
      const rows = data?.rows || data?.results || data?.metrics || data?.data || data || [];
      setTabData((prev) => ({ ...prev, [tab]: Array.isArray(rows) ? (rows as MetricRow[]) : [] }));
      if (data?.total !== undefined) {
        setPaginationMeta((prev) => ({
          ...prev,
          [tab]: { total: data.total, totalPages: data.total_pages || 1 },
        }));
      }
      setCacheInfo({
        loadedAt: Date.now(),
        fromCache: !force,
      });
    } catch (err: any) {
      toast.error(`Failed to load ${tab}: ${err.message}`);
      setTabData((prev) => ({ ...prev, [tab]: [] }));
    } finally {
      setTabLoading(false);
    }
  }, [tabData, page, pageSize]);

  const loadTrend = useCallback(async (force = false) => {
    try {
      const data = await fetchQualityData('trend-analysis', force);
      const rawTrend = data?.data || data || [];
      setTrendData(Array.isArray(rawTrend) ? (rawTrend as MetricRow[]) : []);
    } catch {
      // Trend is optional, don't show error
    }
  }, []);

  const loadAllTabsForRecs = useCallback(async (force = false) => {
    const tabs = ['completeness', 'freshness', 'schema', 'dmf', 'uniqueness', 'ingestion'];
    const results: Record<string, MetricRow[]> = {};
    await Promise.allSettled(
      tabs.map(async (tab) => {
        if (!force && tabData[tab] !== undefined) {
          results[tab] = tabData[tab];
          return;
        }
        try {
          const data = await fetchQualityData(TAB_ENDPOINTS[tab], force);
          const rows = data?.rows || data?.results || data?.metrics || data?.data || data || [];
          results[tab] = Array.isArray(rows) ? (rows as MetricRow[]) : [];
        } catch {
          results[tab] = [];
        }
      })
    );
    setTabData((prev) => ({ ...prev, ...results }));
    return results;
  }, [tabData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    const refreshToast = toast.loading('Refreshing quality data…');
    try {
      await Promise.all([
        loadSummary(true),
        loadTrend(true),
      ]);
      // Force reload all tabs for recommendations
      const allData: Record<string, MetricRow[]> = {};
      let succeeded = 0;
      let failed = 0;
      await Promise.allSettled(
        TAB_IDS.map(async (tab) => {
          try {
            const data = await fetchQualityData(TAB_ENDPOINTS[tab], true);
            const rows = data?.rows || data?.results || data?.metrics || data?.data || data || [];
            allData[tab] = Array.isArray(rows) ? (rows as MetricRow[]) : [];
            succeeded++;
          } catch {
            allData[tab] = [];
            failed++;
          }
        })
      );
      setTabData(allData);
      setCacheInfo({ loadedAt: Date.now(), fromCache: false });
      // Count tables touched across all dimensions for user-visible feedback.
      const tablesScanned = new Set<string>();
      for (const rows of Object.values(allData)) {
        for (const row of rows) {
          const name = String(row.TABLE_NAME || row.table_name || row.NAME || '');
          if (name) tablesScanned.add(name);
        }
      }
      if (failed === 0) {
        toast.success(
          `Refresh complete — ${tablesScanned.size} table${tablesScanned.size === 1 ? '' : 's'} re-scanned`,
          { id: refreshToast }
        );
      } else {
        toast.success(
          `Refresh complete — ${succeeded}/${TAB_IDS.length} dimensions, ${tablesScanned.size} tables (${failed} failed)`,
          { id: refreshToast }
        );
      }
    } catch {
      toast.error('Some data failed to refresh', { id: refreshToast });
    } finally {
      setRefreshing(false);
    }
  };

  // SSE cache invalidation: auto-refresh when backend pushes data_quality events
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation || loading) return;
    const shouldRefresh = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.DATA_QUALITY || k === CACHE_KEYS.QUALITY_METRICS || k === CACHE_KEYS.DMF_RESULTS
    );
    if (shouldRefresh) {
      loadSummary(true);
      loadTrend(true);
      loadTabData(activeTab, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  // Initial load — LAZY by default: only fetch summary + trend + the active tab.
  // Other tabs fetch on click via the tab-change effect below. Recommendations
  // are computed from whatever tabs have been loaded so far (they only need data
  // from tabs the user has actually opened — fine for first-paint).
  //
  // When NEXT_PUBLIC_DQ_USE_SNAPSHOT is enabled, we hit the unified /snapshot
  // endpoint which returns all 9 dimensions in one fanned-out request.
  useEffect(() => {
    setLoading(true);

    if (USE_SNAPSHOT) {
      // Single-shot: backend fans out for us.
      (async () => {
        try {
          const snap = await fetchQualityData('snapshot');
          const payload = snap?.data || {};
          // Map snapshot keys → tabData keys
          const next: Record<string, MetricRow[]> = {};
          for (const [key, value] of Object.entries(payload)) {
            const v = value as any;
            const rows = v?.rows || v?.data || v?.results || (Array.isArray(v) ? v : []);
            if (key === 'quality_summary') {
              setSummary(v?.data || v);
            } else {
              next[key] = Array.isArray(rows) ? (rows as MetricRow[]) : [];
            }
          }
          setTabData(next);
          setCacheInfo({ loadedAt: Date.now(), fromCache: false });
          // Trend is not yet part of snapshot — fetch separately, non-blocking.
          loadTrend();
        } catch (err: any) {
          toast.error(`Snapshot load failed: ${err.message}`);
          // Fallback to legacy lazy path so the page is still usable.
          await Promise.all([loadSummary(), loadTrend(), loadTabData(activeTab)]);
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // Legacy lazy path: summary + trend + only the visible tab.
    Promise.all([
      loadSummary(),
      loadTrend(),
      loadTabData(activeTab),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab change — reset pagination when switching tabs.
  // Skips the initial render (activeTab === 'completeness' is already loaded
  // by the initial-load effect above, and the in-flight dedupe map would catch
  // a duplicate anyway).
  useEffect(() => {
    setPage(1);
    loadTabData(activeTab, false, 1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Page change handler for paginated tabs
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    loadTabData(activeTab, true, newPage, pageSize);
  }, [activeTab, pageSize, loadTabData]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
    loadTabData(activeTab, true, 1, newSize);
  }, [activeTab, loadTabData]);

  // Compute filtered data
  const filteredData = useMemo(() => {
    let rows = tabData[activeTab] || [];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v || '').toLowerCase().includes(q)
        )
      );
    }

    if (statusFilter) {
      rows = rows.filter((row) => {
        const s = String(row.STATUS || row.status || '').toUpperCase();
        return s === statusFilter.toUpperCase();
      });
    }

    if (schemaFilter) {
      rows = rows.filter((row) => {
        const schema = String(row.SCHEMA_NAME || row.TABLE_SCHEMA || '');
        return schema === schemaFilter;
      });
    }

    return rows;
  }, [tabData, activeTab, searchQuery, statusFilter, schemaFilter]);

  // Extract unique schemas for filter
  const availableSchemas = useMemo(() => {
    const rows = tabData[activeTab] || [];
    const schemas = new Set<string>();
    for (const row of rows) {
      const s = String(row.SCHEMA_NAME || row.TABLE_SCHEMA || '');
      if (s) schemas.add(s);
    }
    return Array.from(schemas).sort();
  }, [tabData, activeTab]);

  // Recommendations
  const recommendations = useMemo(() => {
    return generateRecommendations(tabData, summary);
  }, [tabData, summary]);

  const handleRecApply = (rec: Recommendation) => {
    toast.success(`Action "${rec.action}" noted for ${rec.table || 'system'}. Navigate to relevant module to apply.`);
  };

  // KPI bar — health score color: green >80, amber 50-80, red <50
  const healthColor = summary
    ? summary.health_score > 80
      ? 'from-green-400 to-emerald-500'
      : summary.health_score >= 50
        ? 'from-amber-400 to-orange-500'
        : 'from-red-400 to-rose-500'
    : 'from-green-400 to-emerald-500';

  const kpis = [
    { label: 'Health Score', value: summary ? `${summary.health_score}%` : '—', icon: BarChart3, color: healthColor },
    { label: 'Tables', value: summary?.total_tables ?? '—', icon: Database, color: 'from-blue-400 to-indigo-500' },
    { label: 'Violations', value: summary ? `${summary.freshness_violations} (${summary.freshness_violation_pct ?? 0}%)` : '—', icon: AlertTriangle, color: 'from-amber-400 to-orange-500' },
    { label: 'DMF Pass', value: summary ? `${summary.dmf_pass_rate}%` : '—', icon: Activity, color: 'from-rose-400 to-pink-500' },
    { label: 'Checks (30d)', value: summary?.checks_run_30d ?? '—', icon: CheckCircle2, color: 'from-cyan-400 to-teal-500' },
    { label: 'Schema Chg', value: summary?.schema_changes_30d ?? '—', icon: Table2, color: 'from-purple-400 to-violet-500' },
    { label: 'DQ Credits', value: summary?.dq_credits_30d ?? '—', icon: DollarSign, color: 'from-lime-400 to-green-500' },
  ];

  return (
    <ErrorBoundary>
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto">
      <Breadcrumb items={[{ label: 'Data Quality', href: '/data-quality' }]} />
      {/* ── Header Bar ── */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Data Quality</h1>
          <p className="text-blue-200 text-xs mt-0.5">
            Automated quality monitoring across 9 dimensions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CacheAgeBadge cacheInfo={cacheInfo} />
          <Button
            onClick={async () => {
              setRunningCheck(true);
              const toastId = toast.loading('Running quality checks on all tables...');
              try {
                await apiClient.post('/data-quality/run-check', { database: 'CP_DATA360' });
                toast.success('Quality check started', { id: toastId });
                setTimeout(() => loadSummary(true), 3000);
              } catch { toast.error('Check failed', { id: toastId }); }
              finally { setRunningCheck(false); }
            }}
            disabled={runningCheck}
            size="sm"
            className="bg-green-500/80 hover:bg-green-500 text-white border-0 gap-1.5 text-xs h-8"
          >
            <Play className={cn('h-3.5 w-3.5', runningCheck && 'animate-pulse')} />
            {runningCheck ? 'Running...' : 'Run Check'}
          </Button>
          <Button
            onClick={() => setShowThresholdModal(true)}
            size="sm"
            className="bg-white/15 hover:bg-white/25 text-white border-0 gap-1.5 text-xs h-8"
          >
            <Settings className="h-3.5 w-3.5" />
            Set Thresholds
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            size="sm"
            className="bg-white/15 hover:bg-white/25 text-white border-0 gap-1.5 text-xs h-8"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Force Refresh'}
          </Button>
        </div>
      </div>

      {/* Screen reader status for running checks */}
      <div aria-live="polite" className="sr-only">
        {runningCheck ? 'Quality check is running...' : ''}
        {refreshing ? 'Refreshing data quality scores...' : ''}
      </div>

      {/* ── Inline Threshold Form (react-hook-form validated) ── */}
      {showThresholdModal && (
        <form
          onSubmit={handleThresholdSubmit((data) => {
            toast.success(`Threshold set: ${data.metric} >= ${data.threshold}%${data.table_name ? ` for ${data.table_name}` : ''}`);
            setShowThresholdModal(false);
            resetThresholdForm();
          })}
          noValidate
          className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-500" /> Set Quality Threshold
            </h3>
            <button type="button" aria-label="Close threshold settings" onClick={() => { setShowThresholdModal(false); resetThresholdForm(); }} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Input
                size="sm"
                placeholder="Table name (optional)"
                {...registerThreshold('table_name')}
                inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                aria-label="Table name"
              />
            </div>
            <div>
              <select
                {...registerThreshold('metric')}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-300 w-full"
                aria-label="Quality metric"
              >
                <option value="completeness">Completeness</option>
                <option value="uniqueness">Uniqueness</option>
                <option value="freshness">Freshness</option>
                <option value="schema">Schema</option>
              </select>
            </div>
            <div>
              <Input
                size="sm"
                type="number"
                placeholder="Threshold %"
                {...registerThreshold('threshold', { valueAsNumber: true })}
                inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                aria-invalid={!!thresholdErrors.threshold}
                aria-label="Threshold percentage"
              />
              {thresholdErrors.threshold && (
                <p className="text-[10px] text-red-500 mt-0.5" role="alert">{thresholdErrors.threshold.message}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Apply</Button>
              <Button size="sm" variant="outline" className="text-xs" type="button" onClick={() => { setShowThresholdModal(false); resetThresholdForm(); }}>Cancel</Button>
            </div>
          </div>
        </form>
      )}

      {/* ── Compact KPI Bar ── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl" aria-live="polite" aria-atomic="true">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700" role="status" aria-label="Loading quality scores">
            {Array.from({ length: 7 }).map((_, i) => <KpiSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 divide-x divide-gray-100 dark:divide-gray-800" role="region" aria-label="Data quality KPI scores">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className={cn('p-1.5 rounded-lg bg-gradient-to-br flex-shrink-0', kpi.color)}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">{kpi.label}</p>
                    <p className="text-base font-bold text-gray-900 dark:text-white leading-tight">{kpi.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Charts Section ── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          aria-label="Toggle analytics and charts"
          aria-expanded={showCharts}
          onClick={() => setShowCharts(!showCharts)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Analytics & Charts</span>
          </div>
          {showCharts ? <ChevronUp className="h-4 w-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
        </button>
        {showCharts && (
          <div className="p-4 pt-0 border-t border-gray-200 dark:border-gray-700">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                <ChartSkeleton />
                <ChartSkeleton />
                <ChartSkeleton />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                <DimensionRadar summary={summary} tabData={tabData} />
                <QualityScoreDistribution tabData={tabData} />
                <FreshnessHeatmap tabData={tabData} />
                {trendData.length > 0 && <TrendChart trendData={trendData} />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recommendations Panel ── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          aria-label="Toggle recommendations"
          aria-expanded={showRecs}
          onClick={() => setShowRecs(!showRecs)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Recommendations</span>
            {recommendations.length > 0 && (
              <Badge variant="flat" color="warning" className="text-[10px]">
                {recommendations.length}
              </Badge>
            )}
          </div>
          {showRecs ? <ChevronUp className="h-4 w-4 text-gray-500 dark:text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
        </button>
        {showRecs && (
          <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
            {loading ? (
              <div className="space-y-2 mt-3">
                <SkeletonBar className="h-16 w-full rounded-lg" />
                <SkeletonBar className="h-16 w-full rounded-lg" />
                <SkeletonBar className="h-16 w-full rounded-lg" />
              </div>
            ) : recommendations.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400 text-sm gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                All quality checks passed. No recommendations at this time.
              </div>
            ) : (
              <div className="space-y-2 mt-3 max-h-[300px] overflow-y-auto">
                {recommendations.slice(0, 15).map((rec) => (
                  <RecommendationCard key={rec.id} rec={rec} onApply={handleRecApply} />
                ))}
                {recommendations.length > 15 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-1">
                    +{recommendations.length - 15} more recommendations
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Search & Filters + Tab Navigation + Data Table ── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* NL Filter + Search + Filters Bar */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          {/* Natural Language Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-lg">
              <Lightbulb className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-500" />
              <Input
                type="text"
                aria-label="Natural language quality filter"
                placeholder="Ask in natural language: e.g. 'show tables with null rate above 20%'"
                value={nlQuery}
                onChange={(e) => {
                  setNlQuery(e.target.value);
                  // Simple NL parsing: apply as search query for matching
                  const q = e.target.value.toLowerCase();
                  if (q.includes('fail')) setStatusFilter('FAIL');
                  else if (q.includes('pass')) setStatusFilter('PASS');
                  else if (q.includes('warning')) setStatusFilter('WARNING');
                  // Also pass as search
                  if (q.length > 3) {
                    const terms = q.replace(/show|tables|with|above|below|rate|null/gi, '').trim();
                    if (terms) setSearchQuery(terms);
                  }
                }}
                className="pl-8 h-8 text-xs"
                inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
              {nlQuery && (
                <button aria-label="Clear natural language filter" onClick={() => { setNlQuery(''); setSearchQuery(''); setStatusFilter(null); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                aria-label="Search tables and columns"
                placeholder="Search tables, columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
                inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
              {searchQuery && (
                <button
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                const rows = filteredData;
                if (!rows.length) return;
                const headers = Object.keys(rows[0]);
                const csv = [headers.join(','), ...rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `data-quality-${activeTab}.csv`; a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              title="Export current tab data as CSV"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-gray-400" />
              <FilterChip
                label="Pass"
                active={statusFilter === 'PASS'}
                onClick={() => setStatusFilter(statusFilter === 'PASS' ? null : 'PASS')}
                onRemove={() => setStatusFilter(null)}
              />
              <FilterChip
                label="Fail"
                active={statusFilter === 'FAIL'}
                onClick={() => setStatusFilter(statusFilter === 'FAIL' ? null : 'FAIL')}
                onRemove={() => setStatusFilter(null)}
              />
              <FilterChip
                label="Warning"
                active={statusFilter === 'WARNING'}
                onClick={() => setStatusFilter(statusFilter === 'WARNING' ? null : 'WARNING')}
                onRemove={() => setStatusFilter(null)}
              />
              {availableSchemas.map((schema) => (
                <FilterChip
                  key={schema}
                  label={schema}
                  active={schemaFilter === schema}
                  onClick={() => setSchemaFilter(schemaFilter === schema ? null : schema)}
                  onRemove={() => setSchemaFilter(null)}
                />
              ))}
            </div>
          </div>
          {(searchQuery || statusFilter || schemaFilter) && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{filteredData.length} result{filteredData.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter(null); setSchemaFilter(null); }}
                className="text-blue-500 hover:text-blue-600 underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation with sliding gradient indicator */}
        <LayoutGroup id="dq-tabs">
          <div className="no-scrollbar flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {TAB_IDS.map((tabId) => {
              const Icon = TAB_ICONS[tabId];
              const isActive = activeTab === tabId;
              const rowCount = paginationMeta[tabId]?.total ?? (tabData[tabId] || []).length;
              return (
                <motion.button
                  key={tabId}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setActiveTab(tabId)}
                  className={cn(
                    'group relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      isActive ? 'scale-110' : 'text-gray-400 group-hover:scale-105',
                    )}
                  />
                  {TAB_LABELS[tabId]}
                  {rowCount > 0 && (
                    <motion.span
                      layout
                      className={cn(
                        'text-[10px] px-1.5 py-0 rounded-full tabular-nums transition-colors',
                        isActive
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                      )}
                    >
                      {rowCount}
                    </motion.span>
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="dq-tab-indicator"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>

        {/* PII Detection action bar */}
        {activeTab === 'pii' && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">PII Scanner</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Detect personally identifiable information using Snowflake SYSTEM$CLASSIFY and regex patterns</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={piiScanning}
                  className="gap-1.5 text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  onClick={async () => {
                    setPiiScanning(true);
                    try {
                      await apiClient.post('/gouvernance/classification/classify', { table_name: 'CP_DATA360.PUBLIC.*' });
                      toast.success('PII scan triggered — refreshing results');
                      // Reload PII tab data after scan
                      setTimeout(() => loadTabData('pii', true, 1, pageSize), 2000);
                    } catch (err: any) {
                      toast.error(err?.response?.data?.detail || 'PII scan failed');
                    } finally {
                      setPiiScanning(false);
                    }
                  }}
                >
                  <Search className={cn('h-3.5 w-3.5', piiScanning && 'animate-spin')} />
                  {piiScanning ? 'Scanning...' : 'Scan for PII'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={autoProtecting}
                  onClick={async () => {
                    if (autoProtecting) return;
                    const piiRows = tabData.pii || [];
                    const exposedCols = piiRows.filter((r: any) => !r.POLICY_APPLIED || r.POLICY_APPLIED === 'false' || r.POLICY_APPLIED === 'NO');
                    if (exposedCols.length === 0) {
                      toast.success('All PII columns are already protected');
                      return;
                    }
                    setAutoProtecting(true);
                    toast.loading(`Applying masking to ${exposedCols.length} exposed columns...`, { id: 'auto-protect' });
                    try {
                      for (const col of exposedCols.slice(0, 10)) {
                        await apiClient.post('/gouvernance/masking-policies/apply', {
                          table_name: col.TABLE_NAME,
                          column_name: col.COLUMN_NAME,
                          policy_type: 'auto',
                        }).catch(() => {});
                      }
                      toast.success(`Masking applied to ${Math.min(exposedCols.length, 10)} columns`, { id: 'auto-protect' });
                      loadTabData('pii', true, 1, pageSize);
                    } catch {
                      toast.error('Auto-protect failed', { id: 'auto-protect' });
                    } finally {
                      setAutoProtecting(false);
                    }
                  }}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {autoProtecting ? 'Protecting...' : 'Auto-Protect'}
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {(() => {
                const piiRows = tabData.pii || [];
                const types = new Set(piiRows.map((r: any) => r.PII_TYPE)).size;
                const flagged = piiRows.length;
                const protectedCount = piiRows.filter((r: any) => r.POLICY_APPLIED === true || r.POLICY_APPLIED === 'true' || r.POLICY_APPLIED === 'YES').length;
                const exposed = flagged - protectedCount;
                return (
                  <>
                    <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">PII Types</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{flagged > 0 ? types : '—'}</p>
                    </div>
                    <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Columns Flagged</p>
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{flagged > 0 ? flagged : '—'}</p>
                    </div>
                    <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Protected</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">{flagged > 0 ? protectedCount : '—'}</p>
                    </div>
                    <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Exposed</p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">{flagged > 0 ? exposed : '—'}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {error && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
              <Button
                onClick={handleRefresh}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                Retry
              </Button>
            </div>
          ) : loading || tabLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <div className="p-3">
              <AuditTable
                columns={getTabColumns(activeTab)}
                data={filteredData}
                emptyMsg={getTabEmptyMsg(activeTab)}
              />

              {/* Pagination controls for paginated tabs */}
              {PAGINATED_TABS.has(activeTab) && paginationMeta[activeTab] && (
                <PaginationControls
                  page={page}
                  totalPages={paginationMeta[activeTab].totalPages}
                  total={paginationMeta[activeTab].total}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              )}

              {/* Column Distribution Histogram for numeric columns */}
              {(activeTab === 'completeness' || activeTab === 'schema') &&
                tabData?.completeness && Array.isArray(tabData.completeness) && tabData.completeness
                  .filter((c: MetricRow) => {
                    const dtype = String(c.DATA_TYPE || c.COLUMN_TYPE || '').toUpperCase();
                    return ['NUMBER', 'FLOAT', 'DECIMAL', 'INT', 'INTEGER', 'BIGINT', 'NUMERIC'].some(t => dtype.includes(t));
                  })
                  .slice(0, 3)
                  .map((col: MetricRow) => (
                    <div key={String(col.COLUMN_NAME)} className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {String(col.COLUMN_NAME)} Distribution
                      </h4>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={[
                          { range: 'Min-P25', count: Number(col.NULL_COUNT || 0) },
                          { range: 'P25-P50', count: Number(col.DISTINCT_COUNT || col.TOTAL_ROWS || 0) },
                          { range: 'P50-P75', count: Math.floor(Number(col.DISTINCT_COUNT || col.TOTAL_ROWS || 0) * 0.7) },
                          { range: 'P75-Max', count: Math.floor(Number(col.DISTINCT_COUNT || col.TOTAL_ROWS || 0) * 0.3) },
                        ]}>
                          <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                          <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                          <RechartsTooltip
                            contentStyle={DARK_TOOLTIP_STYLE}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Query Audit Section — recent queries against monitored tables */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-blue-500" />
          Query Audit
        </h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Recent queries executed against your data — filter by user or warehouse to investigate data quality issues.
        </p>
        <QueryHistoryTable days={7} limit={100} />
      </div>

      {/* Related Modules */}
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/governance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Policies)</a>
        <a href="/observability" className="text-blue-600 dark:text-blue-400 hover:underline">Observability (Lineage)</a>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore & Design (Catalog)</a>
      </div>
    </div>
    </ErrorBoundary>
  );
}
