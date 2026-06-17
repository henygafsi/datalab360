'use client';

/**
 * ProjectStatusBadges — Office365-style status cluster for the BI dashboard
 * top bar: a draft/live pill + four compact KPI badges (DQ · COST · PERF · GOV)
 * + a usage indicator. Self-contained: give it a projectId and it fetches.
 *
 * Honesty rules (per project memory):
 *   · Null/unavailable KPI values render "—", NEVER a fake 0.
 *   · Per-project score cards flag `scope: 'account'` when a dimension can only
 *     be answered account-wide — we label that so account data is never shown
 *     as if it were per-project.
 *   · Credits are intentionally null (not attributable on a shared warehouse);
 *     we surface the render-activity usage proxy instead.
 *   · A 404/501 from a not-yet-provisioned route = quiet muted state, no error.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowUpRight, Activity, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getProjectScoreCards,
  ScoreCardsUnavailableError,
  type ScoreCard,
  type KpiDimension,
} from '@/app/services/command-center/score-cards';
import {
  getDashboardCost,
  isBiRouteUnavailable,
  type DashboardCost,
} from '@/app/services/api/biDashboardApi';
import { useDashboardStatus } from './useDashboardStatus';

const DIM_ABBR: Record<KpiDimension, string> = {
  dq: 'DQ',
  cost: 'COST',
  perf: 'PERF',
  gov: 'GOV',
};

function fmtValue(card: ScoreCard): string {
  if (card.value == null) return '—';
  const v = typeof card.value === 'number'
    ? (Number.isInteger(card.value) ? String(card.value) : card.value.toFixed(1))
    : String(card.value);
  if (!card.unit) return v;
  return card.unit === '%' ? `${v}%` : `${v} ${card.unit}`;
}

function dotClass(card: ScoreCard): string {
  if (card.status === 'ok') return 'bg-emerald-500';
  if (card.status === 'error') return 'bg-red-400';
  return 'bg-gray-300 dark:bg-gray-600'; // not_computed / account-fallback
}

function StatusPill({ status }: { status: 'draft' | 'live' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        status === 'live'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      )}
      title={status === 'live' ? 'Published — visible to people it is shared with' : 'Draft — not yet published'}
    >
      {status === 'live' ? <ShieldCheck className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
      {status === 'live' ? 'Live' : 'Draft'}
    </span>
  );
}

export default function ProjectStatusBadges({ projectId }: { projectId: string }) {
  const live = useDashboardStatus(projectId);

  const [cards, setCards] = useState<ScoreCard[] | null>(null);
  const [scoresUnavailable, setScoresUnavailable] = useState(false);
  const [scoresLoading, setScoresLoading] = useState(true);

  const [cost, setCost] = useState<DashboardCost | null>(null);
  const [costUnavailable, setCostUnavailable] = useState(false);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Per-project DQ/COST/PERF/GOV cards.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setScoresLoading(true);
    getProjectScoreCards(projectId)
      .then((c) => { if (alive) { setCards(c); setScoresUnavailable(false); } })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ScoreCardsUnavailableError) setScoresUnavailable(true);
        setCards(null);
      })
      .finally(() => { if (alive) setScoresLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  // Per-dashboard usage/cost proxy.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    getDashboardCost(projectId)
      .then((c) => { if (alive) { setCost(c); setCostUnavailable(false); } })
      .catch((err) => {
        if (!alive) return;
        if (isBiRouteUnavailable(err)) setCostUnavailable(true);
        setCost(null);
      });
    return () => { alive = false; };
  }, [projectId]);

  // Close popover on outside-click / Escape.
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenKey(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey]);

  const renderCount = cost?.render_activity?.render_count ?? null;
  const usageText = cost == null
    ? '—'
    : renderCount != null
      ? `${renderCount}`
      : '—';

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {/* Draft / live pill */}
      <StatusPill status={live.status} />

      <span className="hidden h-4 w-px bg-gray-200 dark:bg-gray-700 sm:block" />

      {/* KPI badges */}
      <div className="flex items-center gap-1">
        {(['dq', 'cost', 'perf', 'gov'] as KpiDimension[]).map((dim) => {
          const card = cards?.find((c) => c.dimension === dim) ?? null;
          const open = openKey === dim;
          const muted = scoresUnavailable || card == null || card.value == null;
          return (
            <button
              key={dim}
              type="button"
              onClick={() => setOpenKey(open ? null : dim)}
              aria-expanded={open}
              title={`${DIM_ABBR[dim]} — open details`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                open
                  ? 'border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-200'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
              )}
            >
              {card && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass(card))} />}
              <span className="font-semibold">{DIM_ABBR[dim]}</span>
              <span className={cn('tabular-nums', muted && 'text-gray-400 dark:text-gray-500')}>
                {scoresLoading && !cards ? '·' : card ? fmtValue(card) : '—'}
              </span>
            </button>
          );
        })}

        {/* Usage indicator */}
        <button
          type="button"
          onClick={() => setOpenKey(openKey === 'usage' ? null : 'usage')}
          aria-expanded={openKey === 'usage'}
          title="Usage — renders & cost"
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
            openKey === 'usage'
              ? 'border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-200'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
          )}
        >
          <Activity className="h-3 w-3" />
          <span className={cn('tabular-nums', usageText === '—' && 'text-gray-400 dark:text-gray-500')}>
            {usageText}
          </span>
        </button>
      </div>

      {/* Popover */}
      {openKey && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setOpenKey(null)}
            aria-label="Close"
            className="absolute right-2 top-2 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {openKey === 'usage'
            ? <UsagePopover cost={cost} unavailable={costUnavailable} />
            : <KpiPopover card={cards?.find((c) => c.dimension === openKey) ?? null} unavailable={scoresUnavailable} />}
        </div>
      )}
    </div>
  );
}

