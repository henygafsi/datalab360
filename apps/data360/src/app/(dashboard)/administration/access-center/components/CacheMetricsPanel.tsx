'use client';

/**
 * CacheMetricsPanel — the "Cache & Calls" section of the Admin command center.
 *
 * A single read-only view of the runtime cache + API-call telemetry, fed by one
 * endpoint: GET /command-center/cache-metrics. It surfaces:
 *   - cache hit-rate / memory footprint / total key count (KPI cards),
 *   - key-counts broken down by cache-key prefix (cards),
 *   - the service warm-cycle status (last run / next run / state),
 *   - a table of the busiest endpoints (call count · avg/max latency · error rate).
 *
 * Honesty contract:
 *   - This route is NOT yet deployed on every backend. A 404/501 means the
 *     metrics route isn't live → the section renders an HONEST "not available
 *     on this backend" notice (it does NOT silently vanish, and it does NOT
 *     fabricate a "coming soon" board of zeros).
 *   - Any absent/null metric renders an honest "—", never a synthetic 0. Numeric
 *     cells passed to AuditTable stay `null` when missing (AuditTable formats
 *     null as "—"); we never coerce to 0 just to make the math run.
 *   - No mutations here → nothing is gated; a hard (non-404/501) error shows a
 *     retriable ErrBox.
 *
 * The response shape below is a FORWARD CONTRACT authored on the frontend (the
 * backend route is not deployed yet), so every field is optional/nullable — we
 * read defensively and degrade to "—" for anything the payload omits.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Database, Gauge, KeyRound, Route, Sparkles, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { safeNum } from '@/lib/format-number';
import { API } from '@/lib/api-contracts';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import { ErrBox } from './shared';

// ── Forward response contract (every field optional → honest "—" on absence) ──

interface CachePrefixCount {
  prefix?: string | null;
  keys?: number | null;
  /** Bytes held by this prefix, if the backend reports per-prefix memory. */
  bytes?: number | null;
}

interface WarmCycleStatus {
  /** e.g. "idle" | "running" | "ok" | "failed" | "never". */
  state?: string | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
  duration_ms?: number | null;
  warmed_keys?: number | null;
  error?: string | null;
}

interface CacheEndpointStat {
  method?: string | null;
  path?: string | null;
  endpoint?: string | null;
  calls?: number | null;
  count?: number | null;
  avg_ms?: number | null;
  max_ms?: number | null;
  errors?: number | null;
  error_rate?: number | null;
}

interface CacheMetricsResponse {
  hit_rate?: number | null; // 0..1 OR 0..100 — normalised below
  hits?: number | null;
  misses?: number | null;
  total_keys?: number | null;
  memory_bytes?: number | null;
  memory_used_mb?: number | null;
  evictions?: number | null;
  backend?: string | null; // "redis" | "in-memory" | …
  keys_by_prefix?: CachePrefixCount[] | null;
  warm_cycle?: WarmCycleStatus | null;
  top_endpoints?: CacheEndpointStat[] | null;
}

type Phase = 'loading' | 'ready' | 'hidden' | 'error';

/** 404/501 = the metrics route isn't deployed on this backend → self-hide. */
function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

// ── Honest formatters (null/undefined/NaN → "—", never a fabricated 0) ────────

