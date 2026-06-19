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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
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
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { GlassPanel } from '@/app/shared/glass';
import EmptyState from '@/components/ui/EmptyState';
import { getAccounts } from '@/app/services/org-accounts/hooks';
import { getPerfOverview, type CacheAxis } from '@/app/services/admin-performance';
import {
  KpiCard,
  FilterChips,
  DeepDiveToolbar,
  AnalyzeAiButton,
  AiAnalysisPanel,
  fmtInt,
  fmtMs,
  fmtPct,
  type ChipOption,
  type PerfFocus,
  type AiState,
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
  type PerfRowsView,
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

  // Deep-dive toolbar state (client-side filtering over already-loaded rows).
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [focus, setFocus] = useState<PerfFocus>(null);
  // Filtered-rows view lifted from the active axis panel (for count + AI payload).
  const [rowsView, setRowsView] = useState<PerfRowsView>({ shown: 0, total: 0, lines: [] });
  const onRows = useCallback((v: PerfRowsView) => setRowsView(v), []);

  // AI narrative analysis (dismissible docked panel).
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiText, setAiText] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const rowsViewRef = useRef(rowsView);
  rowsViewRef.current = rowsView;

  // Debounce the search box (250ms) — filtering is client-side, no new fetch.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

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

  // Reset selection + deep-dive state when the account or window changes.
  useEffect(() => {
    setSelection(null);
    setSearch('');
    setStatusFilter('');
    setFocus(null);
  }, [account, hours]);

  // Clear the static status sub-filter when the axis no longer supports it, and
  // reset the lifted rows-view so the "X of Y" count doesn't flash the prior axis.
  useEffect(() => {
    if (axis !== 'errors' && axis !== 'endpoints') setStatusFilter('');
    setRowsView({ shown: 0, total: 0, lines: [] });
  }, [axis]);

  /**
   * Cross-axis drill: focus an entity, switch axis, and pre-fill the search so
   * the new axis lands on that entity. Endpoint→Errors genuinely filters (error
   * rows carry a path); Endpoint→Users only carries context (user rows have no
   * path), so it is surfaced as a visible focus chip, never an implied filter.
   */
  const drillToAxis = useCallback((next: Axis, f: PerfFocus) => {
    setFocus(f);
    setStatusFilter('');
    // Only seed the search when the target axis can genuinely match the focus
    // value. Endpoint→Errors filters (error rows carry method+path); Endpoint→
    // Users cannot (user rows have no path), so leave search empty there and let
    // the focus chip carry the context honestly.
    const canMatch = !!f && !(f.kind === 'endpoint' && next === 'users');
    setSearch(canMatch && f ? f.value : '');
    setAxis(next);
  }, []);

  const onFocus = useCallback((f: PerfFocus) => {
    setFocus(f);
    if (f) setSearch(f.value);
  }, []);

  // ── Analyze with AI — wires to the existing POST /cortex/complete primitive.
  const runAiAnalysis = useCallback(async () => {
    if (!account) return;
    setAiState('loading');
    setAiError(null);
    setAiText('');
    const view = rowsViewRef.current;
    const winLabel = hours === 1 ? '1 hour' : hours === 168 ? '7 days' : `${hours} hours`;
    const filters = [
      debouncedSearch ? `search "${debouncedSearch}"` : null,
      statusFilter ? `status/method ${statusFilter}` : null,
      focus ? `focus ${focus.kind}:${focus.value}` : null,
    ].filter(Boolean).join(', ') || 'none';
    const prompt = [
      'You are a platform performance analyst. Write a concise, plain-language analysis (3–5 short bullet points) of the request-telemetry view below.',
      'Call out latency, error-rate and cache-hit outliers, likely causes, and one concrete next step. Do not mention internal vendor or product names.',
      '',
      `Account: ${account}`,
      `Window: ${winLabel}`,
      `Axis: ${axis}`,
      `Active filters: ${filters}`,
      `Rows shown: ${view.shown} of ${view.total}`,
      '',
      'Top rows:',
      ...(view.lines.length ? view.lines.map((l, i) => `${i + 1}. ${l}`) : ['(no rows in this view)']),
    ].join('\n');

    try {
      const { data } = await apiClient.post(API.cortex.complete(), { prompt, model: 'mistral-large2' });
      const inner = data?.data ?? data;
      const text: string = inner?.response ?? inner?.completion ?? '';
      setAiText(text);
      setAiState('done');
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 404 || status === 501) {
        setAiState('unavailable');
      } else {
        setAiError(getApiErrorMessage(e));
        setAiState('error');
      }
    }
  }, [account, hours, axis, debouncedSearch, statusFilter, focus]);

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
    const deep = { search: debouncedSearch, statusFilter, onRows };
    switch (axis) {
      case 'endpoints':
        return <EndpointsPanel {...base} {...deep} selected={selection} onSelect={setSelection} onFocus={onFocus} />;
      case 'users':
        return <UsersPanel {...base} {...deep} selected={selection} onSelect={setSelection} onFocus={onFocus} />;
      case 'cache':
        return <CachePanel {...base} {...deep} axis={cacheAxis} onAxisChange={setCacheAxis} />;
      case 'modules':
        return <ModulesPanel {...base} {...deep} />;
      case 'projects':
        return <ProjectsPanel {...base} {...deep} />;
      case 'errors':
        return <ErrorsPanel {...base} {...deep} />;
      default:
        return null;
    }
  }, [account, hours, liveMs, axis, cacheAxis, selection, debouncedSearch, statusFilter, onRows, onFocus]);

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
          {account && <AnalyzeAiButton onClick={runAiAnalysis} state={aiState} />}
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

          {/* AI narrative — dismissible docked panel (never a blocking modal) */}
          <AiAnalysisPanel state={aiState} text={aiText} error={aiError} onClose={() => setAiState('idle')} />

          {/* Axis table + always-visible right detail panel */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <GlassPanel depth={1} radius="xl" className="overflow-hidden lg:col-span-2">
              {/* Deep-dive filter/search toolbar — client-side over loaded rows */}
              <DeepDiveToolbar
                axis={axis}
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                shown={rowsView.shown}
                total={rowsView.total}
                focus={focus}
                onClearFocus={() => {
                  setFocus(null);
                  setSearch('');
                }}
              />
              {/* Cross-axis drill quick chips when an endpoint is focused */}
              {focus?.kind === 'endpoint' && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-white/30 px-3 py-1.5 text-[10px] dark:border-white/10">
                  <span className="text-slate-400">Cross-axis:</span>
                  <button
                    type="button"
                    onClick={() => drillToAxis('errors', focus)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-blue-900/30"
                  >
                    Errors on this endpoint
                  </button>
                  <button
                    type="button"
                    onClick={() => drillToAxis('users', focus)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-blue-900/30"
                  >
                    Users (context)
                  </button>
                </div>
              )}
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
