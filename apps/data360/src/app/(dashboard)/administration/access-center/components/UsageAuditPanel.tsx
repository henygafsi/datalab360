'use client';

/**
 * UsageAuditPanel — the "Usage & Audit" section of the Admin command center.
 *
 * Two honest, paginated AuditTables from the admin-visibility analytics feeds
 * (EVENT_STORE.AUDIT_LOG / USER_REQUESTS):
 *   1. Request volume grouped by module / role / user (dimension toggle).
 *   2. Endpoint usage — per-route request/error/latency attribution.
 *
 * Each feed loads independently; an absent feed (404/501 on this backend) shows
 * a quiet "not wired yet" rather than a hard error. No mutations → nothing gated.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Activity, BarChart3, Route, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import {
  getEndpointUsage,
  getUsageBy,
  type EndpointUsageRow,
  type UsageByRow,
  type UsageDimension,
} from '@/app/services/admin-visibility';
import { Spinner, ErrBox } from './shared';

type Phase = 'loading' | 'ready' | 'error' | 'unavailable';

/** 404/501 = the analytics route isn't deployed on this backend yet. */
function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

function NotWired({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-[12px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
      <span className="inline-flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        {label} is not wired yet for this account — the analytics route is coming online.
      </span>
    </div>
  );
}

const DIMENSIONS: { id: UsageDimension; label: string }[] = [
  { id: 'module', label: 'By module' },
  { id: 'role', label: 'By role' },
  { id: 'user', label: 'By user' },
];

function PanelCard({
  icon: Icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: typeof Activity;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <Icon className="h-4 w-4 self-center text-[hsl(var(--primary))]" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle && <span className="text-[11px] text-slate-400">{subtitle}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function UsageAuditPanel() {
  const [dimension, setDimension] = useState<UsageDimension>('module');

  // Usage-by (re-fetched per dimension).
  const [byPhase, setByPhase] = useState<Phase>('loading');
  const [byError, setByError] = useState<string | null>(null);
  const [byRows, setByRows] = useState<UsageByRow[]>([]);

  // Endpoint usage (fetched once).
  const [epPhase, setEpPhase] = useState<Phase>('loading');
  const [epError, setEpError] = useState<string | null>(null);
  const [epRows, setEpRows] = useState<EndpointUsageRow[]>([]);
  const [epWindow, setEpWindow] = useState<number>(7);

  const loadBy = useCallback(async (dim: UsageDimension) => {
    setByPhase('loading');
    setByError(null);
    try {
      const res = await getUsageBy(dim, 7);
      setByRows(res.rows ?? []);
      setByPhase('ready');
    } catch (e) {
      if (isNotDeployed(e)) {
        setByPhase('unavailable');
      } else {
        setByError(getApiErrorMessage(e));
        setByPhase('error');
      }
    }
  }, []);

  const loadEndpoints = useCallback(async () => {
    setEpPhase('loading');
    setEpError(null);
    try {
      const res = await getEndpointUsage(7, 300);
      setEpRows(res.endpoints ?? []);
      setEpWindow(res.window_days ?? 7);
      setEpPhase('ready');
    } catch (e) {
      if (isNotDeployed(e)) {
        setEpPhase('unavailable');
      } else {
        setEpError(getApiErrorMessage(e));
        setEpPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    void loadBy(dimension);
  }, [loadBy, dimension]);

  useEffect(() => {
    void loadEndpoints();
  }, [loadEndpoints]);

  const byTableRows: Row[] = useMemo(
    () =>
      byRows.map((r) => ({
        Key: r.key,
        Requests: r.requests,
        Errors: r.errors,
        'Error rate': r.requests > 0 ? `${((r.errors / r.requests) * 100).toFixed(1)}%` : '—',
        Endpoints: r.distinct_endpoints,
      })),
    [byRows],
  );

  const epTableRows: Row[] = useMemo(
    () =>
      epRows.map((r) => ({
        Method: r.method,
        Path: r.path,
        Module: r.module || '—',
        Requests: r.count,
        Errors: r.errors,
        Users: r.distinct_users,
        'Last seen': r.last_seen,
      })),
    [epRows],
  );

  return (
    <div className="space-y-5">
      <PanelCard
        icon={BarChart3}
        title="Request volume"
        subtitle="last 7 days"
        right={
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {DIMENSIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDimension(d.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  dimension === d.id
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
      >
        {byPhase === 'loading' ? (
          <Spinner label="Loading usage…" />
        ) : byPhase === 'unavailable' ? (
          <NotWired label="Request-volume analytics" />
        ) : byPhase === 'error' ? (
          <ErrBox message={byError ?? 'Usage analytics not available'} onRetry={() => void loadBy(dimension)} />
        ) : (
          <AuditTable
            rows={byTableRows}
            columns={['Key', 'Requests', 'Errors', 'Error rate', 'Endpoints']}
            pageSize={12}
          />
        )}
      </PanelCard>

      <PanelCard
        icon={Route}
        title="Endpoint usage"
        subtitle={`top routes · last ${epWindow}d`}
      >
        {epPhase === 'loading' ? (
          <Spinner label="Loading endpoint usage…" />
        ) : epPhase === 'unavailable' ? (
          <NotWired label="Endpoint usage" />
        ) : epPhase === 'error' ? (
          <ErrBox message={epError ?? 'Endpoint usage not available'} onRetry={() => void loadEndpoints()} />
        ) : (
          <AuditTable
            rows={epTableRows}
            columns={['Method', 'Path', 'Module', 'Requests', 'Errors', 'Users', 'Last seen']}
            pageSize={15}
          />
        )}
      </PanelCard>
    </div>
  );
}
