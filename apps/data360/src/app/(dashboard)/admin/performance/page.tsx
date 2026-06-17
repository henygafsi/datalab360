'use client';

/**
 * Per-account Performance — multi-axis admin drill-down.
 *
 * Mirrors the ServerMetricsPanel visual language (GlassPanel KPI cards, compact
 * tables, STATUS_TINT badges) but scopes everything PER ACCOUNT with a top
 * account selector and a FilterChips axis switcher (no tabs):
 *   Endpoints · Users · Cache · Modules · Projects · Errors.
 *
 * A backend that is not deployed yet (404/501) degrades to a quiet
 * "not deployed yet" state. All fetches go through apiClient. null → "—".
 */
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Gauge,
  Layers,
  Pause,
  Play,
  RefreshCw,
  ShieldX,
  Timer,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';
import EmptyState from '@/components/ui/EmptyState';
import { getAccounts } from '@/app/services/org-accounts/hooks';
import { getPerfOverview, type CacheAxis } from '@/app/services/admin-performance';
import {
  KpiCard,
  FilterChips,
  fmtInt,
  fmtMs,
  fmtPct,
  type ChipOption,
} from './components/shared';
import { usePerfFetch } from './components/usePerfFetch';
import {
  EndpointsPanel,
  UsersPanel,
  CachePanel,
  ModulesPanel,
  ProjectsPanel,
  ErrorsPanel,
  type PerfSelection,
} from './components/AxisPanels';
import DetailPanel from './components/DetailPanel';

type Axis = 'endpoints' | 'users' | 'cache' | 'modules' | 'projects' | 'errors';

const AXES: ChipOption<Axis>[] = [
  { id: 'endpoints', label: 'Endpoints', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'cache', label: 'Cache', icon: Database },
  { id: 'modules', label: 'Modules', icon: Layers },
  { id: 'projects', label: 'Projects', icon: Layers },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
];

const HOURS_OPTIONS: ChipOption<string>[] = [
  { id: '1', label: '1h' },
  { id: '24', label: '24h' },
  { id: '168', label: '7d' },
];

const LIVE_MS = 5000;

