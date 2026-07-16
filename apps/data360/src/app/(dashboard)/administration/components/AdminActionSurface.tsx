'use client';

/**
 * AdminActionSurface — the agentic command surface for Administration: every
 * platform-admin capability rendered as a governed, verifiable action, sourced
 * live from the registry-in-tables catalog (GET /api/administration/actions),
 * not from hardcoded buttons. Mirrors the AI/E&D action-catalog pattern.
 *
 * Read-only actions (probe='get', GET) → "Run" executes inline and shows the
 * result. Mutating actions (suspend/resize/grant/revoke/…) → "Open" switches to
 * the hub tab where the control lives, so the change is made with the full panel
 * and its confirmations (nothing mutating runs from this catalog directly).
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Play,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Search,
  RefreshCw,
  Zap,
} from 'lucide-react';

import apiClient from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import {
  getAdminActions,
  verifyAdminActions,
  isAdminActionVerified,
  type AdminAction,
  type AdminActionCatalog,
} from '@/app/services/administration/actions';

const AREA_META: Record<string, { label: string; hint: string }> = {
  warehouse: { label: 'Warehouses', hint: 'Create, suspend, resume, resize & auto-suspend compute' },
  cost: { label: 'Cost governance', hint: 'Resource monitors, budgets & credit limits' },
  access: { label: 'Access & grants', hint: 'Roles, privileges, entitlements & the access simulator' },
  config: { label: 'Config & cache', hint: 'Platform settings, cache warm & invalidate' },
  health: { label: 'Health & audit', hint: 'Platform health, overview & route probes' },
};
const AREA_ORDER = ['warehouse', 'cost', 'access', 'config', 'health'];

const METHOD_TINT: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  POST: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function gateLabel(rbac: string): string {
  if (!rbac) return 'view';
  if (rbac.startsWith('module:')) return 'view';
  const slash = rbac.indexOf('/');
  return slash >= 0 ? rbac.slice(slash + 1) : rbac;
}

interface RunState {
  running: boolean;
  result?: unknown;
  error?: string;
}

function ActionCard({
  action,
  run,
  onRun,
  onOpen,
}: {
  action: AdminAction;
  run?: RunState;
  onRun: (a: AdminAction) => void;
  onOpen: (a: AdminAction) => void;
}) {
  const runnable = action.probe === 'get' && action.method === 'GET' && !action.path.includes('{');
  const verified = isAdminActionVerified(action.verified_status);
  return (
    <li className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', METHOD_TINT[action.method] ?? METHOD_TINT.GET)}>
          {action.method}
        </span>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{action.label}</span>
        {verified && (
          <span
            title={`Contract verified · ${action.verified_status}`}
            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-3 w-3" aria-hidden /> verified
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          admin·{gateLabel(action.rbac)}
        </span>
        <button
          type="button"
          onClick={() => (runnable ? onRun(action) : onOpen(action))}
          disabled={run?.running}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50',
            runnable
              ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-inset ring-[hsl(var(--primary))]/20 hover:bg-[hsl(var(--primary))]/20'
              : 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
          )}
        >
          {run?.running ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : runnable ? (
            <Play className="h-3 w-3" />
          ) : (
            <ArrowRight className="h-3 w-3" />
          )}
          {runnable ? 'Run' : 'Open'}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{action.why}</p>
      <code className="mt-1 block truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">{action.path}</code>
      {run?.error && <p role="alert" className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{run.error}</p>}
      {run?.result != null && (
        <pre className="mt-1.5 max-h-44 overflow-auto rounded-md bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {JSON.stringify(run.result, null, 1).slice(0, 2000)}
        </pre>
      )}
    </li>
  );
}

export default function AdminActionSurface({ onOpenArea }: { onOpenArea?: (area: string) => void }) {
  const { trackFeatureClick } = useTrackEvent();
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [verifying, setVerifying] = useState(false);

  const { data, loading, error, unavailable, refetch } = useCacheAwareQuery<AdminActionCatalog>(
    getAdminActions,
    { cacheKeys: [CACHE_KEYS.GRANTS] },
  );

  const runAction = useCallback(async (a: AdminAction) => {
    setRuns((r) => ({ ...r, [a.action_id]: { running: true } }));
    trackFeatureClick(`admin_action_run_${a.action_id}`);
    try {
      const res = await apiClient.get(a.path);
      setRuns((r) => ({ ...r, [a.action_id]: { running: false, result: res.data?.data ?? res.data } }));
    } catch (err) {
      setRuns((r) => ({ ...r, [a.action_id]: { running: false, error: err instanceof Error ? err.message : 'Request failed' } }));
    }
  }, [trackFeatureClick]);

  const openArea = useCallback((a: AdminAction) => {
    trackFeatureClick(`admin_action_open_${a.action_id}`);
    if (onOpenArea) onOpenArea(a.area);
    toast(`Open the ${AREA_META[a.area]?.label ?? a.area} panel to complete "${a.label}".`, { icon: '→' });
  }, [onOpenArea, trackFeatureClick]);

  const runVerify = useCallback(async () => {
    setVerifying(true);
    trackFeatureClick('admin_actions_verify');
    try {
      const res = await verifyAdminActions();
      toast.success(`Verified ${res.healthy_contracts}/${res.probed} contracts healthy`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifying(false);
    }
  }, [refetch, trackFeatureClick]);

  const filtered = useMemo(() => {
    const all = data?.actions ?? [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? all.filter((a) => a.label.toLowerCase().includes(q) || a.why.toLowerCase().includes(q) || a.area.includes(q))
      : all;
    const byArea: Record<string, AdminAction[]> = {};
    for (const a of rows) (byArea[a.area] ??= []).push(a);
    return byArea;
  }, [data, query]);

  const areas = useMemo(() => AREA_ORDER.filter((a) => (filtered[a]?.length ?? 0) > 0), [filtered]);
  const total = data?.actions?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Zap className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden />
            All admin capabilities as actions
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {total} governed actions · read-only ones run inline, changes open their panel for confirmation
          </p>
        </div>
        <button
          type="button"
          onClick={runVerify}
          disabled={verifying}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          title="Replay every read-only action and stamp verified contracts"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', verifying && 'animate-spin')} />
          Verify contracts
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search admin capabilities — e.g. suspend, resize, grant, revoke, monitor, invalidate…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          aria-label="Search admin capabilities"
        />
      </div>

      {unavailable && !loading && (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          The admin action catalog isn&apos;t available on this account yet.
        </p>
      )}
      {error && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="flex-1 text-xs text-amber-700 dark:text-amber-300">{error.message}</p>
          <button type="button" onClick={() => void refetch()} className="text-xs font-semibold text-amber-700 underline dark:text-amber-300">Retry</button>
        </div>
      )}
      {loading && !data && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {areas.map((area) => {
        const meta = AREA_META[area] ?? { label: area, hint: '' };
        const rows = filtered[area] ?? [];
        return (
          <details key={area} open className="group rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{meta.label}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{rows.length}</span>
              <span className="truncate text-[11px] text-slate-400 dark:text-slate-500">{meta.hint}</span>
            </summary>
            <ul className="mt-2 space-y-2">
              {rows.map((a) => (
                <ActionCard key={a.action_id} action={a} run={runs[a.action_id]} onRun={runAction} onOpen={openArea} />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
