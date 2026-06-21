'use client';

/**
 * CacheGovernancePanel — the real-time-cache OPERATIONS surface of the Admin
 * command center (sibling of CacheMetricsPanel, rendered in the same
 * "Cache & Calls" tab).
 *
 * Where CacheMetricsPanel shows runtime telemetry (hit-rate / memory / top
 * endpoints), this panel shows the SVC-first cache GOVERNANCE state and gives
 * an operator the two control levers:
 *   - SVC health per account (alive · auth_type · dev-fallback warning),
 *   - cache coverage per account → role (warm vs cold) + uncovered warm targets,
 *   - the background warmer snapshot (last/next cycle, per-target tallies),
 *   - "Warm now" (manual warm trigger) and "Invalidate surface" (precise,
 *     account-scoped eviction with a dry-run preview).
 *
 * Honesty contract (mirrors CacheMetricsPanel):
 *   - The `/admin/cache/*` routes are a FORWARD CONTRACT (vault
 *     _TARGET_ARCHITECTURE §4.1) and are not deployed on every backend. Each GET
 *     section fetches INDEPENDENTLY: a 404/501 self-degrades ONLY that card to an
 *     honest "not available on this backend yet" notice — a partial rollout still
 *     renders whatever is live. A hard (non-404/501) error shows a retriable box.
 *   - Absent/null values render "—", never a fabricated 0.
 *   - The mutating buttons are GATED with useCanPerform (secondary signal; the
 *     backend is the real gate). They render DISABLED — never hidden — when the
 *     caller lacks the permission, and fail OPEN on a permissions error so an
 *     admin is never wedged out of their own controls. A 404/501 from the mutation
 *     is reported as "not available yet", not a scary red failure.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  Flame,
  Loader2,
  Network,
  ServerCog,
  Snowflake,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  getCacheCoverage,
  getCacheSvcHealth,
  getCacheWarmStatus,
  warmCacheSurface,
  invalidateCacheSurface,
  type CacheCoverageResponse,
  type SvcHealthResponse,
  type WarmStatusResponse,
} from '@/app/services/cache/admin';
import { ErrBox } from './shared';

// ── helpers ───────────────────────────────────────────────────────────────────

const DASH = '—';

/** 404/501 = the route isn't deployed on this backend → honest self-degrade. */
function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

function num(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? DASH : v.toLocaleString();
}
function dt(v: string | null | undefined): string {
  if (!v) return DASH;
  return v.length > 19 ? v.slice(0, 19).replace('T', ' ') : v.replace('T', ' ');
}
function ms(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? DASH : `${Math.round(v)} ms`;
}

type Phase = 'loading' | 'ready' | 'unavailable' | 'error';

/** Generic per-section async loader → keeps each card's phase independent. */
function useSection<T>(fetcher: () => Promise<T>) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await fetcher();
      setData(res);
      setPhase('ready');
    } catch (e) {
      if (isNotDeployed(e)) {
        setPhase('unavailable');
        return;
      }
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
    // fetcher is a stable module-level function; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { phase, data, error, reload: load };
}

// ── presentational atoms ───────────────────────────────────────────────────────

