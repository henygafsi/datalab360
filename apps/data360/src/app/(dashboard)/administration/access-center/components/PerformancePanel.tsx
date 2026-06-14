'use client';

/**
 * PerformancePanel — the "Performance" section of the Admin command center.
 *
 * A stress-test / performance-oriented view: per-module and per-endpoint
 * latency + throughput + error-rate, surfaced from the live telemetry feeds:
 *   - /admin/server-metrics           → in-process latency percentiles, hot &
 *                                        slow endpoints, recent 4xx/5xx errors.
 *   - /command-center/cross-module    → per-module query throughput + latency.
 *   - /command-center/warehouse-performance → warehouse query perf (avg/p95).
 *   - /command-center/query-intelligence    → slowest + erroring queries.
 *
 * There is NO synthetic load/stress-test harness wired for this account, so the
 * panel says so honestly and reports OBSERVED production performance instead —
 * each feed loads independently and degrades to a quiet "not wired" (404/501) or
 * "requires admin" (403) note rather than a hard error. No mutations → nothing
 * gated. Absent metrics render "—", never a fabricated 0.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Gauge,
  Layers,
  Route,
  ServerCog,
  Sparkles,
  Timer,
  Warehouse,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import { getServerMetrics, type ServerMetrics } from '@/app/services/admin-visibility';
import {
  getCrossModuleIntelligence,
  getWarehousePerformance,
  getQueryIntelligence,
} from '@/app/services/command-center';
import type {
  CrossModuleResponse,
  WarehousePerformanceResponse,
  QueryIntelligenceResponse,
} from '@/app/services/command-center/types';
import { Spinner, ErrBox } from './shared';

type Phase = 'loading' | 'ready' | 'error' | 'unavailable' | 'forbidden';

/** 404/501 = the analytics/metrics route isn't deployed on this backend yet. */
function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}
/** 403 = the caller's role can't read this admin telemetry. */
function isForbidden(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 403;
}
/** Map a thrown error to the right degraded phase. */
function phaseFor(e: unknown): Phase {
  if (isNotDeployed(e)) return 'unavailable';
  if (isForbidden(e)) return 'forbidden';
  return 'error';
}

