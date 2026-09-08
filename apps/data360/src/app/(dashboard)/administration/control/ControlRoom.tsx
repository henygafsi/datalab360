'use client';

/**
 * ControlRoom — THE single Administration page (2026-09 user directive:
 * "une unique page pour contrôler et voir le fruit des dev front et back").
 *
 * One screen, ACCOUNTADMIN only (gated by the page wrapper): runtime state,
 * endpoint management (the dev-output ledger), per-user costs, usage
 * telemetry, request traces, cache health, test campaigns and access
 * adjustment. Composition rules (§8): one KPI row, one owner question per
 * lane, honest states everywhere ('—', preparing, unavailable — never fake
 * zeros), details reachable without burying the synthesis.
 */

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import KpiStrip, { type KpiItem } from '@/app/shared/cockpit/KpiStrip';
import {
  getReady,
  getCacheKpis,
  getEndpointInventory,
  getLastTestCampaign,
  isAdminEnvelope,
  type CacheKpis,
  type InventoryPage,
} from '@/app/services/administration/control';

import EndpointsInventoryPanel from './EndpointsInventoryPanel';
import CostByUserPanel from './CostByUserPanel';
import UsagePanel from './UsagePanel';
import TracesPanel from './TracesPanel';
import CacheHealthPanel from './CacheHealthPanel';
import TestsCampaignPanel from './TestsCampaignPanel';
import AccessPanel from './AccessPanel';

type LaneId = 'endpoints' | 'costs' | 'usage' | 'traces' | 'cache' | 'tests' | 'access';

const LANES: Array<{ id: LaneId; label: string }> = [
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'costs', label: 'Costs by user' },
  { id: 'usage', label: 'Usage' },
  { id: 'traces', label: 'Traces' },
  { id: 'cache', label: 'Cache' },
  { id: 'tests', label: 'Tests' },
  { id: 'access', label: 'Access' },
];

