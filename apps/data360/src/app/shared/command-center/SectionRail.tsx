'use client';

/**
 * SectionRail — the Command Center's right-edge section navigator
 * (2026-07-10 tabbed redesign: "no one-page lifetime scroll").
 *
 * One entry per section (the 9 former stacked sections are now TABS); each
 * entry pairs its icon + label with per-axis highlight chips
 * (DQ · GOV · COST · PERF) fed by the EXISTING score-cards service
 * (`GET /command-center/kpis/{dimension}` + `/recommendations` — no new
 * endpoints). Chips are bucket-colored by the cockpit severity convention
 * (emerald = OK · amber = open recos · red = critical · slate = unknown) and
 * render an honest "—" on degrade — never a fabricated zero.
 *
 * The Security entry additionally carries the pending access-requests count
 * as a badge (same `getInbox`/`getMyRequests` services the inline
 * Access Requests card uses).
 *
 * Responsive: vertical w-64 rail on md+, collapses to a horizontal strip on
 * small screens (single instance — CSS switches the layout, state is shared).
 */

import React, { useEffect, useMemo, useState } from 'react';
import cn from '@core/utils/class-names';
import {
  getScoreCards,
  ScoreCardsUnavailableError,
  type KpiDimension,
  type ScoreCard,
} from '@/app/services/command-center/score-cards';
import { getInbox, getMyRequests } from '@/app/services/access-requests';
import AccountHealthBlock from './AccountHealthBlock';
import { useAuth } from '@/hooks/useAuth';

// ─── Public types ────────────────────────────────────────────────────────────

export interface RailSection {
  id: string;
  label: string;
  icon: React.ElementType;
}

export interface SectionRailProps {
  sections: RailSection[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Global time window (days) driving the score-cards fetch. */
  days: number;
  /**
   * Optional: open the docked axis-cockpit panel for a KPI dimension when a
   * chip is clicked (dimension → cockpit axis mapping happens in the caller).
   */
  onOpenDimension?: (dimension: KpiDimension) => void;
  className?: string;
}

// ─── Section → relevant axes map ─────────────────────────────────────────────
// Which health axes each section actually speaks for. Values come from ONE
// account-wide score-cards fetch, so a dimension chip shows the same honest
// figure wherever it appears — the rail is an "overview by axis".

const SECTION_AXES: Record<string, KpiDimension[]> = {
  overview: ['dq', 'gov', 'cost', 'perf'],
  'dwh-plan': ['cost', 'perf'],
  'snowflake-objects': ['dq'],
  finops: ['cost'],
  modules: ['dq', 'perf'],
  'platform-activity': ['perf'],
  projects: ['dq', 'gov'],
  security: ['gov'],
  organization: ['gov', 'cost'],
};

const AXIS_SHORT: Record<KpiDimension, string> = {
  dq: 'DQ',
  gov: 'GOV',
  cost: 'COST',
  perf: 'PERF',
};

// Purge-safe literal class maps — severity buckets follow the shared cockpit
// convention (emerald OK · amber warn · red blocker · slate unknown).
type ChipBucket = 'ok' | 'warn' | 'blocker' | 'idle';

const CHIP_BUCKET_CLS: Record<ChipBucket, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
  blocker:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300',
  idle: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400',
};

function chipBucket(card: ScoreCard | undefined): ChipBucket {
  if (!card || card.status !== 'ok') return 'idle';
  if (card.criticalRecos > 0) return 'blocker';
  if (card.openRecos > 0) return 'warn';
  return 'ok';
}

/** Compact honest value: null → "—", 1234.5 → "1.2k", 82 + "%" → "82%". */
function chipValue(card: ScoreCard | undefined): string {
  const v = card?.value;
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const compact =
    Math.abs(n) >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const unit = card?.unit === '%' ? '%' : '';
  return `${compact}${unit}`;
}

// ─── Pending access-requests badge source ────────────────────────────────────

const ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];

