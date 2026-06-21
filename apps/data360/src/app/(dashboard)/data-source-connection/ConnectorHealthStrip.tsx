'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Badge, Tooltip } from 'rizzui';
import {
  HiOutlineArrowPath,
  HiOutlineClock,
  HiCheckCircle,
  HiExclamationTriangle,
  HiXCircle,
  HiQuestionMarkCircle,
} from 'react-icons/hi2';
import { Activity } from 'lucide-react';
import {
  getConnectorsHealth,
  type ConnectorHealthItem,
  type ConnectorsHealthSummary,
} from './connectionServices';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

const STATUS_STYLES: Record<ConnectorHealthItem['status'], { dot: string; chip: string; icon: React.ElementType; label: string }> = {
  healthy: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: HiCheckCircle, label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: HiExclamationTriangle, label: 'Paused' },
  down: { dot: 'bg-red-500', chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: HiXCircle, label: 'Down' },
  stale: { dot: 'bg-amber-400', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: HiOutlineClock, label: 'Stale' },
  unknown: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: HiQuestionMarkCircle, label: 'Unknown' },
};

// Show the actionable rows (down/paused) first within the display cap.
const DOT_PRIORITY: Record<ConnectorHealthItem['status'], number> = {
  down: 0, degraded: 1, stale: 2, unknown: 3, healthy: 4,
};
const MAX_DOTS = 18;

// Honesty rule: a missing / non-positive metric is undetermined, not a real 0 —
// render an em-dash rather than a fabricated "0" / "0 B" (the roll-up coerces
// absent ACCOUNT_USAGE fields to 0, so 0 here means "not reported", not "zero").
const formatNumber = (n: number): string => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Compact connector-health strip — wires `GET /connect/connectors/health`,
 * previously unconsumed by the UI. Rendered above the connector picker so users
 * see at a glance which integrations are reachable before adding a new source.
 * Connect is excluded from System-2 RBAC, so this surface is ungated.
 */
export default function ConnectorHealthStrip() {
  const [summary, setSummary] = useState<ConnectorsHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await getConnectorsHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time refresh (SSE): a stage / connector mutation (ingest, stage
  // create/delete, upload, integration change) emits a cache-invalidation event.
  // Re-probe health so a source that just changed state is not misreported until
  // the 30-min TTL expires (the health GET is account-global, not warmed).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const touched = lastInvalidation.keys.some(
      (k: string) =>
        k === CACHE_KEYS.CONNECTORS ||
        k === CACHE_KEYS.STAGES ||
        k === CACHE_KEYS.CONNECTIONS ||
        k === CACHE_KEYS.INTEGRATIONS,
    );
    if (touched) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  // Loading skeleton
  if (loading && !summary) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="h-5 w-5 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="ml-auto h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  // Error — keep it quiet (non-blocking) but actionable.
  if (error) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/20">
        <HiExclamationTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
        <span className="text-amber-700 dark:text-amber-300">Connector health unavailable: {error}</span>
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
        >
          <HiOutlineArrowPath className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  // Empty — backend reachable but reports no connectors.
  if (summary && summary.total === 0) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
        <Activity className="h-5 w-5 text-slate-400" />
        <span className="text-slate-600 dark:text-slate-400">No connectors are being monitored yet. Add a source to start tracking health.</span>
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <HiOutlineArrowPath className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const { metrics } = summary;
  const overall = summary.overall;
  const OverallIcon = STATUS_STYLES[overall].icon;
  const hasFailures =
    metrics.failed_loads_7d > 0 || metrics.row_errors_7d > 0 || metrics.tasks_failed_1d > 0;
  const showMetrics =
    metrics.files_inserted_7d > 0 || metrics.bytes_inserted_7d > 0 || metrics.active_pipes > 0 || hasFailures;
  const sortedItems = [...summary.items].sort((a, b) => DOT_PRIORITY[a.status] - DOT_PRIORITY[b.status]);
  const shownItems = sortedItems.slice(0, MAX_DOTS);
  const hiddenCount = sortedItems.length - shownItems.length;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <OverallIcon className={`h-5 w-5 ${overall === 'healthy' ? 'text-green-500' : overall === 'degraded' ? 'text-amber-500' : overall === 'down' ? 'text-red-500' : 'text-slate-400'}`} />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Connector Health</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {summary.total_pipes} pipe{summary.total_pipes === 1 ? '' : 's'} · {summary.total_stages} stage{summary.total_stages === 1 ? '' : 's'}
          </span>
        </div>

        {/* Aggregate counts */}
        <div className="flex flex-wrap items-center gap-2">
          {summary.healthy > 0 && (
            <Badge size="sm" className={STATUS_STYLES.healthy.chip}>{summary.healthy} healthy</Badge>
          )}
          {summary.degraded > 0 && (
            <Badge size="sm" className={STATUS_STYLES.degraded.chip}>{summary.degraded} paused</Badge>
          )}
          {summary.stale > 0 && (
            <Badge size="sm" className={STATUS_STYLES.stale.chip}>{summary.stale} stale</Badge>
          )}
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
        >
          <HiOutlineArrowPath className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* 7-day ingestion / load / task roll-up (source: SNOWFLAKE.ACCOUNT_USAGE) */}
      {showMetrics && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-700/60">
          <span className="inline-flex flex-wrap items-center gap-1 text-slate-600 dark:text-slate-300">
            <Activity className="h-3.5 w-3.5 text-blue-500" />
            <span className="font-medium text-slate-800 dark:text-slate-100">{formatNumber(metrics.files_inserted_7d)}</span> files ·{' '}
            <span className="font-medium text-slate-800 dark:text-slate-100">{formatBytes(metrics.bytes_inserted_7d)}</span> ingested{' '}
            <span className="text-slate-400 dark:text-slate-500">(7d)</span>
          </span>
          {metrics.active_pipes > 0 && (
            <span className="text-slate-500 dark:text-slate-400">{metrics.active_pipes} active pipe{metrics.active_pipes === 1 ? '' : 's'}</span>
          )}
          {metrics.failed_loads_7d > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
              <HiXCircle className="h-3.5 w-3.5" /> {formatNumber(metrics.failed_loads_7d)} failed load{metrics.failed_loads_7d === 1 ? '' : 's'} (7d)
            </span>
          )}
          {metrics.row_errors_7d > 0 && (
            <span className="font-medium text-red-600 dark:text-red-400">{formatNumber(metrics.row_errors_7d)} row errors (7d)</span>
          )}
          {metrics.tasks_failed_1d > 0 && (
            <span className="font-medium text-red-600 dark:text-red-400">{formatNumber(metrics.tasks_failed_1d)} task failures (24h)</span>
          )}
        </div>
      )}

      {/* Per-stage / per-pipe status dots */}
      {shownItems.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {shownItems.map((item) => {
            const style = STATUS_STYLES[item.status];
            return (
              <Tooltip
                key={item.id}
                content={`${item.kind === 'pipe' ? 'Pipe' : 'Stage'} · ${item.name} — ${style.label}${item.detail ? `: ${item.detail}` : ''}`}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  <span className="max-w-[140px] truncate">{item.name}</span>
                </span>
              </Tooltip>
            );
          })}
          {hiddenCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