function KpiPopover({ card, unavailable }: { card: ScoreCard | null; unavailable: boolean }) {
  if (unavailable) {
    return (
      <div className="pr-5">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Score cards</p>
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          Per-project scores aren’t provisioned on this backend yet.
        </p>
      </div>
    );
  }
  if (!card) {
    return <p className="pr-5 text-[11px] text-gray-500 dark:text-gray-400">No data.</p>;
  }
  const accountScoped = card.scope === 'account';
  return (
    <div className="pr-5">
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{card.label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{fmtValue(card)}</p>
      {accountScoped && (
        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          account-level (not per-project)
        </span>
      )}
      {card.status === 'error' && (
        <p className="mt-1 text-[11px] text-red-500">Couldn’t compute this score.</p>
      )}
      {card.status === 'not_computed' && !accountScoped && (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Not computed for this project yet.</p>
      )}
      {card.note && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{card.note}</p>}
      <Link
        href="/account-overview"
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-700 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300"
      >
        Open Account Overview
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function UsagePopover({ cost, unavailable }: { cost: DashboardCost | null; unavailable: boolean }) {
  if (unavailable || cost == null) {
    return (
      <div className="pr-5">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Usage</p>
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          {unavailable ? 'Usage telemetry isn’t provisioned on this backend yet.' : 'No usage data.'}
        </p>
      </div>
    );
  }
  const ra = cost.render_activity;
  return (
    <div className="pr-5">
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Usage</p>
      <dl className="mt-1 space-y-1 text-[11px]">
        <Row k="Credits" v="— (not attributable)" />
        <Row k="Renders" v={ra?.render_count != null ? String(ra.render_count) : '—'} />
        <Row k="Distinct viewers" v={ra?.distinct_users != null ? String(ra.distinct_users) : '—'} />
        <Row k="Widgets" v={cost.widget_count != null ? String(cost.widget_count) : '—'} />
        <Row k="Last rendered" v={ra?.last_rendered ? new Date(ra.last_rendered).toLocaleDateString() : '—'} />
      </dl>
      <p className="mt-2 text-[10px] italic leading-snug text-gray-400 dark:text-gray-500">
        Credits aren’t attributable per dashboard on a shared warehouse — renders are the honest usage proxy.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
      <dd className="font-medium text-gray-800 dark:text-gray-200">{v}</dd>
    </div>
  );
}