function usePendingAccessCount(): number | null {
  const { role: authRole } = useAuth();
  const isAdmin = ADMIN_ROLES.includes((authRole ?? '').toUpperCase());
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchCount = isAdmin ? getInbox() : getMyRequests();
    fetchCount
      .then((res) => {
        if (!alive) return;
        const pending = (res.requests ?? []).filter(
          (r) => (r.STATUS ?? '').toUpperCase() === 'PENDING',
        ).length;
        setCount(res.count ?? pending);
      })
      // Degrade silently — the badge simply doesn't render (never fake 0).
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  return count;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SectionRail({
  sections,
  activeId,
  onSelect,
  days,
  onOpenDimension,
  className,
}: SectionRailProps) {
  const [cards, setCards] = useState<ScoreCard[] | null>(null);
  const [cardsStatus, setCardsStatus] = useState<
    'loading' | 'ready' | 'unavailable' | 'error'
  >('loading');

  useEffect(() => {
    let alive = true;
    setCardsStatus('loading');
    getScoreCards(days)
      .then((c) => {
        if (!alive) return;
        setCards(c);
        setCardsStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setCardsStatus(
          e instanceof ScoreCardsUnavailableError ? 'unavailable' : 'error',
        );
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const byDimension = useMemo(() => {
    const map = new Map<string, ScoreCard>();
    (cards ?? []).forEach((c) => map.set(c.dimension, c));
    return map;
  }, [cards]);

  const pendingAccess = usePendingAccessCount();

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    // WAI-ARIA tabs pattern: arrows move + select; Home/End jump to edges.
    let next: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % sections.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
      next = (idx - 1 + sections.length) % sections.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = sections.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = sections[next];
    onSelect(target.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`cc-rail-tab-${target.id}`)?.focus();
    });
  };

  return (
    <nav
      aria-label="Account overview sections"
      className={cn(
        // Horizontal strip on small screens, vertical w-64 rail on md+.
        'no-scrollbar flex shrink-0 flex-row gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900',
        'md:w-64 md:flex-col md:gap-1 md:overflow-y-auto md:overflow-x-hidden md:p-2',
        className,
      )}
    >
      {/* Wave 2: the shared "Snowflake account health" pulse — vertical rail
          only (the small-screen horizontal strip has no room for it). */}
      <AccountHealthBlock className="mb-1 hidden md:block" />
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="Account overview section tabs"
        className="contents"
      >
        {sections.map((s, idx) => {
          const Icon = s.icon;
          const isActive = s.id === activeId;
          const axes = SECTION_AXES[s.id] ?? [];
          const showPendingBadge =
            s.id === 'security' && pendingAccess != null && pendingAccess > 0;
          return (
            <button
              key={s.id}
              id={`cc-rail-tab-${s.id}`}
              role="tab"
              type="button"
              // Chips/badges live inside the button — pin the accessible name
              // to the section label so AT + tests address tabs by name.
              aria-label={s.label}
              aria-selected={isActive}
              aria-current={isActive ? 'true' : undefined}
              aria-controls={`cc-panel-${s.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              className={cn(
                'group flex shrink-0 flex-col gap-1 rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isActive
                  ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-800/60 dark:bg-indigo-950/40'
                  : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60',
              )}
            >
              <span className="flex items-center gap-2">
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'truncate text-xs font-semibold',
                    isActive
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-300',
                  )}
                >
                  {s.label}
                </span>
                {showPendingBadge && (
                  <span
                    title={`${pendingAccess} pending access request${pendingAccess === 1 ? '' : 's'}`}
                    className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  >
                    {pendingAccess}
                  </span>
                )}
              </span>
              {/* Per-axis highlight chips — hidden on the small horizontal
                  strip to keep it one thin row. */}
              {axes.length > 0 && (
                <span
                  className="hidden flex-wrap gap-1 md:flex"
                  data-testid={`cc-rail-chips-${s.id}`}
                >
                  {axes.map((dim) => {
                    const card = byDimension.get(dim);
                    if (cardsStatus === 'loading') {
                      return (
                        <span
                          key={dim}
                          className="h-4 w-12 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800"
                          aria-hidden
                        />
                      );
                    }
                    const bucket = chipBucket(card);
                    const value = chipValue(card);
                    const chipTitle =
                      card && card.status === 'ok'
                        ? `${card.label}: ${value}${card.criticalRecos > 0 ? ` · ${card.criticalRecos} critical` : card.openRecos > 0 ? ` · ${card.openRecos} open recos` : ''}`
                        : `${AXIS_SHORT[dim]} — no data right now`;
                    return (
                      <span
                        key={dim}
                        role={onOpenDimension ? 'button' : undefined}
                        tabIndex={-1}
                        title={chipTitle}
                        onClick={
                          onOpenDimension
                            ? (e) => {
                                e.stopPropagation();
                                onOpenDimension(dim);
                              }
                            : undefined
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-bold tabular-nums leading-4',
                          CHIP_BUCKET_CLS[bucket],
                          onOpenDimension && 'cursor-pointer',
                        )}
                      >
                        {AXIS_SHORT[dim]}
                        <span className="font-semibold">{value}</span>
                      </span>
                    );
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