function trunc(s: string, n = 110): string {
  const v = (s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > n ? `${v.slice(0, n)}…` : v;
}
const rate = (errors: number, total: number): string =>
  total > 0 ? `${((errors / total) * 100).toFixed(1)}%` : '—';

function NotWired({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-[12px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
      <span className="inline-flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        {label} is not wired yet for this account — the telemetry route is coming online.
      </span>
    </div>
  );
}
function NeedsAdmin({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-[12px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
      <span className="inline-flex items-center gap-2">
        <Lock className="h-4 w-4" />
        {label} requires an account-admin role to view.
      </span>
    </div>
  );
}

function PanelCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Activity;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Icon className="h-4 w-4 self-center text-[hsl(var(--primary))]" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle && <span className="text-[11px] text-slate-400">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function KpiStat({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('text-lg font-semibold', alert ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100')}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

/** A small "what state is this feed in" wrapper so each section degrades alone. */
function Feed({
  phase,
  label,
  error,
  onRetry,
  children,
}: {
  phase: Phase;
  label: string;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (phase === 'loading') return <Spinner label={`Loading ${label}…`} />;
  if (phase === 'unavailable') return <NotWired label={label} />;
  if (phase === 'forbidden') return <NeedsAdmin label={label} />;
  if (phase === 'error') return <ErrBox message={error ?? `${label} unavailable`} onRetry={onRetry} />;
  return <>{children}</>;
}

export default function PerformancePanel() {
  // ── server-metrics (live, in-process) ──────────────────────────────────────
  const [smPhase, setSmPhase] = useState<Phase>('loading');
  const [smError, setSmError] = useState<string | null>(null);
  const [sm, setSm] = useState<ServerMetrics | null>(null);

  // ── per-module performance (cross-module intelligence) ─────────────────────
  const [cmPhase, setCmPhase] = useState<Phase>('loading');
  const [cmError, setCmError] = useState<string | null>(null);
  const [cm, setCm] = useState<CrossModuleResponse | null>(null);

  // ── warehouse performance ──────────────────────────────────────────────────
  const [whPhase, setWhPhase] = useState<Phase>('loading');
  const [whError, setWhError] = useState<string | null>(null);
  const [wh, setWh] = useState<WarehousePerformanceResponse | null>(null);

  // ── query intelligence ─────────────────────────────────────────────────────
  const [qiPhase, setQiPhase] = useState<Phase>('loading');
  const [qiError, setQiError] = useState<string | null>(null);
  const [qi, setQi] = useState<QueryIntelligenceResponse | null>(null);

  const loadServerMetrics = useCallback(async () => {
    setSmPhase('loading');
    setSmError(null);
    try {
      setSm(await getServerMetrics());
      setSmPhase('ready');
    } catch (e) {
      setSmError(getApiErrorMessage(e));
      setSmPhase(phaseFor(e));
    }
  }, []);

  const loadCrossModule = useCallback(async () => {
    setCmPhase('loading');
    setCmError(null);
    try {
      setCm(await getCrossModuleIntelligence({ days: 7 }));
      setCmPhase('ready');
    } catch (e) {
      setCmError(getApiErrorMessage(e));
      setCmPhase(phaseFor(e));
    }
  }, []);

  const loadWarehouse = useCallback(async () => {
    setWhPhase('loading');
    setWhError(null);
    try {
      setWh(await getWarehousePerformance({ days: 7 }));
      setWhPhase('ready');
    } catch (e) {
      setWhError(getApiErrorMessage(e));
      setWhPhase(phaseFor(e));
    }
  }, []);

  const loadQueryIntel = useCallback(async () => {
    setQiPhase('loading');
    setQiError(null);
    try {
      setQi(await getQueryIntelligence({ days: 7 }));
      setQiPhase('ready');
    } catch (e) {
      setQiError(getApiErrorMessage(e));
      setQiPhase(phaseFor(e));
    }
  }, []);

  useEffect(() => {
    void loadServerMetrics();
    void loadCrossModule();
    void loadWarehouse();
    void loadQueryIntel();
  }, [loadServerMetrics, loadCrossModule, loadWarehouse, loadQueryIntel]);

  // ── Derived tables ─────────────────────────────────────────────────────────
  const endpointRows: Row[] = useMemo(
    () =>
      (sm?.top_endpoints ?? []).map((e) => ({
        Method: e.method,
        Endpoint: e.path,
        Requests: e.requests,
        Errors: e.errors,
        'Error rate': rate(e.errors, e.requests),
        'Avg ms': Math.round(e.avg_ms),
        'Max ms': Math.round(e.max_ms),
        Users: e.distinct_users,
      })),
    [sm],
  );

  const recentErrorRows: Row[] = useMemo(
    () =>
      (sm?.recent_errors ?? []).map((e) => ({
        Status: e.status,
        Method: e.method,
        Endpoint: e.path,
        User: e.username || '—',
        'Latency ms': Math.round(e.ms),
        When: e.ts,
      })),
    [sm],
  );

  const moduleRows: Row[] = useMemo(() => {
    const rows = cm?.intelligence?.queries_by_module ?? [];
    return rows.map((r) => ({
      Module: r.module || '—',
      Queries: r.query_count,
      'Avg ms': r.query_count > 0 ? Math.round((r.total_seconds * 1000) / r.query_count) : null,
      'Total s': Math.round(r.total_seconds),
      Credits: Number(r.credits?.toFixed?.(2) ?? r.credits ?? 0),
    }));
  }, [cm]);

  const warehouseRows: Row[] = useMemo(
    () =>
      (wh?.warehouses ?? []).map((w) => ({
        Warehouse: w.name,
        Size: w.size,
        State: w.state,
        Queries: w.total_queries,
        'Avg ms': Math.round(w.avg_execution_ms),
        'Queue ms': Math.round(w.queue_time_avg_ms),
        'Util %': w.utilization_pct,
        Credits: Number(w.credits_used?.toFixed?.(2) ?? w.credits_used ?? 0),
      })),
    [wh],
  );

  const slowQueryRows: Row[] = useMemo(
    () =>
      (qi?.slow_queries ?? []).map((q) => ({
        'Exec ms': Math.round(q.execution_time_ms),
        User: q.user || '—',
        Warehouse: q.warehouse || '—',
        Query: trunc(q.query_text),
        When: q.timestamp,
      })),
    [qi],
  );

  const errorQueryRows: Row[] = useMemo(
    () =>
      (qi?.error_queries ?? []).map((q) => ({
        Code: q.error_code || '—',
        Message: trunc(q.error_message, 80),
        User: q.user || '—',
        Query: trunc(q.query_text, 70),
        When: q.timestamp,
      })),
    [qi],
  );

  return (
    <div className="space-y-5">
      {/* Honest framing: this is observed perf, not a synthetic stress test. */}
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
        <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          No synthetic load / stress-test harness is wired for this account. The metrics below report{' '}
          <span className="font-semibold">observed</span> production latency, throughput and error-rate from
          live server, query and warehouse telemetry — absent values render <span className="font-semibold">—</span>.
        </span>
      </div>

      {/* ── KPI strip (live server metrics) ── */}
      <PanelCard icon={ServerCog} title="API latency & throughput" subtitle="live · in-process since restart">
        <Feed phase={smPhase} label="Server metrics" error={smError} onRetry={() => void loadServerMetrics()}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <KpiStat label="Req / min" value={sm ? String(sm.requests_per_min) : '—'} sub={sm ? `${sm.total_requests.toLocaleString()} total` : undefined} />
            <KpiStat label="Error rate" value={sm ? `${sm.error_rate.toFixed(2)}%` : '—'} sub={sm ? `${sm.error_count} errors` : undefined} alert={Boolean(sm && sm.error_rate > 5)} />
            <KpiStat label="p50" value={sm ? `${Math.round(sm.latency.p50_ms)} ms` : '—'} />
            <KpiStat label="p90" value={sm ? `${Math.round(sm.latency.p90_ms)} ms` : '—'} />
            <KpiStat label="p99" value={sm ? `${Math.round(sm.latency.p99_ms)} ms` : '—'} alert={Boolean(sm && sm.latency.p99_ms > 2000)} />
            <KpiStat label="Avg" value={sm ? `${Math.round(sm.latency.avg_ms)} ms` : '—'} />
          </div>
        </Feed>
      </PanelCard>

      {/* ── Hot / slow endpoints ── */}
      <PanelCard icon={Route} title="Endpoint latency & error-rate" subtitle="most-hit routes, with avg / max latency">
        <Feed phase={smPhase} label="Endpoint metrics" error={smError} onRetry={() => void loadServerMetrics()}>
          {endpointRows.length > 0 ? (
            <AuditTable
              rows={endpointRows}
              columns={['Method', 'Endpoint', 'Requests', 'Errors', 'Error rate', 'Avg ms', 'Max ms', 'Users']}
              pageSize={12}
            />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No endpoint traffic recorded since the last restart — —
            </p>
          )}
        </Feed>
      </PanelCard>

      {/* ── Per-module performance ── */}
      <PanelCard icon={Layers} title="Per-module query performance" subtitle="throughput + avg latency · last 7d">
        <Feed phase={cmPhase} label="Cross-module intelligence" error={cmError} onRetry={() => void loadCrossModule()}>
          {moduleRows.length > 0 ? (
            <AuditTable rows={moduleRows} columns={['Module', 'Queries', 'Avg ms', 'Total s', 'Credits']} pageSize={12} />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No per-module query attribution available — —
            </p>
          )}
        </Feed>
      </PanelCard>

      {/* ── Warehouse performance ── */}
      <PanelCard icon={Warehouse} title="Warehouse performance" subtitle="compute latency, queueing & utilization · last 7d">
        <Feed phase={whPhase} label="Warehouse performance" error={whError} onRetry={() => void loadWarehouse()}>
          {wh && (
            <div className="mb-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <KpiStat label="Queries 7d" value={wh.query_performance.total_queries_7d.toLocaleString()} />
              <KpiStat label="Avg exec" value={`${Math.round(wh.query_performance.avg_execution_ms)} ms`} />
              <KpiStat label="p95 exec" value={`${Math.round(wh.query_performance.p95_execution_ms)} ms`} alert={wh.query_performance.p95_execution_ms > 30000} />
              <KpiStat label="Failed 7d" value={wh.query_performance.failed_queries_7d.toLocaleString()} alert={wh.query_performance.failed_queries_7d > 0} />
              <KpiStat label="Queued 7d" value={wh.query_performance.queued_queries_7d.toLocaleString()} />
            </div>
          )}
          {warehouseRows.length > 0 ? (
            <AuditTable
              rows={warehouseRows}
              columns={['Warehouse', 'Size', 'State', 'Queries', 'Avg ms', 'Queue ms', 'Util %', 'Credits']}
              pageSize={12}
            />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No warehouse activity in the window — —
            </p>
          )}
        </Feed>
      </PanelCard>

      {/* ── Slowest queries ── */}
      <PanelCard icon={Timer} title="Slowest queries" subtitle="highest execution time · last 7d">
        <Feed phase={qiPhase} label="Query intelligence" error={qiError} onRetry={() => void loadQueryIntel()}>
          {slowQueryRows.length > 0 ? (
            <AuditTable rows={slowQueryRows} columns={['Exec ms', 'User', 'Warehouse', 'Query', 'When']} pageSize={10} />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No slow queries flagged — —
            </p>
          )}
        </Feed>
      </PanelCard>

      {/* ── Erroring queries ── */}
      <PanelCard icon={AlertTriangle} title="Failed queries" subtitle="errors with code & message · last 7d">
        <Feed phase={qiPhase} label="Query intelligence" error={qiError} onRetry={() => void loadQueryIntel()}>
          {errorQueryRows.length > 0 ? (
            <AuditTable rows={errorQueryRows} columns={['Code', 'Message', 'User', 'Query', 'When']} pageSize={10} />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No query errors in the window — —
            </p>
          )}
        </Feed>
      </PanelCard>

      {/* ── Recent API errors ── */}
      <PanelCard icon={BarChart3} title="Recent API errors" subtitle="latest 4xx / 5xx responses">
        <Feed phase={smPhase} label="Recent errors" error={smError} onRetry={() => void loadServerMetrics()}>
          {recentErrorRows.length > 0 ? (
            <AuditTable
              rows={recentErrorRows}
              columns={['Status', 'Method', 'Endpoint', 'User', 'Latency ms', 'When']}
              pageSize={12}
            />
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-emerald-500 dark:border-slate-700 dark:bg-slate-900">
              No 4xx / 5xx responses recorded since restart.
            </p>
          )}
        </Feed>
      </PanelCard>
    </div>
  );
}