export default function PerformancePage() {
  const { data: session } = useSession();
  const sessionAccount = (session?.user as { account_name?: string } | undefined)?.account_name ?? null;

  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [axis, setAxis] = useState<Axis>('endpoints');
  const [cacheAxis, setCacheAxis] = useState<CacheAxis>('module');
  const [selection, setSelection] = useState<PerfSelection>(null);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');

  // Account selector — GET /org-accounts/accounts, fall back to session account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAccounts();
        const names = (res.accounts ?? []).map((a) => a.account_name).filter(Boolean);
        if (cancelled) return;
        if (names.length > 0) {
          setAccounts(names);
          setAccount((cur) => cur ?? names[0]);
          return;
        }
        throw new Error('empty');
      } catch {
        if (cancelled) return;
        const fallback = sessionAccount ? [sessionAccount] : [];
        setAccounts(fallback);
        setAccount((cur) => cur ?? fallback[0] ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionAccount]);

  // Reset selection when the account or window changes.
  useEffect(() => {
    setSelection(null);
  }, [account, hours]);

  const liveMs = live ? LIVE_MS : null;

  const overview = usePerfFetch(
    () => getPerfOverview(account as string, hours),
    [account, hours],
    account ? liveMs : null,
    !!account, // don't fetch /performance/<account>/overview until an account is selected (was firing with null → 403)
  );
  useEffect(() => {
    if (overview.state === 'done') setUpdatedAt(new Date().toLocaleTimeString());
  }, [overview.state, overview.data]);

  const k = overview.data?.kpis;

  const axisPanel = useMemo(() => {
    if (!account) return null;
    const base = { account, hours, liveMs };
    switch (axis) {
      case 'endpoints':
        return <EndpointsPanel {...base} selected={selection} onSelect={setSelection} />;
      case 'users':
        return <UsersPanel {...base} selected={selection} onSelect={setSelection} />;
      case 'cache':
        return <CachePanel {...base} axis={cacheAxis} onAxisChange={setCacheAxis} />;
      case 'modules':
        return <ModulesPanel {...base} />;
      case 'projects':
        return <ProjectsPanel {...base} />;
      case 'errors':
        return <ErrorsPanel {...base} />;
      default:
        return null;
    }
  }, [account, hours, liveMs, axis, cacheAxis, selection]);

  return (
    <div className="space-y-3 p-4">
      {/* Header: account selector + window + live controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-slate-400" />
            <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Performance</h1>
          </div>
          <select
            value={account ?? ''}
            onChange={(e) => setAccount(e.target.value || null)}
            aria-label="Account"
            className="rounded-md border border-slate-200 bg-white/70 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {accounts.length === 0 && <option value="">No accounts</option>}
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <FilterChips
            options={HOURS_OPTIONS}
            value={String(hours)}
            onChange={(v) => setHours(Number(v))}
            size="sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={cn('h-2 w-2 rounded-full', live ? 'animate-pulse bg-emerald-500' : 'bg-slate-400')} />
            {live ? 'Live (5s)' : 'Paused'}{updatedAt ? ` · ${updatedAt}` : ''}
          </p>
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
          >
            {live ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {live ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={() => overview.reload()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      {!account ? (
        <EmptyState icon={Database} compact title="No account selected" description="Pick an account to view its performance." />
      ) : (
        <>
          {/* KPI row — 8 cards, per selected account */}
          {overview.state === 'not-deployed' ? (
            <GlassPanel depth={1} radius="xl" className="px-3 py-6 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                Performance metrics are not deployed yet for this account — the backend route is coming online.
              </span>
            </GlassPanel>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <KpiCard
                label="Requests / min"
                icon={Activity}
                value={fmtInt(k?.requests_per_min)}
                sub={`${fmtInt(k?.requests)} total`}
                help={{ definition: 'Average requests per minute over the selected window.', goodRange: 'depends on tier' }}
              />
              <KpiCard
                label="Avg response"
                icon={Timer}
                value={fmtMs(k?.avg_ms)}
                sub={`p50 ${fmtMs(k?.p50_ms)} · p90 ${fmtMs(k?.p90_ms)} · p99 ${fmtMs(k?.p99_ms)}`}
                help={{ definition: 'Mean server response time; sub-line shows latency percentiles.', goodRange: '< 500 ms p90' }}
              />
              <KpiCard
                label="Error rate"
                icon={AlertTriangle}
                tint={(k?.error_rate ?? 0) > 5 ? 'text-red-600 dark:text-red-400' : undefined}
                value={fmtPct(k?.error_rate, 2)}
                sub={`${fmtInt(k?.error_count)} errors`}
                help={{ definition: 'Share of requests returning 4xx/5xx.', goodRange: '< 1%' }}
              />
              <KpiCard
                label="Cache hit rate"
                icon={Database}
                value={fmtPct(k?.cache_hit_rate, 1)}
                help={{ definition: 'Share of requests served from cache vs. recomputed.', goodRange: '> 80%' }}
              />
              <KpiCard
                label="Requests / 5min"
                icon={BarChart3}
                value={fmtInt(k?.requests_per_5min)}
                help={{ definition: 'Average requests per 5-minute bucket.' }}
              />
              <KpiCard
                label="Deny rate"
                icon={ShieldX}
                tint={(k?.deny_rate ?? 0) > 5 ? 'text-amber-600 dark:text-amber-400' : undefined}
                value={fmtPct(k?.deny_rate, 2)}
                help={{ definition: 'Share of requests denied by access control.', goodRange: 'low & expected' }}
              />
              <KpiCard
                label="Distinct users"
                icon={Users}
                value={fmtInt(k?.distinct_users)}
                help={{ definition: 'Unique users active in the window.' }}
              />
              <KpiCard
                label="Distinct paths"
                icon={Layers}
                value={fmtInt(k?.distinct_paths)}
                help={{ definition: 'Unique endpoint paths called in the window.' }}
              />
            </div>
          )}

          {/* Axis switcher */}
          <FilterChips options={AXES} value={axis} onChange={setAxis} />

          {/* Axis table + always-visible right detail panel */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <GlassPanel depth={1} radius="xl" className="overflow-hidden lg:col-span-2">
              {axisPanel}
            </GlassPanel>
            <div className="lg:col-span-1">
              <DetailPanel account={account} hours={hours} selection={selection} onClose={() => setSelection(null)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
