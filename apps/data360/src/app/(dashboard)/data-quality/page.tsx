'use client';

import Breadcrumb from '@/components/ui/Breadcrumb';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useCanPerform } from '@/hooks/useCanPerform';
import { Badge, Button, Input, Tooltip } from 'rizzui';
import {
  CheckCircle2, AlertTriangle, Database, Clock,
  Shield, DollarSign, FileSearch, BarChart3,
  RefreshCw, Upload, Table2, Tag, Fingerprint,
  Activity, Search, X, Filter,
  Lightbulb, ChevronDown, ChevronUp,
  Info, Play, Download, Plus, Link2, CalendarClock, Loader2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts';
import { cn } from '@/lib/utils';
import { motion, LayoutGroup } from 'framer-motion';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import {
  runQualityCheckOnTable,
  listDmfs,
  createCustomDmf,
  associateDmf,
  setDmfSchedule,
  type DmfDefinition,
  type QualityCheckRunResult,
} from '@/app/services/data-quality';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import MetricHelp, { type MetricHelpProps } from '@/components/ui/MetricHelp';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import AIActionFlow, { type Suggestion } from '@/app/shared/insights/AIActionFlow';
import QueryHistoryTable from '@/components/audit/QueryHistoryTable';
import SmartRightBar from './components/SmartRightBar';
import AdnHeaderBadge from '@/app/shared/score-cards/AdnHeaderBadge';
import { useProjectContext } from '@/hooks/useProjectContext';

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

// Tab → API.dataQuality.* path (Convention-1: no hardcoded endpoint strings)
const TAB_API_PATHS: Record<string, () => string> = {
  completeness:   API.dataQuality.completenessMetrics,
  uniqueness:     API.dataQuality.uniquenessMetrics,
  freshness:      API.dataQuality.freshnessMetrics,
  ingestion:      API.dataQuality.ingestionMetrics,
  schema:         API.dataQuality.schemaQuality,
  classification: API.dataQuality.classificationCoverage,
  cost:           API.dataQuality.costMetrics,
  security:       API.dataQuality.securityPosture,
  dmf:            API.dataQuality.dmfResults,
};

// Legacy suffix map kept for the fetchQualityData(endpoint, ...) call-sites that
// pass a bare suffix (snapshot, trend-analysis, quality-summary). All tab fetches
// are now routed through TAB_API_PATHS.
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

/**
 * fetchQualityData — calls apiClient with deduplication.
 * `path` must be a full relative path (e.g. API.dataQuality.qualitySummary())
 * so no hardcoded strings escape this file (Convention-1).
 */
async function fetchQualityData(path: string, forceRefresh = false, params?: Record<string, string | number>): Promise<any> {
  const queryStr = params ? '?' + new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString() : '';
  const key = `GET:${path}${queryStr}:${forceRefresh ? 'force' : 'cached'}`;

  // Reuse an in-flight identical request rather than firing a duplicate.
  // forceRefresh participates in the key so an explicit Refresh always bypasses
  // any stale promise that's mid-flight.
  const existing = _inFlight.get(key);
  if (existing) return existing;

  const headers: Record<string, string> = {};
  if (forceRefresh) headers['Cache-Control'] = 'no-cache';

  const promise = apiClient
    .get(`${path}${queryStr}`, { headers })
    .then((res) => res.data)
    .catch((err: any) => {
      const msg = err?.response?.data?.detail || err?.message || 'Request failed';
      console.error(`[DataQuality] ${path} failed:`, msg);
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
  if (s === 'FAIL' || s === 'LOAD_FAILED' || s === 'LOAD FAILED' || s === 'HAS_DUPLICATES')
    return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">{s}</span>;
  if (s === 'WARNING' || s === 'PARTIALLY_LOADED' || s === 'PARTIALLY LOADED')
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

// Map a recommendation category to the module that can act on it. Recommendations
// are diagnostic only — remediation happens in the owning module, so each card
// deep-links there rather than fake-applying an action in place.
const REC_CATEGORY_LINK: Record<string, { href: string; label: string }> = {
  Completeness: { href: '/explore-design', label: 'Open in Catalog' },
  Freshness: { href: '/observability', label: 'Open in Observability' },
  Uniqueness: { href: '/explore-design', label: 'Open in Catalog' },
  Ingestion: { href: '/observability', label: 'Open in Observability' },
  Schema: { href: '/explore-design', label: 'Open in Catalog' },
  Documentation: { href: '/explore-design', label: 'Open in Catalog' },
  DMF: { href: '/governance', label: 'Open in Governance' },
  Classification: { href: '/governance', label: 'Open in Governance' },
};

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const severityConfig = {
    critical: { color: 'danger' as const, icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' },
    warning: { color: 'warning' as const, icon: AlertTriangle, bg: 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' },
    info: { color: 'info' as const, icon: Info, bg: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' },
  };
  const cfg = severityConfig[rec.severity];
  const Icon = cfg.icon;
  const link = REC_CATEGORY_LINK[rec.category];

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
      {link && (
        <a
          href={link.href}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded h-7 px-2 flex-shrink-0 border border-blue-200 dark:border-blue-800 transition-colors"
        >
          {link.label}
        </a>
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
    if (status === 'LOAD_FAILED' || status === 'LOAD FAILED' || status === 'FAIL') {
      recs.push({
        id: `rec-${id++}`,
        severity: 'critical',
        category: 'Ingestion',
        title: `Failed ingestion for ${row.TABLE_NAME}`,
        description: `File ${row.FILE_NAME || 'unknown'} failed to load. ${Number(row.ERROR_COUNT || 0)} errors detected.`,
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

// Humanize a raw STATUS token for a detect-from-data chip label:
// LOAD_FAILED → "Load Failed". Mirrors the title-casing used by the scan-prefill
// banner so dynamically-discovered statuses read as clean labels.
function humanizeStatus(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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
  selectedRow,
  onRowClick,
}: {
  columns: { key: string; label: string; format?: (v: unknown, row: MetricRow) => React.ReactNode }[];
  data: MetricRow[];
  emptyMsg?: string;
  selectedRow?: MetricRow | null;
  onRowClick?: (row: MetricRow) => void;
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
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const isSelected = selectedRow !== undefined && selectedRow !== null &&
              String(row.TABLE_NAME ?? i) === String(selectedRow.TABLE_NAME ?? -1) &&
              String(row.COLUMN_NAME ?? '') === String(selectedRow.COLUMN_NAME ?? '');
            return (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-gray-100 dark:border-gray-800 transition-colors',
                  onRowClick ? 'cursor-pointer' : '',
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-2.5 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
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
        { key: 'ERROR_COUNT', label: 'Errors', format: (v) => {
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
    dmf: 'No DMF results yet. Associate a DMF to a table to start collecting metrics.',
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
  // Per-module project scope for the header ADN badge. Data Quality has no
  // project selector today, so this is ~always null and the badge self-hides
  // (honest — no fabricated account-level ADN). Lights up if/when this module
  // gains project scoping or a per-project DQ source ships on the backend.
  const { lastProjectId } = useProjectContext('data_quality');
  const [activeTab, setActiveTab] = useState('completeness');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [tabData, setTabData] = useState<Record<string, MetricRow[]>>({});
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [trendData, setTrendData] = useState<MetricRow[]>([]);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);

  // Server-side DMF breaches (GET /data-quality/dmf/breaches — threshold-aware)
  const [serverBreaches, setServerBreaches] = useState<MetricRow[]>([]);

  // SmartRightBar — selected row context
  const [selectedRow, setSelectedRow] = useState<MetricRow | null>(null);
  const [rightbarData, setRightbarData] = useState<{
    dqScore: number | null;
    dmfCount: number | null;
    classificationTags: MetricRow[];
    ingestionStatus: string | null;
    owner: string | null;
    steward: string | null;
    dmfHistory: MetricRow[];
  } | null>(null);
  const [rightbarLoading, setRightbarLoading] = useState(false);

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

  // Per-tab error state — a failed fetch must render an inline error for that
  // tab, never an empty state (which is indistinguishable from "no data").
  const [tabErrors, setTabErrors] = useState<Record<string, string | null>>({});

  // ── System 2 Action-RBAC (module 'data_quality'). Registry actions:
  // run (Run Check), associate (DMF Associate), create (custom DMF), schedule.
  // Fail-open while the allow-set loads (no flash of disabled). ──
  const runPerm = useCanPerform('data_quality', 'run');
  const associatePerm = useCanPerform('data_quality', 'associate');
  const createDmfPerm = useCanPerform('data_quality', 'create');
  const schedulePerm = useCanPerform('data_quality', 'schedule');
  const canRunCheck = runPerm.allowed || runPerm.loading;
  const canAssociateDmf = associatePerm.allowed || associatePerm.loading;
  const canCreateDmf = createDmfPerm.allowed || createDmfPerm.loading;
  const canScheduleDmf = schedulePerm.allowed || schedulePerm.loading;

  // ── DMF lifecycle (no-code) — drives the ActionRail panels ──
  const dmfPanel = useActionPanel<'associate' | 'custom' | 'schedule'>();
  // Available DMF definitions (built-in + custom), loaded lazily when the rail opens.
  const [dmfDefs, setDmfDefs] = useState<DmfDefinition[] | null>(null);
  const [dmfDefsError, setDmfDefsError] = useState<string | null>(null);
  const [dmfDefsLoading, setDmfDefsLoading] = useState(false);
  // Per-action submit state.
  const [dmfSubmitting, setDmfSubmitting] = useState(false);
  const [dmfActionError, setDmfActionError] = useState<string | null>(null);
  const [dmfActionNotice, setDmfActionNotice] = useState<string | null>(null);
  // Elapsed-time ticker for long Snowflake DDL (ADD DATA METRIC FUNCTION).
  const [dmfElapsed, setDmfElapsed] = useState(0);

  // Associate form. `assocDmf` holds the *bare* DMF name; `assocDmfSource`
  // selects the schema the backend qualifies it against — built-ins live in
  // SNOWFLAKE.CORE, custom DMFs in CP_DATA360.GOUVERNANCE. The backend
  // unconditionally builds the FQN as {database}.{schema}.{name}, so a dotted
  // name would be mis-quoted; we must pass bare name + the right db/schema.
  const [assocTable, setAssocTable] = useState('');
  const [assocDmf, setAssocDmf] = useState('');
  const [assocDmfSource, setAssocDmfSource] = useState<'builtin' | 'custom'>('builtin');
  const [assocColumns, setAssocColumns] = useState('');

  // Custom DMF builder form
  const [customName, setCustomName] = useState('');
  const [customArgs, setCustomArgs] = useState('ARG_T TABLE(ARG_C STRING)');
  const [customExpr, setCustomExpr] = useState('');
  const [customComment, setCustomComment] = useState('');

  // Schedule builder form
  const [schedTable, setSchedTable] = useState('');
  const [schedMode, setSchedMode] = useState<'minutes' | 'cron' | 'trigger'>('minutes');
  const [schedMinutes, setSchedMinutes] = useState('60');
  const [schedCron, setSchedCron] = useState('0 * * * *');
  const [schedCronTz, setSchedCronTz] = useState('UTC');

  // ── Threshold form (wired to the real /run-check backend) ──
  const thresholdPanel = useActionPanel<'main'>();
  const [thTable, setThTable] = useState('');
  const [thCompletenessCols, setThCompletenessCols] = useState('');
  const [thUniquenessCols, setThUniquenessCols] = useState('');
  const [thFreshnessCol, setThFreshnessCol] = useState('');
  const [thMaxAgeHours, setThMaxAgeHours] = useState('24');
  const [thRunning, setThRunning] = useState(false);
  const [thError, setThError] = useState<string | null>(null);
  const [thResult, setThResult] = useState<QualityCheckRunResult | null>(null);
  const [thElapsed, setThElapsed] = useState(0);

  const loadSummary = useCallback(async (force = false) => {
    try {
      const data = await fetchQualityData(API.dataQuality.qualitySummary(), force);
      if (data) setSummary(data?.data || data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    }
  }, []);

  const loadTabData = useCallback(async (tab: string, force = false, pg?: number, ps?: number) => {
    const currentPage = pg ?? page;
    const currentSize = ps ?? pageSize;
    // Skip refetch only when we already hold data for the tab AND it isn't in an
    // error state — otherwise a tab that previously failed could never retry.
    if (!force && !pg && !ps && tabData[tab] !== undefined && !tabErrors[tab]) return;
    setTabLoading(true);
    setTabErrors((prev) => ({ ...prev, [tab]: null }));
    try {
      // Use typed API path from TAB_API_PATHS (Convention-1 — no hardcoded strings).
      // Fall back to legacy suffix for unknown tab keys (snapshot, etc.).
      const apiPath = TAB_API_PATHS[tab]
        ? TAB_API_PATHS[tab]()
        : `/data-quality/${TAB_ENDPOINTS[tab] || tab}`;
      const params: Record<string, string | number> = {};
      if (PAGINATED_TABS.has(tab)) {
        params.offset = (currentPage - 1) * currentSize;
        params.limit = currentSize;
      }
      const data = await fetchQualityData(apiPath, force, Object.keys(params).length > 0 ? params : undefined);
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
    } catch (err) {
      // Surface the failure as an inline per-tab error rather than swallowing it
      // into an empty state. Leave any previously loaded rows untouched.
      setTabErrors((prev) => ({
        ...prev,
        [tab]: err instanceof Error ? err.message : `Failed to load ${tab}`,
      }));
    } finally {
      setTabLoading(false);
    }
  }, [tabData, tabErrors, page, pageSize]);

  const loadTrend = useCallback(async (force = false) => {
    setTrendError(null);
    try {
      const data = await fetchQualityData(API.dataQuality.trendAnalysis(), force);
      // /trend-analysis returns { rows, dmf_trend, sources } — NOT a bare array
      // and NOT a `.data` envelope. Prefer the real per-day DMF measurement trend
      // when present, else fall back to the table-freshness proxy rows (and the
      // legacy `.data` shape) so the chart renders whenever the endpoint has data.
      const rawTrend = data?.dmf_trend?.length ? data.dmf_trend : (data?.rows || data?.data || data || []);
      setTrendData(Array.isArray(rawTrend) ? (rawTrend as MetricRow[]) : []);
    } catch (err) {
      // Trend is a supplementary chart, so its failure doesn't block the page —
      // but we surface it inline in the charts area rather than swallowing it.
      setTrendData([]);
      setTrendError(err instanceof Error ? err.message : 'Failed to load quality trend');
    }
  }, []);

  // Wire GET /data-quality/dmf/breaches — server computes threshold-aware breaches
  // (replaces the client-side STATUS=FAIL filter which misses threshold comparisons).
  const loadDmfBreaches = useCallback(async (force = false) => {
    try {
      const data = await fetchQualityData(API.dataQuality.dmfBreaches(), force);
      const rows = data?.breaches || data?.rows || data?.data || data || [];
      setServerBreaches(Array.isArray(rows) ? (rows as MetricRow[]) : []);
    } catch {
      // Non-blocking — falls back to client-side breach filter below.
      setServerBreaches([]);
    }
  }, []);

  // Load SmartRightBar data when a row is selected
  const loadRightbarData = useCallback(async (row: MetricRow) => {
    const tableName = String(row.TABLE_NAME || row.table_name || '');
    if (!tableName) { setRightbarData(null); return; }
    setRightbarLoading(true);
    try {
      // Fan-out: DQ score from summary, DMF count from dmf tab, classification from classification tab,
      // ingestion from ingestion tab, ownership from catalog endpoint
      const [ownershipResp, ingestionResp] = await Promise.allSettled([
        apiClient.get(API.catalog.tableOwnership('CP_DATA360', String(row.SCHEMA_NAME || row.TABLE_SCHEMA || 'PUBLIC'), tableName)).then(r => r.data).catch(() => null),
        apiClient.get(API.dataQuality.ingestionMetrics()).then(r => r.data).catch(() => null),
      ]);
      const ownershipData = ownershipResp.status === 'fulfilled' ? ownershipResp.value : null;
      const ingestionData = ingestionResp.status === 'fulfilled' ? ingestionResp.value : null;

      // DMF history: last 5 results for this table from the already-loaded dmf tab
      const dmfRows = (tabData.dmf || []).filter(r => String(r.TABLE_NAME || '') === tableName).slice(-5);
      // Classification tags for this table
      const classRows = (tabData.classification || []).filter(r => String(r.TABLE_NAME || '') === tableName);
      // Ingestion last status
      const ingRows = Array.isArray(ingestionData?.rows || ingestionData?.data || ingestionData)
        ? (ingestionData?.rows || ingestionData?.data || ingestionData || []) as MetricRow[]
        : [];
      const tableIngestion = ingRows.find(r => String(r.TABLE_NAME || '') === tableName);

      // DQ score — approximate from summary
      const dmfTotal = (tabData.dmf || []).filter(r => String(r.TABLE_NAME || '') === tableName).length;
      const dmfPass = (tabData.dmf || []).filter(r => String(r.TABLE_NAME || '') === tableName && String(r.STATUS ?? '').toUpperCase() === 'PASS').length;
      const dqScore = dmfTotal > 0 ? Math.round((dmfPass / dmfTotal) * 100) : null;

      setRightbarData({
        dqScore,
        dmfCount: dmfTotal,
        classificationTags: classRows,
        ingestionStatus: tableIngestion ? String(tableIngestion.STATUS || tableIngestion.status || '—') : '—',
        owner: ownershipData?.owner || ownershipData?.data_owner || null,
        steward: ownershipData?.steward || ownershipData?.data_steward || null,
        dmfHistory: dmfRows,
      });
    } finally {
      setRightbarLoading(false);
    }
  }, [tabData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([
        loadSummary(true),
        loadTrend(true),
        loadDmfBreaches(true),
      ]);
      // Force reload every dimension so the KPI bar, charts and recommendations
      // all reflect fresh data. Per-tab failures land in tabErrors so the
      // affected tab renders an inline error instead of a misleading empty state.
      const nextData: Record<string, MetricRow[]> = {};
      const nextErrors: Record<string, string | null> = {};
      await Promise.allSettled(
        TAB_IDS.map(async (tab) => {
          try {
            const apiPath = TAB_API_PATHS[tab] ? TAB_API_PATHS[tab]() : `/data-quality/${TAB_ENDPOINTS[tab]}`;
            const data = await fetchQualityData(apiPath, true);
            const rows = data?.rows || data?.results || data?.metrics || data?.data || data || [];
            nextData[tab] = Array.isArray(rows) ? (rows as MetricRow[]) : [];
            nextErrors[tab] = null;
          } catch (err) {
            nextErrors[tab] = err instanceof Error ? err.message : `Failed to load ${tab}`;
          }
        })
      );
      // Merge so tabs that failed retain any previously loaded rows.
      setTabData((prev) => ({ ...prev, ...nextData }));
      setTabErrors((prev) => ({ ...prev, ...nextErrors }));
      setCacheInfo({ loadedAt: Date.now(), fromCache: false });
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
      loadDmfBreaches(true);
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
          const snap = await fetchQualityData(API.dataQuality.snapshot());
          const payload: Record<string, unknown> = snap?.data || {};
          // Map snapshot keys → tabData keys
          const next: Record<string, MetricRow[]> = {};
          for (const [key, value] of Object.entries(payload)) {
            const v = (value ?? {}) as { rows?: unknown; data?: unknown; results?: unknown };
            const rows = v.rows || v.data || v.results || (Array.isArray(value) ? value : []);
            if (key === 'quality_summary') {
              setSummary((v.data || value) as QualitySummary);
            } else {
              next[key] = Array.isArray(rows) ? (rows as MetricRow[]) : [];
            }
          }
          setTabData(next);
          setCacheInfo({ loadedAt: Date.now(), fromCache: false });
          // Trend is not yet part of snapshot — fetch separately, non-blocking.
          loadTrend();
        } catch {
          // Snapshot is an optional optimization; on failure fall back to the
          // legacy lazy path, which surfaces its own inline errors per section.
          await Promise.all([loadSummary(), loadTrend(), loadDmfBreaches(), loadTabData(activeTab)]);
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // Legacy lazy path: summary + trend + DMF breaches + only the visible tab.
    Promise.all([
      loadSummary(),
      loadTrend(),
      loadDmfBreaches(),
      loadTabData(activeTab),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load SmartRightBar data when selection changes
  useEffect(() => {
    if (!selectedRow) { setRightbarData(null); return; }
    void loadRightbarData(selectedRow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow]);

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

  // ── DMF lifecycle handlers ──

  // Lazily load DMF definitions for the Associate picker the first time the
  // rail opens. Degrades to an inline error (route may 404 until deploy).
  const loadDmfDefs = useCallback(async () => {
    if (dmfDefs !== null || dmfDefsLoading) return;
    setDmfDefsLoading(true);
    setDmfDefsError(null);
    try {
      const defs = await listDmfs();
      setDmfDefs(defs);
    } catch (err) {
      setDmfDefsError(err instanceof Error ? err.message : 'Failed to load DMF definitions');
    } finally {
      setDmfDefsLoading(false);
    }
  }, [dmfDefs, dmfDefsLoading]);

  const openDmfPanel = useCallback((which: 'associate' | 'custom' | 'schedule') => {
    setDmfActionError(null);
    setDmfActionNotice(null);
    thresholdPanel.close(); // only one right-rail open at a time
    dmfPanel.open(which);
    if (which === 'associate' || which === 'custom') void loadDmfDefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDmfDefs]);

  // Elapsed timer while a DMF DDL action runs (visible feedback for long
  // Snowflake operations).
  useEffect(() => {
    if (!dmfSubmitting) { setDmfElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setDmfElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [dmfSubmitting]);

  useEffect(() => {
    if (!thRunning) { setThElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setThElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [thRunning]);

  const handleAssociateDmf = useCallback(async () => {
    setDmfActionError(null);
    setDmfActionNotice(null);
    const table = assocTable.trim();
    const dmf = assocDmf.trim();
    const cols = assocColumns.split(',').map((c) => c.trim()).filter(Boolean);
    if (!table || !dmf || cols.length === 0) {
      setDmfActionError('Table, DMF and at least one column are required.');
      return;
    }
    // Built-ins resolve under SNOWFLAKE.CORE; custom DMFs under the governance
    // schema. The backend qualifies as {database}.{schema}.{name}, so pass the
    // bare name and the matching schema.
    const dbSchema = assocDmfSource === 'builtin'
      ? { database: 'SNOWFLAKE', schema: 'CORE' }
      : { database: 'CP_DATA360', schema: 'GOUVERNANCE' };
    setDmfSubmitting(true);
    try {
      // Built-in single-argument DMFs (NULL_COUNT, etc.) accept ONE column per
      // ADD statement, so associate each column individually — this also works
      // for custom single-arg DMFs and yields clear per-column errors.
      const failures: string[] = [];
      for (const col of cols) {
        try {
          await associateDmf({ table_fqn: table, dmf_name: dmf, columns: [col], ...dbSchema });
        } catch (err) {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          failures.push(`${col}: ${detail || (err instanceof Error ? err.message : 'failed')}`);
        }
      }
      const ok = cols.length - failures.length;
      if (failures.length > 0) {
        setDmfActionError(
          `Associated ${ok}/${cols.length} columns. ${failures[0]}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ''}`,
        );
      } else {
        setDmfActionNotice(`Associated ${dmf} with ${ok} column${ok > 1 ? 's' : ''} on ${table}.`);
        setAssocColumns('');
      }
      // DMF results refresh once Snowflake begins evaluating.
      setTimeout(() => loadTabData('dmf', true), 2500);
    } finally {
      setDmfSubmitting(false);
    }
  }, [assocTable, assocDmf, assocDmfSource, assocColumns, loadTabData]);

  const handleCreateCustomDmf = useCallback(async () => {
    setDmfActionError(null);
    setDmfActionNotice(null);
    const name = customName.trim();
    const args = customArgs.trim();
    const expr = customExpr.trim();
    if (!name || !args || !expr) {
      setDmfActionError('Name, table argument signature and SQL expression are required.');
      return;
    }
    setDmfSubmitting(true);
    try {
      await createCustomDmf({
        name,
        table_args: args,
        expression: expr,
        comment: customComment.trim() || undefined,
      });
      setDmfActionNotice(`Custom DMF "${name}" created. It now appears in the Associate picker.`);
      // Refresh the definitions list so the new DMF is selectable.
      setDmfDefs(null);
      void loadDmfDefs();
    } catch (err) {
      setDmfActionError(err instanceof Error ? err.message : 'Failed to create custom DMF');
    } finally {
      setDmfSubmitting(false);
    }
  }, [customName, customArgs, customExpr, customComment, loadDmfDefs]);

  // Build the raw Snowflake schedule clause from the no-code builder state.
  const buildScheduleClause = useCallback((): string => {
    if (schedMode === 'trigger') return 'TRIGGER_ON_CHANGES';
    if (schedMode === 'cron') return `USING CRON ${schedCron.trim()} ${schedCronTz.trim() || 'UTC'}`;
    return `${parseInt(schedMinutes, 10) || 60} MINUTE`;
  }, [schedMode, schedCron, schedCronTz, schedMinutes]);

  const handleSetSchedule = useCallback(async () => {
    setDmfActionError(null);
    setDmfActionNotice(null);
    const table = schedTable.trim();
    if (!table) {
      setDmfActionError('A fully-qualified table name is required.');
      return;
    }
    if (schedMode === 'minutes' && (!schedMinutes || parseInt(schedMinutes, 10) <= 0)) {
      setDmfActionError('Minutes interval must be a positive number.');
      return;
    }
    if (schedMode === 'cron' && !schedCron.trim()) {
      setDmfActionError('A cron expression is required.');
      return;
    }
    setDmfSubmitting(true);
    try {
      const clause = buildScheduleClause();
      await setDmfSchedule(table, clause);
      setDmfActionNotice(`Schedule set on ${table}: ${clause}`);
      setTimeout(() => loadTabData('dmf', true), 2000);
    } catch (err) {
      setDmfActionError(err instanceof Error ? err.message : 'Failed to set DMF schedule');
    } finally {
      setDmfSubmitting(false);
    }
  }, [schedTable, schedMode, schedMinutes, schedCron, buildScheduleClause, loadTabData]);

  // ── Threshold check handler — wired to the real /data-quality/run-check ──
  const handleRunThresholdCheck = useCallback(async () => {
    setThError(null);
    setThResult(null);
    const table = thTable.trim();
    if (!table) {
      setThError('A fully-qualified table name (DB.SCHEMA.TABLE) is required.');
      return;
    }
    const completeness = thCompletenessCols.split(',').map((c) => c.trim()).filter(Boolean);
    const uniqueness = thUniquenessCols.split(',').map((c) => c.trim()).filter(Boolean);
    const freshnessCol = thFreshnessCol.trim();
    if (completeness.length === 0 && uniqueness.length === 0 && !freshnessCol) {
      setThError('Configure at least one check: completeness, uniqueness, or freshness.');
      return;
    }
    setThRunning(true);
    try {
      const result = await runQualityCheckOnTable({
        table,
        ...(completeness.length ? { completeness_checks: completeness } : {}),
        ...(uniqueness.length ? { uniqueness_checks: uniqueness } : {}),
        ...(freshnessCol
          ? { freshness_config: { column: freshnessCol, max_age_hours: parseInt(thMaxAgeHours, 10) || 24 } }
          : {}),
      });
      setThResult(result);
    } catch (err) {
      setThError(err instanceof Error ? err.message : 'Quality check failed');
    } finally {
      setThRunning(false);
    }
  }, [thTable, thCompletenessCols, thUniquenessCols, thFreshnessCol, thMaxAgeHours]);

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

  // Extract unique STATUS values for filter — detect-from-data, mirroring
  // availableSchemas. This replaces the lone static Pass/Fail/Warning triplet:
  // status chips now surface only on tabs whose rows actually carry a STATUS
  // column (uniqueness / ingestion / dmf) and reflect the real values present
  // (e.g. Loaded, Load Failed, Has Duplicates) instead of a hardcoded guess.
  const availableStatuses = useMemo(() => {
    const rows = tabData[activeTab] || [];
    const statuses = new Set<string>();
    for (const row of rows) {
      const s = String(row.STATUS ?? row.status ?? '').toUpperCase();
      if (s) statuses.add(s);
    }
    return Array.from(statuses).sort();
  }, [tabData, activeTab]);

  // Recommendations
  const recommendations = useMemo(() => {
    return generateRecommendations(tabData, summary);
  }, [tabData, summary]);

  // ── DMF threshold breaches ──
  // Prefer server-side breaches from GET /data-quality/dmf/breaches (threshold-aware).
  // Falls back to client-side STATUS=FAIL filter when the backend endpoint is not
  // yet deployed (InsightActionButton auto-disables on 404/501 — same pattern).
  const dmfBreaches = useMemo(() => {
    if (serverBreaches.length > 0) return serverBreaches;
    const rows = tabData.dmf || [];
    return rows.filter((r) => String(r.STATUS ?? '').toUpperCase() === 'FAIL');
  }, [serverBreaches, tabData.dmf]);

  // KPI bar — health score color: green >80, amber 50-80, red <50
  const healthColor = summary
    ? summary.health_score > 80
      ? 'from-green-400 to-emerald-500'
      : summary.health_score >= 50
        ? 'from-amber-400 to-orange-500'
        : 'from-red-400 to-rose-500'
    : 'from-green-400 to-emerald-500';

  // Violations badge color & CTA state — a non-zero count is a "bad" state, so
  // surface a "Review breaches" CTA jumping straight to the freshness tab.
  const violationCount = summary?.freshness_violations ?? 0;

  const kpis: {
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    help?: MetricHelpProps;
    cta?: { label: string; onClick: () => void };
  }[] = [
    {
      label: 'Health Score',
      value: summary ? `${summary.health_score}%` : '—',
      icon: BarChart3,
      color: healthColor,
      help: {
        title: 'Quality Score',
        definition: 'Weighted pass-rate across all data metric checks — the headline indicator of overall data health.',
        source: 'data metric functions',
        goodRange: '> 80%',
      },
    },
    {
      label: 'Tables',
      value: summary?.total_tables ?? '—',
      icon: Database,
      color: 'from-blue-400 to-indigo-500',
      help: {
        title: 'Monitored Tables',
        definition: 'Number of tables currently under quality monitoring across all dimensions.',
        source: 'data warehouse metadata',
      },
    },
    {
      label: 'Violations',
      value: summary ? `${summary.freshness_violations}${summary.freshness_violation_pct != null ? ` (${summary.freshness_violation_pct}%)` : ''}` : '—',
      icon: AlertTriangle,
      color: 'from-amber-400 to-orange-500',
      help: {
        title: 'Violations',
        definition: 'Checks breaching their freshness threshold — tables whose time since last successful load exceeds the configured SLA.',
        source: 'freshness checks',
        goodRange: '0 violations',
      },
      ...(violationCount > 0
        ? { cta: { label: 'Review breaches', onClick: () => setActiveTab('freshness') } }
        : {}),
    },
    {
      label: 'DMF Pass',
      value: summary ? `${summary.dmf_pass_rate}%` : '—',
      icon: Activity,
      color: 'from-rose-400 to-pink-500',
      help: {
        title: 'Completeness & Check Pass Rate',
        definition: 'Share of data metric checks that pass their thresholds, including completeness (% non-null across monitored columns).',
        source: 'data metric functions',
        goodRange: '> 95%',
      },
    },
    {
      label: 'Checks (30d)',
      value: summary?.checks_run_30d ?? '—',
      icon: CheckCircle2,
      color: 'from-cyan-400 to-teal-500',
      help: {
        title: 'Freshness',
        definition: 'Quality checks executed in the last 30 days; freshness measures time since each table’s last successful load versus its SLA.',
        source: 'metering history',
      },
    },
    { label: 'Schema Chg', value: summary?.schema_changes_30d ?? '—', icon: Table2, color: 'from-purple-400 to-violet-500' },
    { label: 'DQ Credits', value: summary?.dq_credits_30d ?? '—', icon: DollarSign, color: 'from-lime-400 to-green-500' },
  ];

  return (
    <ErrorBoundary>
    {/* 14:6 main+rightbar layout */}
    <div className="flex gap-0 min-h-screen">
    <div className="flex-1 min-w-0 p-4 space-y-4">
      <Breadcrumb items={[{ label: 'Data Quality', href: '/data-quality' }]} />
      {/* ── Header Bar ── */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Data Quality</h1>
          <p className="text-blue-200 text-xs mt-0.5">
            Automated quality monitoring across 9 dimensions
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* R6 — compact 5-axis ADN strip (per-project, honest "—" for unprovisioned axes) */}
          <AdnHeaderBadge projectId={lastProjectId} />
          <CacheAgeBadge cacheInfo={cacheInfo} />
          <Button
            onClick={() => { setThError(null); setThResult(null); dmfPanel.close(); thresholdPanel.open('main'); }}
            disabled={!canRunCheck}
            title={!canRunCheck ? 'You lack the "run" permission on data quality. Ask an administrator to grant it.' : undefined}
            size="sm"
            className="bg-green-500/80 hover:bg-green-500 text-white border-0 gap-1.5 text-xs h-8"
          >
            <Play className="h-3.5 w-3.5" />
            Run Check
          </Button>
          <Button
            onClick={() => openDmfPanel('associate')}
            disabled={!canAssociateDmf}
            title={!canAssociateDmf ? 'You lack the "associate" permission on data quality. Ask an administrator to grant it.' : undefined}
            size="sm"
            className="bg-white/15 hover:bg-white/25 text-white border-0 gap-1.5 text-xs h-8"
          >
            <Link2 className="h-3.5 w-3.5" />
            Associate DMF
          </Button>
          <Button
            onClick={() => openDmfPanel('custom')}
            disabled={!canCreateDmf}
            title={!canCreateDmf ? 'You lack the "create" permission on data quality. Ask an administrator to grant it.' : undefined}
            size="sm"
            className="bg-white/15 hover:bg-white/25 text-white border-0 gap-1.5 text-xs h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            Custom DMF
          </Button>
          <Button
            onClick={() => openDmfPanel('schedule')}
            disabled={!canScheduleDmf}
            title={!canScheduleDmf ? 'You lack the "schedule" permission on data quality. Ask an administrator to grant it.' : undefined}
            size="sm"
            className="bg-white/15 hover:bg-white/25 text-white border-0 gap-1.5 text-xs h-8"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Schedule
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
        {thRunning ? 'Quality check is running...' : ''}
        {dmfSubmitting ? 'Applying DMF change...' : ''}
        {refreshing ? 'Refreshing data quality scores...' : ''}
      </div>

      {/* Inline error for the quality summary fetch (drives the KPI bar) */}
      {error && !loading && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-700 dark:text-red-400">Couldn&apos;t load quality summary</p>
            <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>
          </div>
          <Button
            onClick={() => loadSummary(true)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7"
          >
            Retry
          </Button>
        </div>
      )}

      {/* DMF lifecycle action result banner (associate / custom / schedule) */}
      {dmfActionNotice && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
          <p className="flex-1 min-w-0 text-xs text-green-700 dark:text-green-400 break-words">{dmfActionNotice}</p>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setDmfActionNotice(null)}
            className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30"
          >
            <X className="h-3.5 w-3.5 text-green-500" />
          </button>
        </div>
      )}

      {/* Threshold breach alert — surfaced prominently so violations aren't buried */}
      {!loading && dmfBreaches.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-700 dark:text-red-400">
              {dmfBreaches.length} DMF threshold {dmfBreaches.length === 1 ? 'breach' : 'breaches'} detected
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 break-words">
              {dmfBreaches.slice(0, 3).map((b) => `${String(b.METRIC_NAME ?? '?')} on ${String(b.TABLE_NAME ?? '?')}`).join('; ')}
              {dmfBreaches.length > 3 ? ` (+${dmfBreaches.length - 3} more)` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('dmf')}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded h-7 px-2 hover:bg-red-100 dark:hover:bg-red-900/30 flex-shrink-0"
          >
            View DMF results
          </button>
        </div>
      )}

      {/* AI flow: discussion → proposed action → execute → capitalize as an event.
          Rule-based (no LLM call): when breaches exist, propose scheduling a recurring
          quality check. The action route is a backend gap — InsightActionButton
          self-disables on 404/501 until it ships. */}
      {!loading && dmfBreaches.length > 0 && (
        <AIActionFlow
          title="Recommended next steps"
          context={{
            module: 'data_quality',
            entityType: 'dmf_breaches',
            entityId: 'dashboard',
            data: { breachCount: dmfBreaches.length },
          }}
          suggestions={
            [
              {
                id: 'dq-schedule-check',
                title: 'Schedule a recurring quality check',
                rationale: `${dmfBreaches.length} threshold ${dmfBreaches.length === 1 ? 'breach is' : 'breaches are'} active. A scheduled DMF check catches regressions early instead of waiting for a manual run.`,
                action: {
                  label: 'Schedule check',
                  endpoint: API.dataQuality.dmfSchedule(),
                  method: 'POST',
                  payload: { cadence: 'daily', source: 'ai_action_flow' },
                  cost: '~1 credit/run',
                  risk: 'low — creates a scheduled task, no data change',
                },
              },
            ] satisfies Suggestion[]
          }
        />
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
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">{kpi.label}</p>
                      {kpi.help && <MetricHelp {...kpi.help} />}
                    </div>
                    <p className="text-base font-bold text-gray-900 dark:text-white leading-tight">{kpi.value}</p>
                    {kpi.cta && (
                      <button
                        onClick={kpi.cta.onClick}
                        className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                      >
                        {kpi.cta.label} →
                      </button>
                    )}
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
                {trendError && (
                  <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                    <span className="break-words">Quality trend unavailable — {trendError}</span>
                  </div>
                )}
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
                  <RecommendationCard key={rec.id} rec={rec} />
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
        {/* Search + Filters Bar */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
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
              {(availableStatuses.length > 0 || availableSchemas.length > 0) && (
                <Filter className="h-3.5 w-3.5 text-gray-400" />
              )}
              {availableStatuses.map((status) => (
                <FilterChip
                  key={status}
                  label={humanizeStatus(status)}
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  onRemove={() => setStatusFilter(null)}
                />
              ))}
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

        {/* DMF lifecycle action bar — shown on the DMF Results tab */}
        {activeTab === 'dmf' && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-violet-50/50 dark:bg-violet-900/10">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <FileSearch className="h-5 w-5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Data Metric Functions</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Associate built-in or custom DMFs to tables, then schedule continuous evaluation — no SQL required.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => openDmfPanel('associate')} disabled={!canAssociateDmf} title={!canAssociateDmf ? 'You lack the "associate" permission on data quality. Ask an administrator to grant it.' : undefined}>
                  <Link2 className="h-3.5 w-3.5" /> Associate
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => openDmfPanel('custom')} disabled={!canCreateDmf} title={!canCreateDmf ? 'You lack the "create" permission on data quality. Ask an administrator to grant it.' : undefined}>
                  <Plus className="h-3.5 w-3.5" /> Custom DMF
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => openDmfPanel('schedule')} disabled={!canScheduleDmf} title={!canScheduleDmf ? 'You lack the "schedule" permission on data quality. Ask an administrator to grant it.' : undefined}>
                  <CalendarClock className="h-3.5 w-3.5" /> Schedule
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content — loading / inline error / empty / data, in that order */}
        <div className="min-h-[300px]">
          {loading || tabLoading ? (
            <TableSkeleton rows={8} />
          ) : tabErrors[activeTab] ? (
            <div role="alert" className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Failed to load {TAB_LABELS[activeTab]}</p>
              <p className="max-w-md text-center text-xs text-red-600 dark:text-red-400 break-words">{tabErrors[activeTab]}</p>
              <Button
                onClick={() => loadTabData(activeTab, true, page, pageSize)}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                Retry
              </Button>
            </div>
          ) : (
            <div className="p-3">
              <AuditTable
                columns={getTabColumns(activeTab)}
                data={filteredData}
                emptyMsg={getTabEmptyMsg(activeTab)}
                selectedRow={selectedRow}
                onRowClick={(row) => setSelectedRow(selectedRow &&
                  String(row.TABLE_NAME ?? '') === String(selectedRow.TABLE_NAME ?? '') &&
                  String(row.COLUMN_NAME ?? '') === String(selectedRow.COLUMN_NAME ?? '')
                    ? null : row
                )}
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

      {/* ── DMF lifecycle ActionRail — non-blocking; the dashboard stays visible ── */}
      <ActionRail
        isOpen={dmfPanel.isOpen}
        onClose={dmfPanel.close}
        accentClassName="bg-violet-500"
        title={
          dmfPanel.panel === 'associate' ? 'Associate a DMF'
            : dmfPanel.panel === 'custom' ? 'Build a custom DMF'
              : 'Schedule DMF evaluation'
        }
        description={
          dmfPanel.panel === 'associate' ? 'Attach a Data Metric Function to one or more table columns.'
            : dmfPanel.panel === 'custom' ? 'Define a SQL-expression metric, then associate it from the picker.'
              : 'Choose how often the analytics engine re-evaluates DMFs on a table.'
        }
        footer={
          <>
            <Button variant="outline" size="sm" onClick={dmfPanel.close} disabled={dmfSubmitting}>Cancel</Button>
            <Button
              size="sm"
              disabled={dmfSubmitting}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={
                dmfPanel.panel === 'associate' ? handleAssociateDmf
                  : dmfPanel.panel === 'custom' ? handleCreateCustomDmf
                    : handleSetSchedule
              }
            >
              {dmfSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {dmfSubmitting
                ? `Working… ${dmfElapsed}s`
                : dmfPanel.panel === 'associate' ? 'Associate'
                  : dmfPanel.panel === 'custom' ? 'Create DMF'
                    : 'Set schedule'}
            </Button>
          </>
        }
      >
        {/* Shared inline action feedback */}
        {dmfActionError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-red-600 dark:text-red-400 break-words">{dmfActionError}</p>
          </div>
        )}
        {dmfActionNotice && !dmfActionError && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-green-700 dark:text-green-400 break-words">{dmfActionNotice}</p>
          </div>
        )}

        {/* DMF definitions load error (Associate / Custom pickers) */}
        {(dmfPanel.panel === 'associate' || dmfPanel.panel === 'custom') && dmfDefsError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-700 dark:text-amber-400 break-words">Couldn&apos;t load DMF list — {dmfDefsError}</p>
              <button onClick={() => { setDmfDefs(null); void loadDmfDefs(); }} className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400 underline">Retry</button>
            </div>
          </div>
        )}

        {/* ── Associate panel ── */}
        {dmfPanel.panel === 'associate' && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Table (DB.SCHEMA.TABLE)</span>
              <Input value={assocTable} onChange={(e) => setAssocTable(e.target.value)} placeholder="CP_DATA360.PUBLIC.ORDERS" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Data Metric Function</span>
              {dmfDefsLoading ? (
                <SkeletonBar className="mt-1 h-8 w-full" />
              ) : (
                <select
                  value={assocDmf ? `${assocDmfSource}:${assocDmf}` : ''}
                  onChange={(e) => {
                    const [src, ...rest] = e.target.value.split(':');
                    if (!e.target.value) { setAssocDmf(''); return; }
                    setAssocDmfSource(src === 'custom' ? 'custom' : 'builtin');
                    setAssocDmf(rest.join(':'));
                  }}
                  className="mt-1 w-full h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs text-gray-700 dark:text-gray-200"
                >
                  <option value="">Select a DMF…</option>
                  <optgroup label="Built-in">
                    {['NULL_COUNT', 'DUPLICATE_COUNT', 'UNIQUE_COUNT', 'ROW_COUNT', 'NULL_PERCENT', 'FRESHNESS', 'BLANK_COUNT'].map((n) => (
                      <option key={n} value={`builtin:${n}`}>{n}</option>
                    ))}
                  </optgroup>
                  {dmfDefs && dmfDefs.length > 0 && (
                    <optgroup label="Custom (CP_DATA360.GOUVERNANCE)">
                      {dmfDefs.map((d) => (
                        <option key={d.name} value={`custom:${d.name}`}>{d.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Columns (comma-separated)</span>
              <Input value={assocColumns} onChange={(e) => setAssocColumns(e.target.value)} placeholder="EMAIL, PHONE" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              After associating, set a schedule so the analytics engine evaluates the metric automatically.
            </p>
          </div>
        )}

        {/* ── Custom DMF builder panel ── */}
        {dmfPanel.panel === 'custom' && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">DMF name</span>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="NEGATIVE_PRICE_COUNT" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Table argument signature</span>
              <Input value={customArgs} onChange={(e) => setCustomArgs(e.target.value)} placeholder="ARG_T TABLE(ARG_C NUMBER)" className="mt-1 h-8 text-xs font-mono" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
              <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Declares the input column(s) the metric reads, e.g. <code>ARG_T TABLE(ARG_C NUMBER)</code>.</span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">SQL expression (returns NUMBER)</span>
              <textarea
                value={customExpr}
                onChange={(e) => setCustomExpr(e.target.value)}
                rows={4}
                placeholder="SELECT COUNT(*) FROM ARG_T WHERE ARG_C < 0"
                className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-200"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Comment (optional)</span>
              <Input value={customComment} onChange={(e) => setCustomComment(e.target.value)} placeholder="Counts rows with a negative price" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </label>
          </div>
        )}

        {/* ── Schedule builder panel ── */}
        {dmfPanel.panel === 'schedule' && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Table (DB.SCHEMA.TABLE)</span>
              <Input value={schedTable} onChange={(e) => setSchedTable(e.target.value)} placeholder="CP_DATA360.PUBLIC.ORDERS" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </label>
            <div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Trigger</span>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {([['minutes', 'Every N minutes'], ['cron', 'Cron'], ['trigger', 'On data change']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSchedMode(mode)}
                    className={cn(
                      'rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors',
                      schedMode === mode
                        ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-600 dark:bg-violet-900/30 dark:text-violet-300'
                        : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {schedMode === 'minutes' && (
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Interval (minutes)</span>
                <Input type="number" min={1} value={schedMinutes} onChange={(e) => setSchedMinutes(e.target.value)} className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
              </label>
            )}
            {schedMode === 'cron' && (
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 block">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Cron expression</span>
                  <Input value={schedCron} onChange={(e) => setSchedCron(e.target.value)} placeholder="0 * * * *" className="mt-1 h-8 text-xs font-mono" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Timezone</span>
                  <Input value={schedCronTz} onChange={(e) => setSchedCronTz(e.target.value)} placeholder="UTC" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
                </label>
              </div>
            )}
            {schedMode === 'trigger' && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                The analytics engine re-evaluates DMFs whenever the table&apos;s data changes (<code>TRIGGER_ON_CHANGES</code>).
              </p>
            )}
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Resulting clause</p>
              <code className="text-xs text-gray-800 dark:text-gray-200 break-all">{buildScheduleClause()}</code>
            </div>
          </div>
        )}
      </ActionRail>

      {/* ── Threshold check ActionRail — wired to /data-quality/run-check ── */}
      {/* (ActionRail portals outside the flex column — no layout change needed) */}
      <ActionRail
        isOpen={thresholdPanel.isOpen}
        onClose={thresholdPanel.close}
        accentClassName="bg-green-500"
        title="Run a threshold check"
        description="Evaluate completeness, uniqueness and freshness against thresholds on a single table."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={thresholdPanel.close} disabled={thRunning}>Close</Button>
            <Button
              size="sm"
              disabled={thRunning}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleRunThresholdCheck}
            >
              {thRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {thRunning ? `Running… ${thElapsed}s` : 'Run check'}
            </Button>
          </>
        }
      >
        {thError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-red-600 dark:text-red-400 break-words">{thError}</p>
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Table (DB.SCHEMA.TABLE)</span>
          <Input value={thTable} onChange={(e) => setThTable(e.target.value)} placeholder="CP_DATA360.PUBLIC.ORDERS" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Completeness columns (≥95% non-null)</span>
          <Input value={thCompletenessCols} onChange={(e) => setThCompletenessCols(e.target.value)} placeholder="EMAIL, NAME" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Uniqueness columns (no duplicates)</span>
          <Input value={thUniquenessCols} onChange={(e) => setThUniquenessCols(e.target.value)} placeholder="ID, ORDER_NO" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Freshness column (timestamp)</span>
            <Input value={thFreshnessCol} onChange={(e) => setThFreshnessCol(e.target.value)} placeholder="UPDATED_AT" className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Max age (h)</span>
            <Input type="number" min={1} value={thMaxAgeHours} onChange={(e) => setThMaxAgeHours(e.target.value)} className="mt-1 h-8 text-xs" inputClassName="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
          </label>
        </div>

        {/* Results — Idle → Running → Completed/Empty */}
        {thRunning ? (
          <div className="space-y-2 pt-1">
            <SkeletonBar className="h-8 w-full" />
            <SkeletonBar className="h-8 w-full" />
          </div>
        ) : thResult ? (
          thResult.checks.length === 0 ? (
            <EmptyState compact title="No checks ran" description="Configure at least one check above, then run again." />
          ) : (
            <div className="space-y-2 pt-1">
              {thResult.summary && (
                <div className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-medium',
                  thResult.summary.overall_status === 'PASS'
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/10 dark:text-green-400'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/10 dark:text-red-400',
                )}>
                  {thResult.summary.overall_status === 'PASS'
                    ? `All ${thResult.summary.total_checks} checks passed.`
                    : `${thResult.summary.failed} of ${thResult.summary.total_checks} checks breached the threshold${thResult.summary.errors ? ` (${thResult.summary.errors} errored)` : ''}.`}
                </div>
              )}
              <div className="space-y-1.5">
                {thResult.checks.map((c, i) => {
                  const s = String(c.status ?? '').toUpperCase();
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{c.check_type}{c.column ? ` · ${c.column}` : ''}</span>
                        {c.error && <p className="text-[11px] text-red-500 break-words">{c.error}</p>}
                        {c.completeness_pct !== undefined && <p className="text-[11px] text-gray-500 dark:text-gray-400">{Number(c.completeness_pct).toFixed(1)}% complete</p>}
                        {c.duplicates !== undefined && <p className="text-[11px] text-gray-500 dark:text-gray-400">{Number(c.duplicates).toLocaleString()} duplicates</p>}
                      </div>
                      <StatusBadge status={s} />
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Results appear here after you run the check. Breaches also surface as a banner on the dashboard.
          </p>
        )}
      </ActionRail>
    </div>

    {/* SmartRightBar — 8-section docked right-tab context panel (shared RightTabPanel) */}
    <SmartRightBar
      selectedRow={selectedRow}
      data={rightbarData}
      loading={rightbarLoading}
      onRunCheck={() => { setThError(null); setThResult(null); dmfPanel.close(); thresholdPanel.open('main'); }}
      onAssociateDmf={() => openDmfPanel('associate')}
      onScheduleDmf={() => openDmfPanel('schedule')}
      onClose={() => setSelectedRow(null)}
      canRunCheck={canRunCheck}
      canAssociateDmf={canAssociateDmf}
      canScheduleDmf={canScheduleDmf}
    />
    </div>
    </ErrorBoundary>
  );
}
