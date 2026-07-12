'use client';

/**
 * ProjectScoreBadges — a compact, reusable row of per-project health badges:
 * **Cost ($ est) · DQ · Storage · Perf · Gov**.
 *
 * Data sources (both optional, both honest):
 *   · `GET /command-center/projects/{id}/scores` (via `getProjectScoreCards`)
 *     → dq / cost / perf / gov values, each flagged `scope: project | account`.
 *   · `GET /workflow/{id}/cost-summary` (when `includeWorkflowCost`) → the
 *     estimated USD figure for the Cost badge (workflow_id === project_id in
 *     the unified projects model).
 *
 * Honesty rules:
 *   · Loading → skeleton chips. Both sources 404/unavailable → renders nothing.
 *   · Account-scoped values are tinted neutral + tooltip says "account-level".
 *   · Storage has NO per-project source today (needs QUERY_TAG / object
 *     attribution) → always "—" with an explicit tooltip, never a faked number.
 *
 * Inline-only markup (spans), so it can sit inside a header `<p>` next to the
 * project title. Reusable from workflow, explore-design and bi-dashboard.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getProjectScoreCards,
  type ScoreCard,
} from '@/app/services/command-center/score-cards';
import { getWorkflowCostSummary } from '@/app/services/api/workflowApi';
import type { WorkflowCostSummary } from '@/app/services/api/types';

export interface ProjectScoreBadgesProps {
  /** The project (or workflow — same id space) to score. */
  projectId: string;
  /** Optional lookback window in days (backend default: 30). */
  days?: number;
  /**
   * Also fetch `GET /workflow/{id}/cost-summary` for an estimated USD figure on
   * the Cost badge. Enable only for workflow projects.
   */
  includeWorkflowCost?: boolean;
  className?: string;
}

interface BadgeModel {
  key: string;
  label: string;
  value: string;
  tooltip: string;
  tone: string;
}

const TONE_PROJECT =
  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300';
const TONE_ACCOUNT =
  'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300';
const TONE_ESTIMATE =
  'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300';
const TONE_EMPTY =
  'border-slate-200 bg-transparent text-slate-400 dark:border-slate-700 dark:text-slate-500';

function fmtNumber(v: number | string | null | undefined): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function scoreBadge(label: string, card: ScoreCard | undefined): BadgeModel {
  const hasValue = card != null && card.value != null;
  const scope = card?.scope ?? 'account';
  const value = hasValue ? `${fmtNumber(card.value)}${card.unit ? ` ${card.unit}` : ''}` : '—';
  const tooltip = !hasValue
    ? `${card?.label ?? label}: not computed yet${card?.note ? ` — ${card.note}` : ''}`
    : scope === 'project'
      ? `${card.label}: scored from this project's own data`
      : `${card.label}: account-level — no per-project attribution for this dimension yet`;
  return {
    key: label.toLowerCase(),
    label,
    value,
    tooltip,
    tone: !hasValue ? TONE_EMPTY : scope === 'project' ? TONE_PROJECT : TONE_ACCOUNT,
  };
}

export default function ProjectScoreBadges({
  projectId,
  days,
  includeWorkflowCost = false,
  className,
}: ProjectScoreBadgesProps) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ScoreCard[] | null>(null);
  const [cost, setCost] = useState<WorkflowCostSummary | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setCards(null);
    setCost(null);
    // Both fetches degrade independently — a 404 on either is NOT an error
    // state, it just removes that data source (and possibly the whole row).
    const scoresP = getProjectScoreCards(projectId, days).catch(() => null);
    const costP = includeWorkflowCost
      ? getWorkflowCostSummary(projectId).catch(() => null)
      : Promise.resolve(null);
    void Promise.all([scoresP, costP]).then(([scores, costSummary]) => {
      if (ignore) return;
      setCards(scores);
      setCost(costSummary);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [projectId, days, includeWorkflowCost]);

  if (loading) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 align-middle', className)}
        aria-hidden="true"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="inline-block h-4 w-12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700"
          />
        ))}
      </span>
    );
  }

  // Nothing available (scores 404 and no cost source) → render nothing at all.
  if (cards == null && cost == null) return null;

  const byDim = (d: ScoreCard['dimension']) => cards?.find((c) => c.dimension === d);

  // Cost badge — prefer the workflow's estimated USD (transparent "$ est"),
  // fall back to the scores' cost dimension, else honest "—".
  const costCard = byDim('cost');
  const costBadge: BadgeModel =
    cost?.estimated_cost_usd != null
      ? {
          key: 'cost',
          label: 'Cost',
          value: `$${fmtNumber(cost.estimated_cost_usd)} est`,
          tooltip:
            'Estimated cost (USD) from attributed data warehouse credits — an estimate, not billed spend',
          tone: TONE_ESTIMATE,
        }
      : scoreBadge('Cost', costCard);

  // Scores endpoint unavailable (404) → don't render hollow "—" score badges;
  // show only what we truly have (the workflow cost estimate).
  const badges: BadgeModel[] =
    cards == null
      ? [costBadge]
      : [
          costBadge,
          scoreBadge('DQ', byDim('dq')),
          {
            key: 'storage',
            label: 'Storage',
            value: '—',
            tooltip:
              'No per-project storage attribution yet — storage is only measured account-wide today',
            tone: TONE_EMPTY,
          },
          scoreBadge('Perf', byDim('perf')),
          scoreBadge('Gov', byDim('gov')),
        ];

  return (
    <span
      className={cn('inline-flex flex-wrap items-center gap-1 align-middle', className)}
      aria-label="Project health badges"
      data-testid="project-score-badges"
    >
      {badges.map((b) => (
        <span
          key={b.key}
          title={b.tooltip}
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-semibold leading-4',
            b.tone,
          )}
        >
          <span className="uppercase tracking-wide">{b.label}</span>
          <span className="font-mono font-medium normal-case">{b.value}</span>
        </span>
      ))}
    </span>
  );
}
