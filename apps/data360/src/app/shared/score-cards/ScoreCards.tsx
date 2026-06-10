'use client';

/**
 * ScoreCards — a reusable, responsive row of compact health cards (Data360 G6).
 *
 * Renders DQ · COST · PERF · GOV · PREVISION (forecast placeholder). Each card
 * shows a dimension label, a big headline value (or "—" when null/not computed),
 * its unit, a recommendations badge ("{open} recos · {critical} critical"), and
 * a severity accent. Dark-mode aware; handles loading (skeletons) / error /
 * empty branches.
 *
 * Reusable per-page and per-project via props:
 *   <ScoreCards />                              // all 5 cards, default window
 *   <ScoreCards days={7} />                     // 7-day window
 *   <ScoreCards dimensions={['dq', 'gov']} />   // subset / reorder
 *
 * Data: `getScoreCards` (services/command-center/score-cards) fetches the four
 * `kpis/{dimension}` + `recommendations` in parallel. A fetch-effect with an
 * `ignore` cleanup flag prevents setState after unmount / stale responses — no
 * SWR or localStorage cache (nothing here is worth persisting).
 */
// ////dependency//// shared.score-cards → services.command-center.score-cards
import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  getScoreCards,
  getProjectScoreCards,
  type ScoreCard,
  type ScoreCardDimension,
} from '@/app/services/command-center/score-cards';

export type { ScoreCardDimension } from '@/app/services/command-center/score-cards';

interface ScoreCardsProps {
  /** ACCOUNT_USAGE window in days (defaults to the backend default, 30). */
  days?: number;
  /** Optional subset / reordering of cards. Defaults to all five. */
  dimensions?: ScoreCardDimension[];
  /**
   * When set, scope the cards to a single project via
   * `GET /command-center/projects/{id}/scores`. Each card then carries a
   * `scope` ("project" | "account") that the UI labels honestly — account-level
   * fallbacks (e.g. COST) are marked as such, never shown as per-project. When
   * omitted, behaviour is unchanged: account-wide `getScoreCards`.
   *
   * Note: the PREVISION placeholder has no per-project source, so the project
   * path never returns it (DEFAULT_DIMENSIONS still applies in account mode).
   */
  projectId?: string;
}

const DEFAULT_DIMENSIONS: ScoreCardDimension[] = [
  'dq',
  'cost',
  'perf',
  'gov',
  'prevision',
];

// ── Presentation helpers ────────────────────────────────────────────────────

/**
 * Accent color per card. Severity is driven by the recommendations tally
 * (critical recos = red, open recos = amber), then falls back to the KPI
 * status. Unknown / not-computed reads neutral — never throws or blanks.
 */
function cardAccent(card: ScoreCard): string {
  if (card.status === 'not_computed') return 'text-gray-400 dark:text-gray-500';
  if (card.status === 'error') return 'text-gray-400 dark:text-gray-500';
  if (card.criticalRecos > 0) return 'text-red-600 dark:text-red-400';
  if (card.openRecos > 0) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

/** Display string for the headline value. */
function formatValue(card: ScoreCard): string {
  if (card.value == null) return '—';
  return typeof card.value === 'number'
    ? card.value.toLocaleString()
    : String(card.value);
}

// ── Sub-components (module top level — no inline definitions) ────────────────

function CardSkeleton() {
  return (
    <div
      className="h-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse"
      aria-hidden="true"
    />
  );
}

function RecoBadge({ card }: { card: ScoreCard }) {
  const tone =
    card.criticalRecos > 0
      ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
      : card.openRecos > 0
        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400';
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {card.openRecos} recos · {card.criticalRecos} critical
    </span>
  );
}

/**
 * Honest scope chip. Only rendered when a card carries a `scope` (i.e. the
 * per-project path). "project" = real per-project value; "account" = an
 * account-level fallback shown in a project context — labelled so it is never
 * mistaken for per-project data.
 */
function ScopeChip({ scope }: { scope: 'project' | 'account' }) {
  const isProject = scope === 'project';
  return (
    <span
      title={
        isProject
          ? 'Scored from this project’s own data'
          : 'Account-level — no per-project source for this dimension'
      }
      className={
        isProject
          ? 'inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
          : 'inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      }
    >
      {isProject ? 'project' : 'account-level'}
    </span>
  );
}

function ScoreCardItem({ card }: { card: ScoreCard }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {card.label}
        </span>
        {card.scope ? (
          <ScopeChip scope={card.scope} />
        ) : card.note ? (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            {card.note}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-semibold ${cardAccent(card)}`}>
          {formatValue(card)}
        </span>
        {card.unit && card.value != null ? (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {card.unit}
          </span>
        ) : null}
      </div>
      {/* Project cards have no recos; show the scope rationale note instead so
          an account-level fallback (e.g. COST) explains itself honestly. */}
      {card.scope ? (
        card.note ? (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-tight">
            {card.note}
          </span>
        ) : null
      ) : (
        <RecoBadge card={card} />
      )}
    </div>
  );
}

function ScoreCardsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        Couldn’t load score cards.
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

// Project scope has no PREVISION source — default to the four live dimensions.
const PROJECT_DIMENSIONS: ScoreCardDimension[] = ['dq', 'cost', 'perf', 'gov'];

export default function ScoreCards({ days, dimensions, projectId }: ScoreCardsProps) {
  const [cards, setCards] = useState<ScoreCard[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setError(false);
    setCards(null);
    // projectId set → honest per-project scores; otherwise unchanged account-wide.
    const load = projectId
      ? getProjectScoreCards(projectId, days)
      : getScoreCards(days);
    load
      .then((result) => {
        if (!ignore) setCards(result);
      })
      .catch(() => {
        if (!ignore) setError(true);
      });
    return () => {
      ignore = true;
    };
  }, [days, projectId, reloadKey]);

  const wanted =
    dimensions ?? (projectId ? PROJECT_DIMENSIONS : DEFAULT_DIMENSIONS);
  const gridClass =
    'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3';

  if (error) {
    return <ScoreCardsError onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  if (cards === null) {
    return (
      <div className={gridClass}>
        {wanted.map((d) => (
          <CardSkeleton key={d} />
        ))}
      </div>
    );
  }

  // Honor the order of `wanted` (subset + reorder), not the fixed card order.
  const visible = wanted
    .map((d) => cards.find((c) => c.dimension === d))
    .filter((c): c is ScoreCard => c != null);

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
        No score cards to show.
      </div>
    );
  }

  return (
    <div className={gridClass}>
      {visible.map((card) => (
        <ScoreCardItem key={card.dimension} card={card} />
      ))}
    </div>
  );
}