export default function ControlRoom() {
  const [lane, setLane] = useState<LaneId>('endpoints');
  // Latch: lanes stay mounted once visited (hidden, not unmounted) so
  // returning to a lane never refetches (mission: navigation reads what is
  // already there).
  const [seen, setSeen] = useState<Record<LaneId, boolean>>({
    endpoints: true,
    costs: false,
    usage: false,
    traces: false,
    cache: false,
    tests: false,
    access: false,
  });
  const go = (id: LaneId) => {
    setLane(id);
    setSeen((s) => (s[id] ? s : { ...s, [id]: true }));
  };

  // ── Header signals (light reads, honest dashes) ─────────────────────────
  const [ready, setReady] = useState<{ status?: string; checks?: Record<string, string> } | null>(null);
  const [cache, setCache] = useState<CacheKpis | null>(null);
  const [inv, setInv] = useState<InventoryPage | null>(null);
  const [invState, setInvState] = useState<'idle' | 'preparing' | 'unavailable'>('idle');
  const [tests, setTests] = useState<{ state?: string; [k: string]: unknown } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [r, c, i, t] = await Promise.allSettled([
        getReady(),
        getCacheKpis(),
        getEndpointInventory({ page: 1, page_size: 1 }),
        getLastTestCampaign(),
      ]);
      if (!alive) return;
      if (r.status === 'fulfilled') setReady(r.value);
      if (c.status === 'fulfilled' && !isAdminEnvelope(c.value)) setCache(c.value as CacheKpis);
      if (i.status === 'fulfilled') {
        if (isAdminEnvelope(i.value)) {
          setInvState(i.value.state === 'preparing' ? 'preparing' : 'unavailable');
          // A 'preparing' first answer resolves in the background — one
          // bounded re-read so the tile settles without a manual refresh.
          if (i.value.state === 'preparing') {
            const delay = Math.min(Math.max((i.value.retry_after_seconds ?? 10) * 1000, 4000), 30_000);
            window.setTimeout(() => {
              void getEndpointInventory({ page: 1, page_size: 1 }).then((again) => {
                if (!alive) return;
                if (isAdminEnvelope(again)) {
                  setInvState(again.state === 'preparing' ? 'preparing' : 'unavailable');
                } else {
                  setInv(again as InventoryPage);
                }
              }).catch(() => {});
            }, delay);
          }
        } else {
          setInv(i.value as InventoryPage);
        }
      }
      if (t.status === 'fulfilled') setTests(t.value as { state?: string });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const kpis = useMemo<KpiItem[]>(() => {
    const checks = ready?.checks ?? null;
    const checksBad = checks ? Object.values(checks).filter((v) => v !== 'ok').length : null;
    // Statuses live under totals.by_status (probed live) — keep a flat-key
    // fallback in case the artifact schema evolves.
    const totals = inv?.totals as
      | { by_status?: Record<string, number>; KEEP?: number; UNKNOWN?: number }
      | undefined;
    const keep = totals?.by_status?.KEEP ?? totals?.KEEP ?? null;
    const unknown = totals?.by_status?.UNKNOWN ?? totals?.UNKNOWN ?? null;
    return [
      {
        label: 'Backend',
        value: ready ? (ready.status === 'ready' ? 'ready' : ready.status ?? '—') : undefined,
        dot: ready ? (checksBad === 0 ? 'ok' : 'blocker') : 'idle',
        sub: checks
          ? Object.entries(checks)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · ')
          : undefined,
        title: 'Live readiness checks of the local backend',
      },
      {
        label: 'Endpoints',
        value: inv ? `${(keep ?? 0).toLocaleString()}/${inv.total.toLocaleString()}` : undefined,
        dot: inv
          ? (unknown ?? 0) > 0
            ? 'warn'
            : 'ok'
          : invState === 'preparing'
            ? 'pending'
            : invState === 'unavailable'
              ? 'warn'
              : 'idle',
        sub: inv
          ? `${(unknown ?? 0).toLocaleString()} unknown`
          : invState === 'preparing'
            ? 'inventory generating…'
            : invState === 'unavailable'
              ? 'inventory unavailable'
              : undefined,
        onClick: () => go('endpoints'),
        title: 'Kept operations / total in the live endpoint inventory',
      },
      {
        label: 'Cache hit rate',
        value: cache?.hit_rate != null ? `${cache.hit_rate.toFixed(1)}%` : undefined,
        dot: cache ? (cache.hit_rate != null && cache.hit_rate >= 60 ? 'ok' : 'warn') : 'idle',
        sub: cache?.total_keys != null ? `${cache.total_keys.toLocaleString()} keys` : undefined,
        onClick: () => go('cache'),
        title: 'Shared cache effectiveness (live)',
      },
      {
        label: 'Test campaign',
        value: tests ? (tests.state === 'unavailable' ? '—' : 'recorded') : undefined,
        dot: tests ? (tests.state === 'unavailable' ? 'idle' : 'ok') : 'idle',
        sub: tests?.state === 'unavailable' ? 'none recorded yet' : undefined,
        onClick: () => go('tests'),
        title: 'Latest backend test campaign artifact',
      },
    ];
  }, [ready, cache, inv, invState, tests]);

  return (
    <div className="space-y-3 @container">
      {/* Context row */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Administration
        </h1>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          control room — runtime, endpoints, costs, access · restricted to ACCOUNTADMIN
        </span>
      </div>

      {/* ONE KPI row */}
      <KpiStrip items={kpis} />

      {/* Lane bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-700" role="tablist" aria-label="Administration lanes">
        {LANES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={lane === l.id}
            onClick={() => go(l.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              lane === l.id
                ? 'bg-accent-600 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Lanes — mounted once visited, hidden when inactive */}
      {seen.endpoints && (
        <div hidden={lane !== 'endpoints'}>
          <EndpointsInventoryPanel isAdmin />
        </div>
      )}
      {seen.costs && (
        <div hidden={lane !== 'costs'}>
          <CostByUserPanel />
        </div>
      )}
      {seen.usage && (
        <div hidden={lane !== 'usage'}>
          <UsagePanel />
        </div>
      )}
      {seen.traces && (
        <div hidden={lane !== 'traces'}>
          <TracesPanel />
        </div>
      )}
      {seen.cache && (
        <div hidden={lane !== 'cache'}>
          <CacheHealthPanel />
        </div>
      )}
      {seen.tests && (
        <div hidden={lane !== 'tests'}>
          <TestsCampaignPanel />
        </div>
      )}
      {seen.access && (
        <div hidden={lane !== 'access'}>
          <AccessPanel />
        </div>
      )}
    </div>
  );
}