function SectionCard({
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

function Unavailable({ what }: { what: string }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-white px-3 py-5 text-center text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
      {what} is not available on this backend yet — the real-time cache governance routes are coming
      online. {DASH}
    </p>
  );
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: 'emerald' | 'rose' | 'amber' | 'sky' | 'slate';
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

// ── SVC health section ─────────────────────────────────────────────────────────

function SvcHealthSection() {
  const { phase, data, error, reload } = useSection<SvcHealthResponse>(getCacheSvcHealth);
  const accounts = data?.accounts ?? [];

  return (
    <SectionCard icon={Snowflake} title="Service-account health" subtitle="per account · SVC-first read path">
      {phase === 'loading' && <CardSkeleton rows={2} />}
      {phase === 'unavailable' && <Unavailable what="SVC health" />}
      {phase === 'error' && <ErrBox message={error ?? 'SVC health unavailable'} onRetry={() => void reload()} />}
      {phase === 'ready' &&
        (accounts.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">SVC</th>
                  <th className="px-3 py-2 font-medium">Auth</th>
                  <th className="px-3 py-2 font-medium">Read fallback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {accounts.map((a, i) => (
                  <tr key={`${a.account ?? 'acct'}-${i}`} className="bg-white dark:bg-slate-900">
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{a.account ?? DASH}</td>
                    <td className="px-3 py-2">
                      {a.alive == null ? (
                        <span className="text-slate-400">{DASH}</span>
                      ) : a.alive ? (
                        <Pill tone="emerald">alive</Pill>
                      ) : (
                        <Pill tone="rose">down</Pill>
                      )}
                      {a.error && <span className="ml-1.5 text-[10px] text-rose-500">{a.error}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{a.auth_type ?? DASH}</td>
                    <td className="px-3 py-2">
                      {a.fallback_enabled == null ? (
                        <span className="text-slate-400">{DASH}</span>
                      ) : a.fallback_enabled ? (
                        <span className="inline-flex items-center gap-1">
                          <Pill tone="amber">user-fallback ON</Pill>
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        </span>
                      ) : (
                        <Pill tone="slate">SVC-only</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-3 py-5 text-center text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            No service accounts reported {DASH}
          </p>
        ))}
    </SectionCard>
  );
}

// ── Coverage section ───────────────────────────────────────────────────────────

function CoverageSection() {
  const { phase, data, error, reload } = useSection<CacheCoverageResponse>(getCacheCoverage);
  const accounts = data?.accounts ?? [];
  const uncovered = data?.uncovered_targets ?? [];

  return (
    <SectionCard
      icon={Network}
      title="Cache coverage"
      subtitle="account → role · warm vs cold slots"
    >
      {phase === 'loading' && <CardSkeleton rows={3} />}
      {phase === 'unavailable' && <Unavailable what="Cache coverage" />}
      {phase === 'error' && <ErrBox message={error ?? 'Coverage unavailable'} onRetry={() => void reload()} />}
      {phase === 'ready' && (
        <div className="space-y-3">
          {accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts.map((acct, ai) => (
                <div
                  key={`${acct.account ?? 'acct'}-${ai}`}
                  className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {acct.account ?? DASH}
                    </span>
                    {acct.svc_present == null ? null : acct.svc_present ? (
                      <Pill tone="emerald">SVC</Pill>
                    ) : (
                      <Pill tone="rose">no SVC</Pill>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {num(acct.active_roles)} roles · {num(acct.warm)} warm · {num(acct.cold)} cold
                    </span>
                  </div>
                  {(acct.roles?.length ?? 0) > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      {acct.roles!.map((r, ri) => {
                        const cold = r.cold ?? 0;
                        return (
                          <div
                            key={`${r.role ?? 'role'}-${ri}`}
                            className={cn(
                              'flex items-center justify-between rounded-lg border px-2 py-1.5 text-[11px]',
                              cold > 0
                                ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/15'
                                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
                            )}
                          >
                            <span className="truncate font-medium text-slate-700 dark:text-slate-200" title={r.role ?? ''}>
                              {r.role ?? DASH}
                            </span>
                            <span className="ml-1.5 shrink-0 text-slate-500 dark:text-slate-400">
                              {num(r.warm)}/{num(r.cold)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400">No per-role coverage reported {DASH}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-5 text-center text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              No cache coverage reported {DASH}
            </p>
          )}

          {/* Uncovered warm targets */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Uncovered warm targets
            </p>
            {uncovered.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {uncovered.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/60 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300"
                    title={t.reason ?? ''}
                  >
                    {[t.account, t.module, t.page, t.role].filter(Boolean).join(' · ') || DASH}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                All active (account · role · surface) tuples are warm.
              </p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Warmer status section ──────────────────────────────────────────────────────

function warmTone(state: string | null | undefined): 'emerald' | 'sky' | 'rose' | 'slate' {
  const s = (state ?? '').toLowerCase();
  if (s === 'ok' || s === 'idle' || s === 'success') return 'emerald';
  if (s === 'running' || s === 'warming') return 'sky';
  if (s === 'failed' || s === 'error') return 'rose';
  return 'slate';
}

function WarmStatusSection({ refreshToken }: { refreshToken: number }) {
  const { phase, data, error, reload } = useSection<WarmStatusResponse>(getCacheWarmStatus);

  // Re-pull the warmer snapshot after a successful manual warm.
  useEffect(() => {
    if (refreshToken > 0) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  return (
    <SectionCard icon={Activity} title="Background warmer" subtitle="last / next cycle · per-target tallies">
      {phase === 'loading' && <CardSkeleton rows={1} />}
      {phase === 'unavailable' && <Unavailable what="Warmer status" />}
      {phase === 'error' && <ErrBox message={error ?? 'Warmer status unavailable'} onRetry={() => void reload()} />}
      {phase === 'ready' && data && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">State</span>
              <Pill tone={warmTone(data.state)}>{data.state ?? DASH}</Pill>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">Per-role warm</span>
              {data.per_role_enabled == null ? (
                <span className="text-slate-400">{DASH}</span>
              ) : data.per_role_enabled ? (
                <Pill tone="emerald">on</Pill>
              ) : (
                <Pill tone="slate">off</Pill>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">Last run</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{dt(data.last_run_at)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">Next run</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{dt(data.next_run_at)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">Duration</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{ms(data.duration_ms)}</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{num(data.warmed)} warmed</span>
            <span>{num(data.refreshed)} refreshed</span>
            <span>{num(data.cold)} cold</span>
            <span className={cn((data.failed ?? 0) > 0 && 'text-rose-600 dark:text-rose-400')}>
              {num(data.failed)} failed
            </span>
          </div>
          {data.error && <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">Last error: {data.error}</p>}
        </div>
      )}
    </SectionCard>
  );
}

// ── Controls section (gated mutations) ──────────────────────────────────────────

function ControlsSection({ onWarmed }: { onWarmed: () => void }) {
  // Real, populated admin-write key (same gate FeatureGovernanceMatrix uses for
  // its admin writes). useCanPerform has NO admin-role bypass and DENIES on a
  // successful response lacking the action → we render DISABLED (never hidden)
  // and fail OPEN on a permissions error so an admin is never wedged out.
  const perm = useCanPerform('gouvernance', 'grant');
  const denied = !perm.allowed && !perm.loading && !perm.error;

  const [account, setAccount] = useState('');
  const [module, setModule] = useState('');
  const [page, setPage] = useState('');
  const [perRole, setPerRole] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState<null | 'warm' | 'invalidate'>(null);

  const accountTrim = account.trim();
  const canSubmit = accountTrim.length > 0 && !denied && busy == null;

  const reportMutationError = (e: unknown, verb: string) => {
    if (isNotDeployed(e)) {
      toast(`${verb} is not available on this backend yet.`, { icon: 'ℹ️' });
      return;
    }
    toast.error(getApiErrorMessage(e));
  };

  const onWarm = async () => {
    if (!canSubmit) return;
    setBusy('warm');
    try {
      const res = await warmCacheSurface({
        account: accountTrim,
        module: module.trim() || undefined,
        page: page.trim() || undefined,
        per_role: perRole,
      });
      toast.success(
        res.warmed != null ? `Warmed ${res.warmed} slot(s)${res.roles != null ? ` across ${res.roles} role(s)` : ''}.` : 'Warm triggered.',
      );
      onWarmed();
    } catch (e) {
      reportMutationError(e, 'Warm now');
    } finally {
      setBusy(null);
    }
  };

  const onInvalidate = async () => {
    if (!canSubmit) return;
    setBusy('invalidate');
    try {
      const res = await invalidateCacheSurface({
        account: accountTrim,
        module: module.trim() || undefined,
        page: page.trim() || undefined,
        dry_run: dryRun,
      });
      if (res.dry_run) {
        toast(`Dry-run: ${res.patterns?.length ?? 0} pattern(s) would be evicted.`, { icon: '🔎' });
      } else {
        toast.success(res.evicted != null ? `Evicted ${res.evicted} key(s).` : 'Surface invalidated.');
      }
    } catch (e) {
      reportMutationError(e, 'Invalidate surface');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard icon={ServerCog} title="Controls" subtitle="manual warm · precise account-scoped eviction">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        {denied && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            You don&apos;t have permission to run cache operations — controls are read-only.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Account <span className="text-rose-500">*</span>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="ACCOUNT_NAME"
              disabled={denied}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Module <span className="font-normal text-slate-300">(optional)</span>
            <input
              type="text"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              placeholder="e.g. gouvernance"
              disabled={denied}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Page <span className="font-normal text-slate-300">(optional)</span>
            <input
              type="text"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder="e.g. policies"
              disabled={denied}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={perRole}
              onChange={(e) => setPerRole(e.target.checked)}
              disabled={denied}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Warm one slot per active role
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={denied}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Invalidate as dry-run (preview only)
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onWarm()}
            disabled={!canSubmit}
            title={denied ? 'Requires cache-operations permission' : !accountTrim ? 'Enter an account' : 'Warm the cache surface now'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'warm' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
            Warm now
          </button>
          <button
            type="button"
            onClick={() => void onInvalidate()}
            disabled={!canSubmit}
            title={
              denied
                ? 'Requires cache-operations permission'
                : !accountTrim
                  ? 'Enter an account'
                  : dryRun
                    ? 'Preview the eviction (no keys deleted)'
                    : 'Evict the cache surface for this account'
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300"
          >
            {busy === 'invalidate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Invalidate surface
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function CacheGovernancePanel() {
  const [warmToken, setWarmToken] = useState(0);
  const onWarmed = useMemo(() => () => setWarmToken((n) => n + 1), []);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
        <ServerCog className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          SVC-first cache governance — service-account health, coverage per account/role (warm vs
          cold), uncovered warm targets, and manual warm / precise eviction controls. Each section
          loads independently; routes not yet live on this backend show an honest{' '}
          <span className="font-semibold">&quot;not available&quot;</span> notice (never a fabricated 0).
        </span>
      </div>

      <SvcHealthSection />
      <CoverageSection />
      <WarmStatusSection refreshToken={warmToken} />
      <ControlsSection onWarmed={onWarmed} />
    </div>
  );
}
