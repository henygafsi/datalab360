'use client';

/**
 * SectionTabs — the Account Overview section navigator, as a HORIZONTAL top
 * tab bar (2026-08-24 redesign). Replaces the old right-edge vertical
 * SectionRail, which stole ~300px of analytical width and read as a hard-to-
 * see second sidebar. Ten tabs sit in one full-width row directly under the
 * page header; each carries a short label + a 3-STATE DOT (healthy → no dot;
 * amber = attention/open recos; red = critical) derived from the single axis
 * that section owns — replacing the old DQ/GOV/COST/PERF numeric badge
 * pollution ("is 25.8 good or bad?"). Detailed metrics live inside the tab.
 *
 * WAI-ARIA tabs pattern preserved: role=tablist/tab, roving tabindex, arrow /
 * Home / End keyboard nav.
 */
import { useEffect, useMemo, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getScoreCards,
  ScoreCardsUnavailableError,
  type ScoreCard,
  type KpiDimension,
} from '@/app/services/command-center/score-cards';
import { useState } from 'react';

export interface TabSection {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface SectionTabsProps {
  sections: TabSection[];
  activeId: string;
  onSelect: (id: string) => void;
  days: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

// Short labels so ten tabs fit one row at 1280px without overflow.
const SHORT: Record<string, string> = {
  account: 'Account',
  'usage-performance': 'Usage',
  finops: 'FinOps',
  'data-objects': 'Objects',
  'data-quality': 'Quality',
  security: 'Security',
  'platform-activity': 'Activity',
  projects: 'Projects',
  organization: 'Organization',
  actions: 'Actions',
};

// The single axis each section OWNS (dot source). null → no dot: the section's
// health is expressed inside the tab, not repeated in the nav.
const SECTION_AXIS: Record<string, KpiDimension | null> = {
  account: null,
  'usage-performance': 'perf',
  finops: 'cost',
  'data-objects': 'dq',
  'data-quality': 'dq',
  security: 'gov',
  'platform-activity': null,
  projects: null,
  organization: null,
  actions: null,
};

type Bucket = 'warn' | 'crit';
function bucket(card: ScoreCard | undefined): Bucket | null {
  if (!card || card.status !== 'ok') return null;
  if (card.criticalRecos > 0) return 'crit';
  if (card.openRecos > 0) return 'warn';
  return null; // healthy → no dot (color only on attention)
}
const DOT: Record<Bucket, string> = {
  warn: 'bg-amber-500',
  crit: 'bg-red-500',
};
const DOT_TITLE: Record<Bucket, string> = {
  warn: 'Attention — open recommendations',
  crit: 'Critical findings',
};

export default function SectionTabs({
  sections,
  activeId,
  onSelect,
  days,
  onRefresh,
  refreshing,
  className,
}: SectionTabsProps) {
  const [cards, setCards] = useState<ScoreCard[] | null>(null);

  useEffect(() => {
    let alive = true;
    getScoreCards(days)
      .then((c) => alive && setCards(c))
      .catch((e) => {
        // Unavailable/error → simply no dots; never blocks the nav.
        if (e instanceof ScoreCardsUnavailableError) return;
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const byDim = useMemo(() => {
    const m = new Map<string, ScoreCard>();
    (cards ?? []).forEach((c) => m.set(c.dimension, c));
    return m;
  }, [cards]);

  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % sections.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + sections.length) % sections.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = sections.length - 1;
    else return;
    e.preventDefault();
    onSelect(sections[next].id);
    requestAnimationFrame(() => btnRefs.current[next]?.focus());
  };

  return (
    <div
      className={cn(
        'flex shrink-0 items-stretch border-b border-slate-200 dark:border-slate-800',
        className,
      )}
    >
      <div
        role="tablist"
        aria-label="Account overview sections"
        aria-orientation="horizontal"
        className="no-scrollbar flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto"
      >
        {sections.map((s, idx) => {
          const Icon = s.icon;
          const active = s.id === activeId;
          const axis = SECTION_AXIS[s.id];
          const b = axis ? bucket(byDim.get(axis)) : null;
          return (
            <button
              key={s.id}
              ref={(el) => { btnRefs.current[idx] = el; }}
              id={`cc-rail-tab-${s.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-current={active ? 'true' : undefined}
              aria-controls={`cc-panel-${s.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500',
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <Icon
                className={cn('h-4 w-4', active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')}
                aria-hidden
              />
              <span>{SHORT[s.id] ?? s.label}</span>
              {b && (
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', DOT[b])}
                  title={DOT_TITLE[b]}
                  aria-hidden
                />
              )}
              {active && (
                <span
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh this section"
          aria-label="Refresh this section"
          className="ml-1 flex shrink-0 items-center rounded-md px-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden />
        </button>
      )}
    </div>
  );
}
