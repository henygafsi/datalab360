'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Tooltip } from 'rizzui';
import {
  HiOutlineArrowPath,
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

const STATUS_STYLES: Record<ConnectorHealthItem['status'], { dot: string; chip: string; icon: React.ElementType; label: string }> = {
  healthy: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: HiCheckCircle, label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: HiExclamationTriangle, label: 'Degraded' },
  down: { dot: 'bg-red-500', chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: HiXCircle, label: 'Down' },
  unknown: { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: HiQuestionMarkCircle, label: 'Unknown' },
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

  const overall: ConnectorHealthItem['status'] =
    summary.down > 0 ? 'down' : summary.degraded > 0 ? 'degraded' : summary.healthy > 0 ? 'healthy' : 'unknown';
  const OverallIcon = STATUS_STYLES[overall].icon;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <OverallIcon className={`h-5 w-5 ${overall === 'healthy' ? 'text-green-500' : overall === 'degraded' ? 'text-amber-500' : overall === 'down' ? 'text-red-500' : 'text-slate-400'}`} />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Connector Health</span>
        </div>

        {/* Aggregate counts */}
        <div className="flex items-center gap-2">
          {summary.healthy > 0 && (
            <Badge size="sm" className={STATUS_STYLES.healthy.chip}>{summary.healthy} healthy</Badge>
          )}
          {summary.degraded > 0 && (
            <Badge size="sm" className={STATUS_STYLES.degraded.chip}>{summary.degraded} degraded</Badge>
          )}
          {summary.down > 0 && (
            <Badge size="sm" className={STATUS_STYLES.down.chip}>{summary.down} down</Badge>
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

      {/* Per-connector dots */}
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.items.map((item) => {
          const style = STATUS_STYLES[item.status];
          return (
            <Tooltip
              key={item.id}
              content={`${item.name} — ${style.label}${item.detail ? `: ${item.detail}` : ''}`}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                <span className="max-w-[140px] truncate">{item.name}</span>
              </span>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