const DASH = '—';
function num(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? DASH : v.toLocaleString();
}
function ms(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? DASH : `${Math.round(v)} ms`;
}
function pct(v: number | string | null | undefined): string {
  const n = safeNum(v);
  if (n == null) return DASH;
  // Accept either a 0..1 ratio or an already-scaled 0..100 percentage.
  const scaled = n <= 1 ? n * 100 : n;
  return `${scaled.toFixed(1)}%`;
}
function bytes(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  if (v < 1024) return `${v} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = v / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}
function dt(v: string | null | undefined): string {
  if (!v) return DASH;
  return v.length > 19 ? v.slice(0, 19).replace('T', ' ') : v.replace('T', ' ');
}

// ── Tiny presentational atoms (local to this panel) ───────────────────────────

function KpiCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
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

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Gauge;
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

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
      {children}
    </p>
  );
}

/** Loading skeleton — shimmer cards + a grey table block. */
function Skeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
    </div>
  );
}

/** Colour the warm-cycle state chip by its reported lifecycle. */
function warmTone(state: string | null | undefined): string {
  const s = (state ?? '').toLowerCase();
  if (s === 'ok' || s === 'idle' || s === 'success') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (s === 'running' || s === 'warming') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
  if (s === 'failed' || s === 'error') return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export default function CacheMetricsPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CacheMetricsResponse | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await apiClient.get<CacheMetricsResponse>(API.commandCenter.cacheMetrics());
      setData(res.data ?? {});
      setPhase('ready');
    } catch (e) {
      if (isNotDeployed(e)) {
        // Route not live on this backend → self-hide the whole section.
        setPhase('hidden');
        return;
      }
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived: top-endpoints table (null stays null → AuditTable renders "—") ─
  const endpointRows: Row[] = useMemo(() => {
    const list = data?.top_endpoints ?? [];
    return list.map((e) => {
      const calls = e.calls ?? e.count ?? null;
      const errors = e.errors ?? null;
      // Prefer an explicit error_rate; else derive only when both inputs exist.
      const errRate =
        e.error_rate != null
          ? pct(e.error_rate)
          : errors != null && calls != null && calls > 0
            ? `${((errors / calls) * 100).toFixed(1)}%`
            : DASH;
      return {
        Method: e.method ?? null,
        Endpoint: e.path ?? e.endpoint ?? null,
        Calls: calls,
        'Avg ms': e.avg_ms != null ? Math.round(e.avg_ms) : null,
        'Max ms': e.max_ms != null ? Math.round(e.max_ms) : null,
        Errors: errors,
        'Error rate': errRate,
      } satisfies Row;
    });
  }, [data]);

  const prefixes = useMemo(
    () => (data?.keys_by_prefix ?? []).filter((p) => p && (p.prefix != null || p.keys != null)),
    [data],
  );

  // ── 404/501 → render an HONEST "not available" notice (never silently vanish). ─
  if (phase === 'hidden') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-[12px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Cache &amp; call metrics are not available on this backend yet — the runtime-cache telemetry route is coming online.
        </span>
      </div>
    );
  }
  if (phase === 'loading') return <Skeleton />;
  if (phase === 'error') return <ErrBox message={error ?? 'Cache metrics unavailable'} onRetry={() => void load()} />;

  const warm = data?.warm_cycle ?? null;
  const memBytes = data?.memory_bytes ?? (data?.memory_used_mb != null ? data.memory_used_mb * 1024 * 1024 : null);

  return (
    <div className="space-y-5">
      {/* Honest framing — observed runtime cache telemetry, nothing synthetic. */}
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
        <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Live runtime cache &amp; API-call telemetry — hit-rate, memory, keys by prefix, the service warm-cycle and the
          busiest endpoints. Absent values render <span className="font-semibold">—</span> (never a fabricated 0).
        </span>
      </div>

      {/* ── Cache health KPI cards ── */}
      <SectionCard icon={Database} title="Cache health" subtitle={data?.backend ? `backend · ${data.backend}` : undefined}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Hit rate"
            value={pct(data?.hit_rate)}
            sub={data?.hits != null || data?.misses != null ? `${num(data?.hits)} hit · ${num(data?.misses)} miss` : undefined}
            alert={data?.hit_rate != null && (data.hit_rate <= 1 ? data.hit_rate : data.hit_rate / 100) < 0.5}
          />
          <KpiCard label="Total keys" value={num(data?.total_keys)} />
          <KpiCard label="Memory" value={bytes(memBytes)} />
          <KpiCard label="Hits" value={num(data?.hits)} />
          <KpiCard label="Misses" value={num(data?.misses)} />
          <KpiCard label="Evictions" value={num(data?.evictions)} alert={data?.evictions != null && data.evictions > 0} />
        </div>
      </SectionCard>

      {/* ── Key counts by prefix ── */}
      <SectionCard icon={KeyRound} title="Keys by prefix" subtitle="cache-key namespace breakdown">
        {prefixes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {prefixes.map((p, i) => (
              <KpiCard
                key={`${p.prefix ?? 'prefix'}-${i}`}
                label={p.prefix ?? DASH}
                value={num(p.keys)}
                sub={p.bytes != null ? bytes(p.bytes) : undefined}
              />
            ))}
          </div>
        ) : (
          <EmptyNote>No per-prefix key counts reported {DASH}</EmptyNote>
        )}
      </SectionCard>

      {/* ── Warm-cycle status ── */}
      <SectionCard icon={Timer} title="Service warm-cycle" subtitle="background cache-warming job">
        {warm ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">State</span>
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', warmTone(warm.state))}>
                  {warm.state ?? DASH}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Last run</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{dt(warm.last_run_at)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Next run</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{dt(warm.next_run_at)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Duration</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{ms(warm.duration_ms)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-slate-400">Warmed keys</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{num(warm.warmed_keys)}</span>
              </span>
            </div>
            {warm.error && (
              <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">Last error: {warm.error}</p>
            )}
          </div>
        ) : (
          <EmptyNote>No warm-cycle status reported {DASH}</EmptyNote>
        )}
      </SectionCard>

      {/* ── Top endpoints ── */}
      <SectionCard icon={Route} title="Top endpoints" subtitle="busiest routes · call count, avg / max latency, error rate">
        {endpointRows.length > 0 ? (
          <AuditTable
            rows={endpointRows}
            columns={['Method', 'Endpoint', 'Calls', 'Avg ms', 'Max ms', 'Errors', 'Error rate']}
            pageSize={12}
          />
        ) : (
          <EmptyNote>No endpoint call telemetry recorded {DASH}</EmptyNote>
        )}
      </SectionCard>
    </div>
  );
}
